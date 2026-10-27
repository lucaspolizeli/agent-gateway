import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "./errors.ts";
import { writeFileAtomic } from "./fsutil.ts";
import { editTomlTable } from "./toml-edit.ts";

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

class CommandTimeout extends Error {}

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
      reject(new CommandTimeout(`${command} did not finish within ${timeoutMs / 1000}s and was stopped`));
    }, timeoutMs);
    child.stdin?.end();
  });
}

/** What the three clients print when `mcp remove` finds no entry: `No MCP server named 'gw' ...`. */
const NOT_REGISTERED = /no mcp server named/i;

/** Removing an entry that is already gone is the goal reached, so a retry of a half-finished uninstall can succeed. */
async function removeEntry(command: string, args: string[], cwd: string | undefined, timing: Timing): Promise<void> {
  try {
    await run(command, args, cwd, timing);
  } catch (error) {
    if (!NOT_REGISTERED.test(errorMessage(error))) {
      throw error;
    }
  }
}

/**
 * Clears the entry before re-adding it. Any failure means "nothing to remove" except a hang:
 * a client that hung once would hang on the add too, so it fails now instead of after a second deadline.
 */
async function removeBeforeAdd(command: string, args: string[], cwd: string | undefined, timing: Timing): Promise<void> {
  try {
    await run(command, args, cwd, timing);
  } catch (error) {
    if (error instanceof CommandTimeout) {
      throw error;
    }
  }
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
    await removeBeforeAdd("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope), timing);
    await run("claude", ["mcp", "add-json", ENTRY_NAME, JSON.stringify(json), "-s", claudeScope], cwdOf(scope), timing);
  });
}

function unregisterClaude(scope: Scope, timing: Timing): Promise<ClientResult> {
  let claudeScope = "user";
  if (scope.kind === "project") {
    claudeScope = "local";
  }
  return attempt("claude", `${claudeScope} scope`, async () => {
    await removeEntry("claude", ["mcp", "remove", ENTRY_NAME, "-s", claudeScope], cwdOf(scope), timing);
  });
}

function registerGrok(endpoint: Endpoint, scope: Scope, timing: Timing): Promise<ClientResult> {
  const grokScope = scope.kind;
  return attempt("grok", `${grokScope} scope`, async () => {
    await removeBeforeAdd("grok", ["mcp", "remove", ENTRY_NAME, "-s", grokScope], cwdOf(scope), timing);
    if (endpoint.kind === "stdio") {
      await run("grok", ["mcp", "add", ENTRY_NAME, endpoint.command, "-s", grokScope, "--", ...endpoint.args], cwdOf(scope), timing);
    } else {
      await run("grok", ["mcp", "add", ENTRY_NAME, endpoint.url, "-t", "http", "-s", grokScope], cwdOf(scope), timing);
    }
  });
}

function unregisterGrok(scope: Scope, timing: Timing): Promise<ClientResult> {
  return attempt("grok", `${scope.kind} scope`, async () => {
    await removeEntry("grok", ["mcp", "remove", ENTRY_NAME, "-s", scope.kind], cwdOf(scope), timing);
  });
}

const CODEX_SERVERS = "mcp_servers";

export function codexConfigPath(scope: Scope): string {
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
      await removeBeforeAdd("codex", ["mcp", "remove", ENTRY_NAME], undefined, timing);
      if (endpoint.kind === "stdio") {
        await run("codex", ["mcp", "add", ENTRY_NAME, "--", endpoint.command, ...endpoint.args], undefined, timing);
      } else {
        await run("codex", ["mcp", "add", ENTRY_NAME, "--url", endpoint.url], undefined, timing);
      }
    });
  }
  const path = codexConfigPath(scope);
  return attempt("codex", `${path} (Codex reads it only in trusted projects)`, async () => {
    const current = readText(path);
    const next = editTomlTable(current, [CODEX_SERVERS, ENTRY_NAME], codexEntry(endpoint));
    if (next !== current) {
      writeFileAtomic(path, next, { mode: 0o644 });
    }
  });
}

function codexEntry(endpoint: Endpoint): Record<string, unknown> {
  if (endpoint.kind === "stdio") {
    return { command: endpoint.command, args: endpoint.args };
  }
  return { url: endpoint.url };
}

function unregisterCodex(scope: Scope, timing: Timing): Promise<ClientResult> {
  if (scope.kind === "user") {
    return attempt("codex", "user scope", () => removeEntry("codex", ["mcp", "remove", ENTRY_NAME], undefined, timing));
  }
  const path = codexConfigPath(scope);
  return attempt("codex", path, async () => {
    const current = readText(path);
    const next = editTomlTable(current, [CODEX_SERVERS, ENTRY_NAME], undefined);
    if (next !== current) {
      writeFileAtomic(path, next, { mode: 0o644 });
    }
  });
}

function readText(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

/** The three clients are registered at the same time, so a slow one does not hold up the others. */
const PROJECT_CONFIG_FILE: Record<"codex" | "grok", string> = { codex: ".codex/config.toml", grok: ".grok/config.toml" };

function trackedByGit(dir: string, file: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("git", ["-C", dir, "ls-files", "--error-unmatch", file], (error) => resolve(error === null));
  });
}

/** A project config file the repository tracks belongs to the team, so the personal gw entry stays out of it. */
async function unlessTracked(client: "codex" | "grok", scope: Scope, action: () => Promise<ClientResult>): Promise<ClientResult> {
  const file = PROJECT_CONFIG_FILE[client];
  if (scope.kind === "project" && (await trackedByGit(scope.dir, file))) {
    return { client, ok: true, detail: `skipped: ${file} is tracked by git, so the personal gw entry stays out of it` };
  }
  return action();
}

export function registerAll(endpoint: Endpoint, scope: Scope, timing: Timing = { timeoutMs: COMMAND_TIMEOUT_MS }): Promise<ClientResult[]> {
  return Promise.all([
    registerClaude(endpoint, scope, timing),
    unlessTracked("codex", scope, () => registerCodex(endpoint, scope, timing)),
    unlessTracked("grok", scope, () => registerGrok(endpoint, scope, timing)),
  ]);
}

export function unregisterAll(scope: Scope, timing: Timing = { timeoutMs: COMMAND_TIMEOUT_MS }): Promise<ClientResult[]> {
  return Promise.all([
    unregisterClaude(scope, timing),
    unlessTracked("codex", scope, () => unregisterCodex(scope, timing)),
    unlessTracked("grok", scope, () => unregisterGrok(scope, timing)),
  ]);
}

/** Files the clients write inside a project, relative to its root. */
export const PROJECT_CONFIG_FILES: Array<{ client: ClientName; file: string }> = [
  { client: "codex", file: ".codex/config.toml" },
  { client: "grok", file: ".grok/config.toml" },
];
