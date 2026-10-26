import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "smol-toml";
import { PROJECT_CONFIG_FILES, registerAll, unregisterAll, type ClientResult, type Endpoint } from "./clients.ts";
import { loadConfig, resolveProfile } from "./config.ts";
import { collectSkills, GLOBAL_SET, linkSkills, type LinkReport } from "./skills.ts";

export type Transport = "stdio" | "http";
type Binding = { profile: string; transport: Transport };
type State = { projects: Record<string, Binding> };

/** Skill folders read by each client: Claude Code and Grok read `.claude/skills`, Codex reads `.agents/skills`. */
const PROJECT_SKILL_DIRS = [".claude/skills", ".agents/skills"];
const USER_SKILL_DIRS = [join(homedir(), ".claude", "skills"), join(homedir(), ".agents", "skills")];

export const DEFAULT_PORT = 7820;

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

function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, ...args], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * Keeps the generated files out of `git status` through `.git/info/exclude`, which is local
 * to this clone, so company repositories never see personal tooling.
 */
function writeGitExclude(dir: string, paths: string[]) {
  const excludeFile = git(dir, ["rev-parse", "--git-path", "info/exclude"]);
  if (excludeFile === undefined) {
    return;
  }
  const prefix = git(dir, ["rev-parse", "--show-prefix"]) ?? "";
  const path = resolve(dir, excludeFile);
  const start = `# agent-gateway:${prefix || "/"}:start`;
  const end = `# agent-gateway:${prefix || "/"}:end`;
  let content = "";
  if (existsSync(path)) {
    content = readFileSync(path, "utf8");
  }
  const blockPattern = new RegExp(`\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  content = content.replace(blockPattern, "\n").replace(/\n+$/, "");
  if (paths.length > 0) {
    const lines = paths.map((p) => `/${prefix}${p}`);
    content = `${content}\n${start}\n${lines.join("\n")}\n${end}`;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.replace(/^\n+/, "") + "\n");
}

/** Deletes a client config left with no settings once the gateway entry is gone, and its folder if empty. */
function removeIfEmptyToml(path: string) {
  if (!existsSync(path)) {
    return;
  }
  const config = parse(readFileSync(path, "utf8"));
  const servers = config.mcp_servers as Record<string, unknown> | undefined;
  if (servers && Object.keys(servers).length === 0) {
    delete config.mcp_servers;
  }
  if (Object.keys(config).length > 0) {
    return;
  }
  rmSync(path);
  if (readdirSync(dirname(path)).length === 0) {
    rmSync(dirname(path), { recursive: true });
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyProject(home: string, dir: string, binding: Binding, port: number): ApplyReport {
  const profile = resolveProfile(loadConfig(home), binding.profile);
  const sets = profile.skillSets.filter((set) => set !== GLOBAL_SET);
  const skills = collectSkills(join(home, "skills"), sets);
  const skillReports = PROJECT_SKILL_DIRS.map((sub) => linkSkills(join(dir, sub), skills, join(home, "skills")));
  const clients = registerAll(endpointFor(home, binding.profile, binding.transport, port), { kind: "project", dir });

  const excluded = [...PROJECT_CONFIG_FILES];
  for (const sub of PROJECT_SKILL_DIRS) {
    for (const name of skills.keys()) {
      excluded.push(`${sub}/${name}`);
    }
  }
  writeGitExclude(dir, excluded);
  return { dir, profile: binding.profile, clients, skills: skillReports };
}

export function installProject(home: string, dir: string, binding: Binding, port: number): ApplyReport {
  const absolute = resolve(dir);
  const report = applyProject(home, absolute, binding, port);
  const state = readState(home);
  state.projects[absolute] = binding;
  writeState(home, state);
  return report;
}

export function uninstallProject(home: string, dir: string) {
  const absolute = resolve(dir);
  const skills = PROJECT_SKILL_DIRS.map((sub) => linkSkills(join(absolute, sub), new Map(), join(home, "skills")));
  const clients = unregisterAll({ kind: "project", dir: absolute });
  for (const file of PROJECT_CONFIG_FILES) {
    removeIfEmptyToml(join(absolute, file));
  }
  writeGitExclude(absolute, []);
  const state = readState(home);
  delete state.projects[absolute];
  writeState(home, state);
  return { dir: absolute, clients, skills };
}

export function linkGlobalSkills(home: string): LinkReport[] {
  const skillsRoot = join(home, "skills");
  let skills = new Map<string, string>();
  if (existsSync(join(skillsRoot, GLOBAL_SET))) {
    skills = collectSkills(skillsRoot, [GLOBAL_SET]);
  }
  return USER_SKILL_DIRS.map((target) => linkSkills(target, skills, skillsRoot));
}

export function installGlobal(home: string, transport: Transport, port: number) {
  resolveProfile(loadConfig(home), GLOBAL_SET);
  const clients = registerAll(endpointFor(home, GLOBAL_SET, transport, port), { kind: "user" });
  return { clients, skills: linkGlobalSkills(home) };
}

/** Re-applies skills and gateway entries for every installed project, after edits to the hub. */
export function syncAll(home: string, port: number) {
  const projects: ApplyReport[] = [];
  const missing: string[] = [];
  for (const [dir, binding] of Object.entries(readState(home).projects)) {
    if (!existsSync(dir)) {
      missing.push(dir);
      continue;
    }
    projects.push(applyProject(home, dir, binding, port));
  }
  return { global: linkGlobalSkills(home), projects, missing };
}

export function listProjects(home: string) {
  return readState(home).projects;
}
