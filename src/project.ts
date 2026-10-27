import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "smol-toml";
import type { SyncResult } from "./admin/contract.ts";
import { codexConfigPath, COMMAND_TIMEOUT_MS, PROJECT_CONFIG_FILES, registerAll, unregisterAll, type ClientResult, type Endpoint } from "./clients.ts";
import { loadConfig, resolveProfile } from "./config.ts";
import { errorMessage, UserError } from "./errors.ts";
import { collectSkills, GLOBAL_SET, linkSkills, type LinkReport } from "./skills.ts";
import { linkUserSkills, userSkillDirs } from "./user-skills.ts";

export type Transport = "stdio" | "http";
type Binding = { profile: string; transport: Transport };
/** `global` records the user-level install, so the profile it uses counts as installed. */
type State = { projects: Record<string, Binding>; global?: Binding };

/** Skill folders read by each client: Claude Code and Grok read `.claude/skills`, Codex reads `.agents/skills`. */
const PROJECT_SKILL_DIRS = [".claude/skills", ".agents/skills"];

export const DEFAULT_PORT = 7820;

/** Follows symlinks as far as the path exists, so a folder that is not created yet still compares by its real location. */
function realLocation(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) {
      return path;
    }
    return join(realLocation(parent), basename(path));
  }
}

/**
 * Why `dir` cannot be a project, or undefined when it can. Installing into the home folder, or a
 * folder that reaches the user-level skill folders or Codex config through a symlink, would prune
 * the user's global skill links and rewrite `~/.codex/config.toml`.
 */
export function unsafeProjectDir(dir: string): string | undefined {
  const absolute = resolve(dir);
  if (realLocation(absolute) === realLocation(homedir())) {
    return "a pasta home não pode ser um projeto: ela guarda as skills e a configuração dos clientes do usuário";
  }
  const userPaths = new Set([...userSkillDirs(), codexConfigPath({ kind: "user" })].map(realLocation));
  const projectPaths = [...PROJECT_SKILL_DIRS.map((sub) => join(absolute, sub)), codexConfigPath({ kind: "project", dir: absolute })];
  const shared = projectPaths.find((path) => userPaths.has(realLocation(path)));
  if (shared !== undefined) {
    return `${shared} é o mesmo local de uma pasta de skills ou configuração de cliente do usuário`;
  }
  return undefined;
}

function requireSafeProjectDir(dir: string) {
  const absolute = resolve(dir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new UserError("invalid", `${absolute}: a pasta do projeto precisa existir`);
  }
  const problem = unsafeProjectDir(absolute);
  if (problem !== undefined) {
    throw new UserError("invalid", `${absolute}: ${problem}`);
  }
}

export type ApplyReport = { dir: string; profile: string; clients: ClientResult[]; skills: LinkReport[] };

function statePath(home: string) {
  return join(home, "state", "projects.json");
}

function readState(home: string): State {
  const path = statePath(home);
  if (!existsSync(path)) {
    return { projects: {} };
  }
  return JSON.parse(readFileSync(path, "utf8")) as State;
}

function writeState(home: string, state: State) {
  mkdirSync(dirname(statePath(home)), { recursive: true });
  writeFileSync(statePath(home), JSON.stringify(state, null, 2) + "\n");
}

export function endpointFor(home: string, profile: string, transport: Transport, port: number): Endpoint {
  if (transport === "http") {
    return { kind: "http", url: `http://127.0.0.1:${port}/mcp/${profile}` };
  }
  return { kind: "stdio", command: join(home, "bin", "agw"), args: ["stdio", profile] };
}

const execFileAsync = promisify(execFile);

async function git(dir: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", dir, ...args], { timeout: COMMAND_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * A gitignore pattern that matches `pattern` literally: its wildcards, a leading `#` or `!`, and trailing
 * spaces, which git drops unless they are escaped, all lose their special meaning.
 */
export function escapeGitignore(pattern: string): string {
  let escaped = pattern.replace(/[\\[\]*?]/g, "\\$&");
  if (escaped.startsWith("#") || escaped.startsWith("!")) {
    escaped = `\\${escaped}`;
  }
  return escaped.replace(/ +$/, (spaces) => spaces.replaceAll(" ", "\\ "));
}

/**
 * Keeps the generated files out of `git status` through `info/exclude`, which is local to this
 * clone, so company repositories never see personal tooling. In a linked worktree that file is the
 * one every checkout of the repository shares, so each checkout owns a block named after its own
 * folder and never touches the others'. Patterns in it are relative to the root of whichever checkout
 * git is looking at, so a line for this checkout also covers the same path in a sibling checkout.
 */
async function writeGitExclude(dir: string, paths: string[]) {
  const excludeFile = await git(dir, ["rev-parse", "--git-path", "info/exclude"]);
  const toplevel = await git(dir, ["rev-parse", "--show-toplevel"]);
  if (excludeFile === undefined || toplevel === undefined) {
    return;
  }
  const prefix = (await git(dir, ["rev-parse", "--show-prefix"])) ?? "";
  const path = resolve(dir, excludeFile);
  const owner = resolve(toplevel, prefix);
  const start = `# agent-gateway:${owner}:start`;
  const end = `# agent-gateway:${owner}:end`;
  let content = "";
  if (existsSync(path)) {
    content = readFileSync(path, "utf8");
  }
  const blockPattern = new RegExp(`\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  content = content.replace(blockPattern, "\n").replace(/\n+$/, "");
  const lines = paths.map((p) => escapeGitignore(`/${prefix}${p}`)).filter((line) => !line.includes("\n"));
  if (lines.length > 0) {
    content = `${content}\n${start}\n${lines.join("\n")}\n${end}`;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.replace(/^\n+/, "") + "\n");
}

/** Deletes a client config left with no settings once the gateway entry is gone, and its folder if empty. Comments keep a file alive. */
function removeIfEmptyToml(path: string) {
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, "utf8");
  const config = parse(text);
  const servers = config.mcp_servers as Record<string, unknown> | undefined;
  if (servers && Object.keys(servers).length === 0) {
    delete config.mcp_servers;
  }
  if (Object.keys(config).length > 0 || /^\s*#/m.test(text)) {
    return;
  }
  rmSync(path);
  if (readdirSync(dirname(path)).length === 0) {
    rmSync(dirname(path), { recursive: true });
  }
}

/** Reports a client whose config could not be tidied as failed, unless the client already failed for its own reason. */
function tidyClientConfigs(dir: string, clients: ClientResult[]): ClientResult[] {
  return clients.map((result) => {
    const config = PROJECT_CONFIG_FILES.find(({ client }) => client === result.client);
    if (config === undefined) {
      return result;
    }
    const path = join(dir, config.file);
    try {
      removeIfEmptyToml(path);
    } catch (error) {
      if (result.ok) {
        return { client: result.client, ok: false, detail: `${path}: ${errorMessage(error)}` };
      }
    }
    return result;
  });
}

/** Removes `.claude/skills`, `.agents/skills` and then their parents, each only when nothing is left in it. */
function pruneEmptySkillDirs(dir: string) {
  const folders = [...PROJECT_SKILL_DIRS.map((sub) => join(dir, sub)), ...new Set(PROJECT_SKILL_DIRS.map((sub) => join(dir, dirname(sub))))];
  for (const folder of folders) {
    try {
      if (lstatSync(folder).isDirectory() && readdirSync(folder).length === 0) {
        rmdirSync(folder);
      }
    } catch {
      // Missing or no longer empty: leave it.
    }
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function linkProjectSkills(home: string, dir: string, profileName: string): Promise<LinkReport[]> {
  const profile = resolveProfile(loadConfig(home), profileName);
  const sets = profile.skillSets.filter((set) => set !== GLOBAL_SET);
  const skills = collectSkills(join(home, "skills"), sets);
  const reports = PROJECT_SKILL_DIRS.map((sub) => linkSkills(join(dir, sub), skills, join(home, "skills")));

  const excluded = PROJECT_CONFIG_FILES.map(({ file }) => file);
  for (const [index, sub] of PROJECT_SKILL_DIRS.entries()) {
    const notOurs = new Set(reports[index]!.skipped);
    for (const name of skills.keys()) {
      if (!notOurs.has(name)) {
        excluded.push(`${sub}/${name}`);
      }
    }
  }
  await writeGitExclude(dir, excluded);
  return reports;
}

async function applyProject(home: string, dir: string, binding: Binding, port: number): Promise<ApplyReport> {
  const skills = await linkProjectSkills(home, dir, binding.profile);
  const clients = await registerAll(endpointFor(home, binding.profile, binding.transport, port), { kind: "project", dir });
  return { dir, profile: binding.profile, clients, skills };
}

export async function installProject(home: string, dir: string, binding: Binding, port: number): Promise<ApplyReport> {
  requireSafeProjectDir(dir);
  const absolute = resolve(dir);
  const report = await applyProject(home, absolute, binding, port);
  const state = readState(home);
  state.projects[absolute] = binding;
  writeState(home, state);
  return report;
}

export type UninstallReport = Omit<ApplyReport, "profile"> & {
  /** The record stays when a client entry could not be removed, so running the uninstall again can finish the job. */
  kept: boolean;
};

function forget(home: string, dir: string) {
  const state = readState(home);
  delete state.projects[dir];
  writeState(home, state);
}

export async function uninstallProject(home: string, dir: string): Promise<UninstallReport> {
  const absolute = resolve(dir);
  // Cleaning an unsafe or vanished folder would touch the user-level setup or recreate it; only the stale record is dropped.
  if (unsafeProjectDir(absolute) !== undefined || !existsSync(absolute)) {
    forget(home, absolute);
    return { dir: absolute, clients: [], skills: [], kept: false };
  }
  const skills = PROJECT_SKILL_DIRS.map((sub): LinkReport => {
    const target = join(absolute, sub);
    if (!existsSync(target)) {
      return { target, linked: [], removed: [], skipped: [] };
    }
    return linkSkills(target, new Map(), join(home, "skills"));
  });
  pruneEmptySkillDirs(absolute);
  const clients = tidyClientConfigs(absolute, await unregisterAll({ kind: "project", dir: absolute }));
  await writeGitExclude(absolute, []);
  const kept = clients.some((result) => !result.ok);
  if (!kept) {
    forget(home, absolute);
  }
  return { dir: absolute, clients, skills, kept };
}

export async function installGlobal(home: string, transport: Transport, port: number) {
  resolveProfile(loadConfig(home), GLOBAL_SET);
  const clients = await registerAll(endpointFor(home, GLOBAL_SET, transport, port), { kind: "user" });
  const state = readState(home);
  state.global = { profile: GLOBAL_SET, transport };
  writeState(home, state);
  return { clients, skills: linkUserSkills(home) };
}

export type SyncReport = Omit<SyncResult, "applied"> & { global: LinkReport[]; applied: ApplyReport[] };

/**
 * Re-applies skills and gateway entries for every installed project, after edits to the hub. Each
 * project lands in one bucket of the result, so a project that cannot be applied does not stop the others.
 */
export async function syncAll(home: string, port: number): Promise<SyncReport> {
  const result: SyncReport = { global: [], applied: [], missing: [], unsafe: [], failed: [] };
  try {
    result.global = linkUserSkills(home);
  } catch (error) {
    result.failed.push({ dir: "global", error: errorMessage(error) });
  }
  for (const [dir, binding] of Object.entries(readState(home).projects)) {
    if (!existsSync(dir)) {
      result.missing.push(dir);
    } else if (unsafeProjectDir(dir) !== undefined) {
      result.unsafe.push(dir);
    } else {
      try {
        result.applied.push(await applyProject(home, dir, binding, port));
      } catch (error) {
        result.failed.push({ dir, error: errorMessage(error) });
      }
    }
  }
  return result;
}

/**
 * Re-links skills after the hub changed: the global set into the user-level folders, any other set
 * into every installed project. Client registrations are left alone. A project that fails is logged
 * and skipped so one broken profile does not block the rest.
 */
export async function relinkSkills(home: string, changedSets: string[]) {
  if (changedSets.includes(GLOBAL_SET)) {
    linkUserSkills(home);
  }
  if (changedSets.every((set) => set === GLOBAL_SET)) {
    return;
  }
  for (const [dir, binding] of Object.entries(readState(home).projects)) {
    if (!existsSync(dir) || unsafeProjectDir(dir) !== undefined) {
      continue;
    }
    try {
      await linkProjectSkills(home, dir, binding.profile);
    } catch (error) {
      process.stderr.write(`[agent-gateway] relinking skills in ${dir}: ${errorMessage(error)}\n`);
    }
  }
}

export function listProjects(home: string) {
  return readState(home).projects;
}

/** Profiles that a project or the user-level install uses. */
export function installedProfiles(home: string): Set<string> {
  const state = readState(home);
  const bindings = Object.values(state.projects);
  if (state.global) {
    bindings.push(state.global);
  }
  return new Set(bindings.map((binding) => binding.profile));
}
