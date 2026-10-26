import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  type CallToolResult,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  PromptListChangedNotificationSchema,
  type Prompt,
  ReadResourceRequestSchema,
  type Resource,
  ResourceListChangedNotificationSchema,
  type ResourceTemplate,
  type Tool,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  interpolate,
  interpolateRecord,
  isStdio,
  loadSecrets,
  type ResolvedProfile,
  type ServerSpec,
} from "./config.ts";

/** Joins upstream server and item names: `github__create_issue`. Server slugs never contain `_`. */
const SEPARATOR = "__";
const STATUS_TOOL = `gateway${SEPARATOR}status`;
const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 10 * 60_000;

type Upstream =
  | { name: string; state: "connecting" }
  | { name: string; state: "ready"; client: Client }
  | { name: string; state: "failed"; error: string };

type ListKind = "tools" | "prompts" | "resources";

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

function transportFor(spec: ServerSpec, secrets: Record<string, string>): Transport {
  if (isStdio(spec)) {
    return new StdioClientTransport({
      command: interpolate(spec.command, secrets),
      args: spec.args.map((arg) => interpolate(arg, secrets)),
      env: { ...getDefaultEnvironment(), ...interpolateRecord(spec.env, secrets) },
      cwd: spec.cwd,
      stderr: "inherit",
    });
  }
  return new StreamableHTTPClientTransport(new URL(interpolate(spec.url, secrets)), {
    requestInit: { headers: interpolateRecord(spec.headers, secrets) },
  });
}

async function collectPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>) {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * One pool of upstream connections for a profile. Shared by every downstream session
 * that connects to the same profile.
 */
export class Gateway {
  readonly profile: ResolvedProfile;
  private readonly upstreams = new Map<string, Upstream>();
  private readonly listeners = new Set<(kind: ListKind) => void>();
  private readonly resourceOwners = new Map<string, string>();
  private readonly secrets: Record<string, string>;

  constructor(home: string, profile: ResolvedProfile) {
    this.profile = profile;
    this.secrets = loadSecrets(home, profile);
  }

  async start(): Promise<void> {
    await Promise.all([...this.profile.servers].map(([name, spec]) => this.connect(name, spec)));
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.upstreams.values()].map((upstream) => {
        if (upstream.state === "ready") {
          return upstream.client.close();
        }
        return undefined;
      }),
    );
  }

  onListChanged(listener: (kind: ListKind) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status() {
    return [...this.upstreams.values()].map((upstream) => {
      if (upstream.state === "failed") {
        return { server: upstream.name, state: upstream.state, error: upstream.error };
      }
      return { server: upstream.name, state: upstream.state };
    });
  }

  private async connect(name: string, spec: ServerSpec): Promise<void> {
    this.upstreams.set(name, { name, state: "connecting" });
    const client = new Client({ name: `agent-gateway/${this.profile.name}`, version: "0.1.0" });
    client.onclose = () => {
      const current = this.upstreams.get(name);
      if (current?.state === "ready" && current.client === client) {
        this.upstreams.set(name, { name, state: "failed", error: "connection closed" });
        this.emit("tools");
      }
    };
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS).unref();
      });
      await Promise.race([client.connect(transportFor(spec, this.secrets)), timeout]);
    } catch (error) {
      this.upstreams.set(name, { name, state: "failed", error: errorMessage(error) });
      process.stderr.write(`[agent-gateway] ${name}: ${errorMessage(error)}\n`);
      await client.close().catch(() => {});
      return;
    }
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => this.emit("tools"));
    client.setNotificationHandler(PromptListChangedNotificationSchema, async () => this.emit("prompts"));
    client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => this.emit("resources"));
    this.upstreams.set(name, { name, state: "ready", client });
  }

  private emit(kind: ListKind) {
    for (const listener of this.listeners) {
      listener(kind);
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

  async listTools(): Promise<Tool[]> {
    const upstreamTools = await this.gather("tools", async (name, client) => {
      const tools = await collectPages(async (cursor) => {
        const page = await client.listTools({ cursor });
        return { items: page.tools, nextCursor: page.nextCursor };
      });
      return tools.map((tool) => ({ ...tool, name: qualify(name, tool.name) }));
    });
    const statusTool: Tool = {
      name: STATUS_TOOL,
      description: `Connection state of every MCP server in the "${this.profile.name}" gateway profile, with errors.`,
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    };
    return [statusTool, ...upstreamTools];
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    if (name === STATUS_TOOL) {
      return { content: [{ type: "text", text: JSON.stringify(this.status(), null, 2) }] };
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
