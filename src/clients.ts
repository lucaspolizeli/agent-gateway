import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";
import { errorMessage } from "./errors.ts";

/**
 * The gateway is registered under the same name everywhere, so a project-level entry
 * replaces the user-level one in every client instead of running next to it.
 */
export const ENTRY_NAME = "gw";

export type Endpoint = { kind: "stdio"; command: string; args: string[] } | { kind: "http"; url: string };

export type Scope = { kind: "user" } | { kind: "project"; dir: string };

export type ClientName = "claude" | "codex" | "grok";

export type ClientResult = { client: ClientName; ok: boolean; detail: string };

/** A client CLI that does not answer in this time is killed and reported as failed, so it cannot stall the server. */
export const COMMAND_TIMEOUT_MS = 30_000;

export type Timing = { timeoutMs: number };

/**
 * The deadline is enforced here and not by `execFile`'s own `timeout`, because that one still waits
 * for the output pipes to close, which a grandchild of the killed process can hold open.
 */
function run(command: string, args: string[], cwd: string | undefined, { timeoutMs }: Timing): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { cwd }, (error, _stdout, stderr) => {
      clearTimeout(timer);
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve();
    });
    const timer = setTimeout(async () => {
      child.kill("SIGKILL");
      child.stdout?.destroy();
      child.stderr?.destroy();
      reject(new Error(`${command} did not finish within ${timeoutMs / 1000}s and was stopped`));
    }, timeoutMs);
    child.stdin?.end();
  });
}

async function attempt(client: ClientName, detail: string, action: () => Promise<void>): Promise<ClientResult> {
  try {
    await action();
    return { client, ok: true, detail };
  } catch (error) {
    return { client, ok: false, detail: errorMessage(error) };
  }
}

function cwdOf(scope: Scope): string | undefined {
  if (scope.kind === "project") {
    return scope.dir;
  }
  return undefined;
}

/** Claude Code: `local` scope lives in ~/.claude.json keyed by project, so the repo is never touched. */
function registerClaude(endpoint: Endpoint, scope: Scope, timing: Timing): Promise<ClientResult> {
  let claudeScope = "user";
  if (scope.kind === "project") {
    claudeScope = "local";
  }
  let json: object;
  if (endpoint.kind === "stdio") {
    json = { type: "stdio", command: endpoint.command, args: endpoint.args };
  } else {
    json = { type: "http", url: endpoint.url };
  }
  return attempt("claude", `${claudeScope} scope`, async () => {
    try {
      await run("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope), timing);
    } catch {
      // Not registered yet.
    }
    await run("claude", ["mcp", "add-json", ENTRY_NAME, JSON.stringify(json), "-s", claudeScope], cwdOf(scope), timing);
  });
}

function unregisterClaude(scope: Scope, timing: Timing): Promise<ClientResult> {
  let claudeScope = "user";
  if (scope.kind === "project") {
    claudeScope = "local";
  }
  return attempt("claude", `${claudeScope} scope`, async () => {
    await run("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope), timing);
  });
}

function registerGrok(endpoint: Endpoint, scope: Scope, timing: Timing): Promise<ClientResult> {
  const grokScope = scope.kind;
  return attempt("grok", `${grokScope} scope`, async () => {
    if (endpoint.kind === "stdio") {
      await run("grok", ["mcp", "add", ENTRY_NAME, endpoint.command, "-s", grokScope, "--", ...endpoint.args], cwdOf(scope), timing);
    } else {
      await run("grok", ["mcp", "add", ENTRY_NAME, endpoint.url, "-t", "http", "-s", grokScope], cwdOf(scope), timing);
    }
  });
}

function unregisterGrok(scope: Scope, timing: Timing): Promise<ClientResult> {
  return attempt("grok", `${scope.kind} scope`, async () => {
    await run("grok", ["mcp", "remove", ENTRY_NAME, "-s", scope.kind], cwdOf(scope), timing);
  });
}

function codexConfigPath(scope: Scope): string {
  if (scope.kind === "project") {
    return join(scope.dir, ".codex", "config.toml");
  }
  return join(process.env.CODEX_HOME ?? join(process.env.HOME!, ".codex"), "config.toml");
}

/**
 * Codex has no project-scope `mcp add`, so the project file is edited directly.
 * The user-level file goes through `codex mcp add` to keep its comments intact.
 */
function registerCodex(endpoint: Endpoint, scope: Scope, timing: Timing): Promise<ClientResult> {
  if (scope.kind === "user") {
    return attempt("codex", "user scope", async () => {
      try {
        await run("codex", ["mcp", "remove", ENTRY_NAME], undefined, timing);
      } catch {
        // Not registered yet.
      }
      if (endpoint.kind === "stdio") {
        await run("codex", ["mcp", "add", ENTRY_NAME, "--", endpoint.command, ...endpoint.args], undefined, timing);
      } else {
        await run("codex", ["mcp", "add", ENTRY_NAME, "--url", endpoint.url], undefined, timing);
      }
    });
  }
  const path = codexConfigPath(scope);
  return attempt("codex", `${path} (Codex reads it only in trusted projects)`, async () => {
    const config = readToml(path);
    const servers = (config.mcp_servers ?? {}) as Record<string, unknown>;
    if (endpoint.kind === "stdio") {
      servers[ENTRY_NAME] = { command: endpoint.command, args: endpoint.args };
    } else {
      servers[ENTRY_NAME] = { url: endpoint.url };
    }
    config.mcp_servers = servers;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stringify(config) + "\n");
  });
}

function unregisterCodex(scope: Scope, timing: Timing): Promise<ClientResult> {
  if (scope.kind === "user") {
    return attempt("codex", "user scope", () => run("codex", ["mcp", "remove", ENTRY_NAME], undefined, timing));
  }
  const path = codexConfigPath(scope);
  return attempt("codex", path, async () => {
    if (!existsSync(path)) {
      return;
    }
    const config = readToml(path);
    const servers = config.mcp_servers as Record<string, unknown> | undefined;
    if (servers) {
      delete servers[ENTRY_NAME];
    }
    writeFileSync(path, stringify(config) + "\n");
  });
}

function readToml(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** The three clients are registered at the same time, so a slow one does not hold up the others. */
export function registerAll(endpoint: Endpoint, scope: Scope, timing: Timing = { timeoutMs: COMMAND_TIMEOUT_MS }): Promise<ClientResult[]> {
  return Promise.all([registerClaude(endpoint, scope, timing), registerCodex(endpoint, scope, timing), registerGrok(endpoint, scope, timing)]);
}

export function unregisterAll(scope: Scope, timing: Timing = { timeoutMs: COMMAND_TIMEOUT_MS }): Promise<ClientResult[]> {
  return Promise.all([unregisterClaude(scope, timing), unregisterCodex(scope, timing), unregisterGrok(scope, timing)]);
}

/** Files the clients write inside a project, relative to its root. */
export const PROJECT_CONFIG_FILES = [".codex/config.toml", ".grok/config.toml"];
