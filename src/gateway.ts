import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  type CallToolResult,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  PromptListChangedNotificationSchema,
  type Prompt,
  ReadResourceRequestSchema,
  type Resource,
  ResourceListChangedNotificationSchema,
  type ResourceTemplate,
  type Tool,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolInfo, UpstreamState } from "./admin/contract.ts";
import {
  interpolateSpec,
  isStdio,
  loadSecrets,
  type ResolvedProfile,
  SEPARATOR,
  type ServerSpec,
  usedSecretValues,
} from "./config.ts";
import { errorMessage, UserError } from "./errors.ts";

const STATUS_TOOL = `gateway${SEPARATOR}status`;
const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 10 * 60_000;
/** A dead upstream is retried after 1s, 2s, 4s... and never less often than every minute. */
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 60_000;

/** `key` identifies the interpolated spec the upstream was started from, so a reconfigure can tell what changed. */
type Upstream =
  | { name: string; key: string; state: "connecting" }
  | { name: string; key: string; state: "ready"; client: Client }
  | { name: string; key: string; state: "failed"; error: string; retryTimer?: NodeJS.Timeout };

type ConnectPlan = { key: string; spec: ServerSpec; secretValues: string[] } | { key: string; error: string };

type ListKind = "tools" | "prompts" | "resources";
const ALL_KINDS: ListKind[] = ["tools", "prompts", "resources"];

export function qualify(server: string, item: string): string {
  return `${server}${SEPARATOR}${item}`;
}

function split(qualified: string): { server: string; item: string } {
  const at = qualified.indexOf(SEPARATOR);
  if (at <= 0) {
    throw new Error(`"${qualified}" is not a gateway name (expected <server>${SEPARATOR}<name>)`);
  }
  return { server: qualified.slice(0, at), item: qualified.slice(at + SEPARATOR.length) };
}

export function planConnection(spec: ServerSpec, secrets: Record<string, string>): ConnectPlan {
  try {
    const resolved = interpolateSpec(spec, secrets);
    return { key: JSON.stringify(resolved), spec: resolved, secretValues: usedSecretValues(spec, secrets) };
  } catch (error) {
    return { key: `unresolved:${JSON.stringify(spec)}:${errorMessage(error)}`, error: errorMessage(error) };
  }
}

/** Replaces every secret value in `text`, so upstream errors that echo a URL or header stay safe to show and log. */
export function redact(text: string, secretValues: string[]): string {
  let redacted = text;
  for (const value of secretValues) {
    if (value.length >= 4) {
      redacted = redacted.replaceAll(value, "***");
    }
  }
  return redacted;
}

export function transportFor(spec: ServerSpec, stderr: "inherit" | "pipe"): Transport {
  if (isStdio(spec)) {
    return new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      env: { ...getDefaultEnvironment(), ...spec.env },
      cwd: spec.cwd,
      stderr,
    });
  }
  return new StreamableHTTPClientTransport(new URL(spec.url), { requestInit: { headers: spec.headers } });
}

export async function collectPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>) {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms).unref();
  });
  return Promise.race([promise, timeout]);
}

async function closeUpstream(upstream: Upstream | undefined) {
  if (upstream?.state === "failed") {
    clearTimeout(upstream.retryTimer);
  }
  if (upstream?.state === "ready") {
    await upstream.client.close().catch(() => {});
  }
}

/**
 * One pool of upstream connections for a profile. Shared by every downstream session
 * that connects to the same profile.
 */
export class Gateway {
  profile: ResolvedProfile;
  private readonly home: string;
  private readonly upstreams = new Map<string, Upstream>();
  private readonly listeners = new Set<(kind: ListKind) => void>();
  private readonly resourceOwners = new Map<string, string>();

  constructor(home: string, profile: ResolvedProfile) {
    this.home = home;
    this.profile = profile;
  }

  start(): Promise<void> {
    return this.reconfigure(this.profile);
  }

  /**
   * Converges the upstreams on `profile`. Only servers whose interpolated spec changed reconnect,
   * so editing one secret restarts only the servers that use it. Resolves once those have settled.
   */
  async reconfigure(profile: ResolvedProfile): Promise<void> {
    const secrets = loadSecrets(this.home, profile);
    const plans = new Map([...profile.servers].map(([name, spec]) => [name, planConnection(spec, secrets)]));
    const hiddenChanged = !sameEntries(this.profile.hiddenTools, profile.hiddenTools);
    this.profile = profile;

    const pending: Array<Promise<void>> = [];
    for (const name of [...this.upstreams.keys()]) {
      if (!plans.has(name)) {
        const removed = this.upstreams.get(name);
        this.upstreams.delete(name);
        this.forgetResourceOwners(name);
        pending.push(closeUpstream(removed));
      }
    }
    const removedAny = pending.length > 0;
    for (const [name, plan] of plans) {
      if (this.upstreams.get(name)?.key !== plan.key) {
        pending.push(this.connect(name, plan));
      }
    }
    if (removedAny) {
      this.emit(...ALL_KINDS);
    } else if (hiddenChanged) {
      this.emit("tools");
    }
    await Promise.all(pending);
  }

  async reconnect(server: string): Promise<void> {
    const spec = this.profile.servers.get(server);
    if (!spec) {
      throw new UserError("notFound", `Server "${server}" is not in profile "${this.profile.name}"`);
    }
    await this.connect(server, planConnection(spec, loadSecrets(this.home, this.profile)));
  }

  async close(): Promise<void> {
    const upstreams = [...this.upstreams.values()];
    this.upstreams.clear();
    this.resourceOwners.clear();
    await Promise.allSettled(upstreams.map(closeUpstream));
  }

  onListChanged(listener: (kind: ListKind) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async status(): Promise<UpstreamState[]> {
    const toolCounts = new Map((await this.toolLists()).map(({ server, tools }) => [server, tools.length]));
    return [...this.upstreams.values()].map((upstream): UpstreamState => {
      if (upstream.state === "ready") {
        return { server: upstream.name, state: "ready", toolCount: toolCounts.get(upstream.name) ?? 0 };
      }
      if (upstream.state === "failed") {
        return { server: upstream.name, state: "failed", error: upstream.error };
      }
      return { server: upstream.name, state: "connecting" };
    });
  }

  /**
   * Replaces the upstream for `name`. A connect that finishes after its upstream was replaced or removed
   * closes its own client, so a reconfigure never leaves a stray process behind. `failures` counts the
   * connection failures in a row of a retry chain, which a lost connection starts; 0 means no retries.
   */
  private async connect(name: string, plan: ConnectPlan, failures = 0): Promise<void> {
    const previous = this.upstreams.get(name);
    const pending: Upstream = { name, key: plan.key, state: "connecting" };
    this.upstreams.set(name, pending);
    this.forgetResourceOwners(name);
    const closingPrevious = closeUpstream(previous);
    if (previous?.state === "ready") {
      this.emit(...ALL_KINDS);
    }
    if ("error" in plan) {
      this.fail(pending, plan.error);
      await closingPrevious;
      return;
    }
    const client = new Client({ name: `agent-gateway/${this.profile.name}`, version: "0.1.0" });
    client.onclose = () => {
      const current = this.upstreams.get(name);
      if (current?.state === "ready" && current.client === client) {
        this.forgetResourceOwners(name);
        this.retryLater(name, current.key, "connection closed", 1);
        this.emit(...ALL_KINDS);
      }
    };
    try {
      await withTimeout(client.connect(transportFor(plan.spec, "inherit")), CONNECT_TIMEOUT_MS);
    } catch (error) {
      let nextFailures = 0;
      if (failures > 0) {
        nextFailures = failures + 1;
      }
      this.fail(pending, redact(errorMessage(error), plan.secretValues), nextFailures);
      await client.close().catch(() => {});
      await closingPrevious;
      return;
    }
    await closingPrevious;
    if (this.upstreams.get(name) !== pending) {
      await client.close().catch(() => {});
      return;
    }
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => this.emit("tools"));
    client.setNotificationHandler(PromptListChangedNotificationSchema, async () => this.emit("prompts"));
    client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => this.emit("resources"));
    this.upstreams.set(name, { name, key: plan.key, state: "ready", client });
    this.emit(...ALL_KINDS);
  }

  private fail(pending: Upstream, error: string, failures = 0) {
    if (this.upstreams.get(pending.name) !== pending) {
      return;
    }
    process.stderr.write(`[agent-gateway] ${pending.name}: ${error}\n`);
    if (failures > 0) {
      this.retryLater(pending.name, pending.key, error, failures);
      return;
    }
    this.upstreams.set(pending.name, { name: pending.name, key: pending.key, state: "failed", error });
  }

  /**
   * Marks the upstream failed and schedules the next connection attempt, `failures` being the count so far.
   * The timer is cleared whenever the upstream is replaced, removed or the gateway closed, and does nothing
   * if it fires for an upstream that is no longer the current one or no longer in the profile.
   */
  private retryLater(name: string, key: string, reason: string, failures: number) {
    const delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS);
    const failed: Upstream = { name, key, state: "failed", error: `${reason}; retrying in ${delay / 1000}s` };
    failed.retryTimer = setTimeout(() => this.retry(failed, failures), delay);
    failed.retryTimer.unref();
    this.upstreams.set(name, failed);
  }

  private retry(failed: Upstream, failures: number) {
    const spec = this.profile.servers.get(failed.name);
    if (this.upstreams.get(failed.name) !== failed || spec === undefined) {
      return;
    }
    let plan: ConnectPlan;
    try {
      plan = planConnection(spec, loadSecrets(this.home, this.profile));
    } catch (error) {
      this.retryLater(failed.name, failed.key, errorMessage(error), failures + 1);
      return;
    }
    this.connect(failed.name, plan, failures).catch((error: unknown) => {
      process.stderr.write(`[agent-gateway] ${failed.name}: ${errorMessage(error)}\n`);
    });
  }

  /** A resource URI is routed to the server that listed it, so the entries of a server that left or restarted go stale. */
  private forgetResourceOwners(server: string) {
    for (const [uri, owner] of this.resourceOwners) {
      if (owner === server) {
        this.resourceOwners.delete(uri);
      }
    }
  }

  private emit(...kinds: ListKind[]) {
    for (const kind of kinds) {
      for (const listener of this.listeners) {
        listener(kind);
      }
    }
  }

  private ready(capability: ListKind): Array<{ name: string; client: Client }> {
    const ready: Array<{ name: string; client: Client }> = [];
    for (const upstream of this.upstreams.values()) {
      if (upstream.state === "ready" && upstream.client.getServerCapabilities()?.[capability]) {
        ready.push(upstream);
      }
    }
    return ready;
  }

  private clientFor(server: string): Client {
    const upstream = this.upstreams.get(server);
    if (!upstream) {
      throw new Error(`Server "${server}" is not in profile "${this.profile.name}"`);
    }
    if (upstream.state === "failed") {
      throw new Error(`Server "${server}" failed: ${upstream.error}`);
    }
    if (upstream.state === "connecting") {
      throw new Error(`Server "${server}" is still connecting`);
    }
    return upstream.client;
  }

  /** Runs `fetch` on every upstream with the capability; one failing upstream does not hide the rest. */
  private async gather<T>(capability: ListKind, fetch: (name: string, client: Client) => Promise<T[]>) {
    const results = await Promise.allSettled(this.ready(capability).map(({ name, client }) => fetch(name, client)));
    const items: T[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        items.push(...result.value);
      } else {
        process.stderr.write(`[agent-gateway] list ${capability}: ${errorMessage(result.reason)}\n`);
      }
    }
    return items;
  }

  /** Every upstream tool under its qualified name, hidden ones included. */
  private async toolLists(): Promise<Array<{ server: string; tools: Tool[] }>> {
    return this.gather("tools", async (name, client) => {
      const tools = await collectPages(async (cursor) => {
        const page = await client.listTools({ cursor });
        return { items: page.tools, nextCursor: page.nextCursor };
      });
      return [{ server: name, tools: tools.map((tool) => ({ ...tool, name: qualify(name, tool.name) })) }];
    });
  }

  async listTools(): Promise<Tool[]> {
    const upstreamTools = (await this.toolLists())
      .flatMap(({ tools }) => tools)
      .filter((tool) => !this.profile.hiddenTools.has(tool.name));
    const statusTool: Tool = {
      name: STATUS_TOOL,
      description: `Connection state of every MCP server in the "${this.profile.name}" gateway profile, with errors.`,
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    };
    return [statusTool, ...upstreamTools];
  }

  async toolInfos(): Promise<ToolInfo[]> {
    return (await this.toolLists()).flatMap(({ server, tools }) =>
      tools.map((tool): ToolInfo => {
        const hiddenBy = this.profile.hiddenTools.get(tool.name);
        const info: ToolInfo = { name: tool.name, server, description: tool.description, hidden: hiddenBy !== undefined };
        if (hiddenBy !== undefined) {
          info.hiddenBy = hiddenBy;
        }
        return info;
      }),
    );
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    if (name === STATUS_TOOL) {
      return { content: [{ type: "text", text: JSON.stringify(await this.status(), null, 2) }] };
    }
    const hiddenBy = this.profile.hiddenTools.get(name);
    if (hiddenBy !== undefined) {
      throw new McpError(ErrorCode.InvalidParams, `Tool ${name} is hidden by profile "${hiddenBy}"`);
    }
    const { server, item } = split(name);
    let client: Client;
    try {
      client = this.clientFor(server);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: errorMessage(error) }] };
    }
    return client.request({ method: "tools/call", params: { name: item, arguments: args } }, CallToolResultSchema, {
      timeout: CALL_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
    }) as Promise<CallToolResult>;
  }

  async listPrompts(): Promise<Prompt[]> {
    return this.gather("prompts", async (name, client) => {
      const prompts = await collectPages(async (cursor) => {
        const page = await client.listPrompts({ cursor });
        return { items: page.prompts, nextCursor: page.nextCursor };
      });
      return prompts.map((prompt) => ({ ...prompt, name: qualify(name, prompt.name) }));
    });
  }

  async getPrompt(name: string, args: Record<string, string> | undefined) {
    const { server, item } = split(name);
    return this.clientFor(server).getPrompt({ name: item, arguments: args });
  }

  async listResources(): Promise<Resource[]> {
    return this.gather("resources", async (name, client) => {
      const resources = await collectPages(async (cursor) => {
        const page = await client.listResources({ cursor });
        return { items: page.resources, nextCursor: page.nextCursor };
      });
      for (const resource of resources) {
        this.resourceOwners.set(resource.uri, name);
      }
      return resources;
    });
  }

  async listResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.gather("resources", async (_, client) =>
      collectPages(async (cursor) => {
        const page = await client.listResourceTemplates({ cursor });
        return { items: page.resourceTemplates, nextCursor: page.nextCursor };
      }),
    );
  }

  /** Resource URIs are not renamed, so the owner is the server that listed it, else the first that can read it. */
  async readResource(uri: string) {
    const owner = this.resourceOwners.get(uri);
    if (owner) {
      return this.clientFor(owner).readResource({ uri });
    }
    const failures: string[] = [];
    for (const { name, client } of this.ready("resources")) {
      try {
        const result = await client.readResource({ uri });
        this.resourceOwners.set(uri, name);
        return result;
      } catch (error) {
        failures.push(`${name}: ${errorMessage(error)}`);
      }
    }
    throw new Error(`No server could read ${uri}\n${failures.join("\n")}`);
  }
}

/** A downstream MCP server session backed by a shared gateway. */
export function createSessionServer(gateway: Gateway): Server {
  const server = new Server(
    { name: `agent-gateway-${gateway.profile.name}`, version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await gateway.listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    gateway.callTool(request.params.name, request.params.arguments),
  );
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: await gateway.listPrompts() }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    gateway.getPrompt(request.params.name, request.params.arguments),
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: await gateway.listResources() }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: await gateway.listResourceTemplates(),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => gateway.readResource(request.params.uri));

  const unsubscribe = gateway.onListChanged((kind) => {
    const send = {
      tools: () => server.sendToolListChanged(),
      prompts: () => server.sendPromptListChanged(),
      resources: () => server.sendResourceListChanged(),
    }[kind];
    send().catch(() => {});
  });
  server.onclose = unsubscribe;
  return server;
}

function sameEntries(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}
