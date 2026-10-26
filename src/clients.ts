import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";

/**
 * The gateway is registered under the same name everywhere, so a project-level entry
 * replaces the user-level one in every client instead of running next to it.
 */
export const ENTRY_NAME = "gw";

export type Endpoint = { kind: "stdio"; command: string; args: string[] } | { kind: "http"; url: string };

export type Scope = { kind: "user" } | { kind: "project"; dir: string };

export type ClientName = "claude" | "codex" | "grok";

export type ClientResult = { client: ClientName; ok: boolean; detail: string };

function run(command: string, args: string[], cwd: string | undefined): void {
  execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function attempt(client: ClientName, detail: string, action: () => void): ClientResult {
  try {
    action();
    return { client, ok: true, detail };
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    return { client, ok: false, detail: stderr || String(error) };
  }
}

function cwdOf(scope: Scope): string | undefined {
  if (scope.kind === "project") {
    return scope.dir;
  }
  return undefined;
}

/** Claude Code: `local` scope lives in ~/.claude.json keyed by project, so the repo is never touched. */
function registerClaude(endpoint: Endpoint, scope: Scope): ClientResult {
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
  return attempt("claude", `${claudeScope} scope`, () => {
    try {
      run("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope));
    } catch {
      // Not registered yet.
    }
    run("claude", ["mcp", "add-json", ENTRY_NAME, JSON.stringify(json), "-s", claudeScope], cwdOf(scope));
  });
}

function unregisterClaude(scope: Scope): ClientResult {
  let claudeScope = "user";
  if (scope.kind === "project") {
    claudeScope = "local";
  }
  return attempt("claude", `${claudeScope} scope`, () => {
    run("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope));
  });
}

function registerGrok(endpoint: Endpoint, scope: Scope): ClientResult {
  const grokScope = scope.kind;
  return attempt("grok", `${grokScope} scope`, () => {
    if (endpoint.kind === "stdio") {
      run("grok", ["mcp", "add", ENTRY_NAME, endpoint.command, "-s", grokScope, "--", ...endpoint.args], cwdOf(scope));
    } else {
      run("grok", ["mcp", "add", ENTRY_NAME, endpoint.url, "-t", "http", "-s", grokScope], cwdOf(scope));
    }
  });
}

function unregisterGrok(scope: Scope): ClientResult {
  return attempt("grok", `${scope.kind} scope`, () => {
    run("grok", ["mcp", "remove", ENTRY_NAME, "-s", scope.kind], cwdOf(scope));
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
function registerCodex(endpoint: Endpoint, scope: Scope): ClientResult {
  if (scope.kind === "user") {
    return attempt("codex", "user scope", () => {
      try {
        run("codex", ["mcp", "remove", ENTRY_NAME], undefined);
      } catch {
        // Not registered yet.
      }
      if (endpoint.kind === "stdio") {
        run("codex", ["mcp", "add", ENTRY_NAME, "--", endpoint.command, ...endpoint.args], undefined);
      } else {
        run("codex", ["mcp", "add", ENTRY_NAME, "--url", endpoint.url], undefined);
      }
    });
  }
  const path = codexConfigPath(scope);
  return attempt("codex", `${path} (Codex reads it only in trusted projects)`, () => {
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

function unregisterCodex(scope: Scope): ClientResult {
  if (scope.kind === "user") {
    return attempt("codex", "user scope", () => run("codex", ["mcp", "remove", ENTRY_NAME], undefined));
  }
  const path = codexConfigPath(scope);
  return attempt("codex", path, () => {
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

export function registerAll(endpoint: Endpoint, scope: Scope): ClientResult[] {
  return [registerClaude(endpoint, scope), registerCodex(endpoint, scope), registerGrok(endpoint, scope)];
}

export function unregisterAll(scope: Scope): ClientResult[] {
  return [unregisterClaude(scope), unregisterCodex(scope), unregisterGrok(scope)];
}

/** Files the clients write inside a project, relative to its root. */
export const PROJECT_CONFIG_FILES = [".codex/config.toml", ".grok/config.toml"];
