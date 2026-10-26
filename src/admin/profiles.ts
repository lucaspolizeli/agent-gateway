import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { type Config, loadSecrets, missingSecrets, resolveProfile, type ServerSpec } from "../config.ts";
import { errorMessage } from "../errors.ts";
import { collectPages, type Gateway, planConnection, redact, transportFor, withTimeout } from "../gateway.ts";
import type { ProfileStatus, ResolvedProfileView, ServerTestResult } from "./contract.ts";

const TEST_TIMEOUT_MS = 20_000;
const STDERR_TAIL_CHARS = 2_000;

export function profileView(home: string, config: Config, name: string): ResolvedProfileView {
  const profile = resolveProfile(config, name);
  const servers: Record<string, string> = {};
  for (const member of profile.chain) {
    for (const server of config.profiles[member]!.servers) {
      servers[server] ??= member;
    }
  }
  return {
    name,
    chain: profile.chain,
    servers,
    skillSets: profile.skillSets,
    missingSecrets: missingSecrets(home, profile),
  };
}

export async function profileStatus(
  home: string,
  config: Config,
  name: string,
  gateway: Gateway | undefined,
): Promise<ProfileStatus> {
  const profile = profileView(home, config, name);
  if (!gateway) {
    return { profile, running: false, upstreams: [], tools: [] };
  }
  const [upstreams, tools] = await Promise.all([gateway.status(), gateway.toolInfos()]);
  return { profile, running: true, upstreams, tools };
}

export async function testServer(
  home: string,
  config: Config,
  spec: ServerSpec,
  profileName: string | undefined,
): Promise<ServerTestResult> {
  let secrets: Record<string, string> = {};
  if (profileName !== undefined) {
    secrets = loadSecrets(home, resolveProfile(config, profileName));
  }
  const started = Date.now();
  const plan = planConnection(spec, secrets);
  if ("error" in plan) {
    return { ok: false, error: plan.error, durationMs: Date.now() - started };
  }
  const client = new Client({ name: "agent-gateway/test", version: "0.1.0" });
  const transport = transportFor(plan.spec, "pipe");
  let stderrTail = "";
  if (transport instanceof StdioClientTransport) {
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_CHARS);
    });
  }
  try {
    await withTimeout(client.connect(transport), TEST_TIMEOUT_MS);
    const tools = await collectPages(async (cursor) => {
      const page = await client.listTools({ cursor }, { timeout: TEST_TIMEOUT_MS });
      return { items: page.tools, nextCursor: page.nextCursor };
    });
    return {
      ok: true,
      tools: tools.map(({ name, description }) => ({ name, description })),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    let message = errorMessage(error);
    if (stderrTail.trim()) {
      message = `${message}\n${stderrTail.trim()}`;
    }
    return { ok: false, error: redact(message, plan.secretValues), durationMs: Date.now() - started };
  } finally {
    await client.close().catch(() => {});
  }
}
