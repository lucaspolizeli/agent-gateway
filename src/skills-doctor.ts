import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { CliName, CliProbe, SkillDoctorRow, SkillsDoctorReport } from "./admin/contract.ts";
import { loadConfig, resolveProfile } from "./config.ts";
import { errorMessage, UserError } from "./errors.ts";
import { listProjects, PROJECT_SKILL_DIRS } from "./project.ts";
import { collectSkills, GLOBAL_SET, skillProblems } from "./skills.ts";
import { description, isRealDir, listUserSkills, SKILL_FILE, skillEntries, type UserSkill } from "./user-skills.ts";

/** What a CLI reports it discovers: skill names, and for Codex the folders it scanned. */
export type Discovery = { names: Set<string>; roots: string[] };

/** The `system/init` line of `claude -p --output-format stream-json --verbose`, or undefined until it has arrived. */
export function parseClaudeProbe(stdout: string): Discovery | undefined {
  for (const line of stdout.split("\n").slice(0, -1)) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof event !== "object" || event === null) {
      continue;
    }
    const { type, subtype, skills } = event as { type?: unknown; subtype?: unknown; skills?: unknown };
    if (type === "system" && subtype === "init" && Array.isArray(skills)) {
      return { names: new Set(skills.filter((name): name is string => typeof name === "string")), roots: [] };
    }
  }
  return undefined;
}

/**
 * The `<skills_instructions>` block of `codex debug prompt-input`: entries `- <name>: <description> (file: <path>)`,
 * where a path is absolute or starts with a root alias from the `- \`r1\` = \`/abs\`` table.
 */
export function parseCodexProbe(stdout: string): Discovery | undefined {
  let messages: unknown;
  try {
    messages = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(messages)) {
    return undefined;
  }
  const texts = messages.flatMap((message: { content?: Array<{ text?: unknown }> }) =>
    (message.content ?? []).map((part) => part.text).filter((text): text is string => typeof text === "string"),
  );
  const block = texts.map((text) => /<skills_instructions>([\s\S]*?)<\/skills_instructions>/.exec(text)?.[1]).find((match) => match !== undefined);
  const discovery: Discovery = { names: new Set(), roots: [] };
  if (block === undefined) {
    return discovery;
  }
  for (const line of block.split("\n")) {
    const root = /^- `(r\d+)` = `(.+)`$/.exec(line);
    if (root) {
      discovery.roots.push(root[2]!);
      continue;
    }
    const entry = /^- (\S+): .*\(file: .+\)$/.exec(line);
    if (entry) {
      discovery.names.add(entry[1]!);
    }
  }
  return discovery;
}

/**
 * The `Skills (N)` section of `grok inspect`: lines `└ <name>  <source> [tags]`. Plugin and bundled skills are
 * left out, so a plugin skill with the same name never stands in for a missing user or project skill, and so is
 * a disabled one.
 */
export function parseGrokProbe(stdout: string): Discovery | undefined {
  const lines = stdout.split("\n");
  const start = lines.findIndex((line) => /^\s*Skills \((\d+|None)\)\s*$/.test(line));
  if (start === -1) {
    return undefined;
  }
  const names = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    const entry = /^\s*└\s+(\S+)\s{2,}(.+)$/.exec(line);
    if (!entry) {
      break;
    }
    const source = entry[2]!;
    if (!/^(plugin\b|bundled\b)/.test(source) && !source.includes("[disabled]")) {
      names.add(entry[1]!);
    }
  }
  return { names, roots: [] };
}

type ProbeSpec = {
  args: string[];
  timeoutMs: number;
  parse: (stdout: string) => Discovery | undefined;
  /** Stop the CLI as soon as `parse` has its answer instead of waiting for it to exit. */
  stopEarly: boolean;
};

/** How to ask each CLI what it discovers without a model call. Claude only prints its init line on the way to one, so it is stopped there. */
const PROBES: Record<CliName, ProbeSpec> = {
  claude: {
    args: ["-p", "--output-format", "stream-json", "--verbose", "--model", "haiku", "ok"],
    timeoutMs: 60_000,
    parse: parseClaudeProbe,
    stopEarly: true,
  },
  codex: { args: ["debug", "prompt-input"], timeoutMs: 20_000, parse: parseCodexProbe, stopEarly: false },
  grok: { args: ["inspect"], timeoutMs: 20_000, parse: parseGrokProbe, stopEarly: false },
};

const CLI_NAMES = Object.keys(PROBES) as CliName[];

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1) ?? "";
}

function runProbe(cli: CliName, cwd: string): Promise<Discovery> {
  const spec = PROBES[cli];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, spec.args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.off("exit", kill);
      kill();
      child.stdout.destroy();
      child.stderr.destroy();
      outcome();
    };
    const kill = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    };
    process.once("exit", kill);
    const timer = setTimeout(() => finish(() => reject(new Error(`no answer after ${spec.timeoutMs / 1000}s`))), spec.timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (spec.stopEarly) {
        const discovery = spec.parse(stdout);
        if (discovery !== undefined) {
          finish(() => resolvePromise(discovery));
        }
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(() => reject(new Error(`${cli} could not run: ${errorMessage(error)}`))));
    child.on("close", (code) => {
      const discovery = spec.parse(`${stdout}\n`);
      if (discovery !== undefined) {
        finish(() => resolvePromise(discovery));
      } else if (code !== 0) {
        finish(() => reject(new Error(`${cli} exited with ${code}: ${lastLine(stderr) || lastLine(stdout)}`)));
      } else {
        finish(() => reject(new Error(`${cli} printed no skills list`)));
      }
    });
  });
}

/** Codex leaves out of the prompt a skill whose `agents/openai.yaml` turns off implicit invocation, though `$name` still runs it. */
function explicitOnly(dir: string): boolean {
  const policy = join(dir, "agents", "openai.yaml");
  return existsSync(policy) && /^\s*allow_implicit_invocation:\s*false\b/m.test(readFileSync(policy, "utf8"));
}

function sees(discovery: Discovery, skill: UserSkill): boolean {
  if (discovery.names.has(skill.name)) {
    return true;
  }
  return explicitOnly(skill.dir) && discovery.roots.some((root) => existsSync(join(root, skill.name, SKILL_FILE)));
}

/** The skills of the profile a project is installed with, its own real skill folders, then the user-level ones, deduped by name. */
function projectSkills(home: string, dir: string): UserSkill[] {
  const skills: UserSkill[] = [];
  const binding = listProjects(home)[dir];
  if (binding !== undefined) {
    const sets = resolveProfile(loadConfig(home), binding.profile).skillSets.filter((set) => set !== GLOBAL_SET);
    for (const [name, path] of collectSkills(join(home, "skills"), sets)) {
      skills.push({ name, description: description(path), origin: { kind: "hub", set: basename(dirname(path)) }, dir: path });
    }
  }
  for (const sub of PROJECT_SKILL_DIRS) {
    for (const name of skillEntries(join(dir, sub))) {
      const path = join(dir, sub, name);
      if (isRealDir(path)) {
        skills.push({ name, description: description(path), origin: { kind: "unmanaged", path }, dir: path });
      }
    }
  }
  return skills;
}

function dedupe(skills: UserSkill[]): UserSkill[] {
  const byName = new Map<string, UserSkill>();
  for (const skill of skills) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()];
}

/** Skill dirs the three CLIs read, under $HOME or a project. */
const SKILL_DIRS = [".claude/skills", ".agents/skills", ".grok/skills"];

function brokenLinks(dirs: string[]): string[] {
  return dirs.flatMap((dir) => {
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((path) => lstatSync(path).isSymbolicLink() && !existsSync(path));
  });
}

/**
 * Asks Claude Code, Codex and Grok which skills they discover in `dir`, or at user level (run from $HOME) when
 * `dir` is undefined, and checks each expected skill against every answer. A probe that fails counts as seeing nothing.
 */
export async function runSkillsDoctor(home: string, dir?: string): Promise<SkillsDoctorReport> {
  let projectDir: string | null = null;
  let expected = listUserSkills(home);
  if (dir !== undefined) {
    projectDir = resolve(dir);
    if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
      throw new UserError("invalid", `${projectDir}: the folder must exist`);
    }
    expected = dedupe([...projectSkills(home, projectDir), ...expected]);
  }
  const cwd = projectDir ?? homedir();

  const settled = await Promise.allSettled(CLI_NAMES.map((cli) => runProbe(cli, cwd)));
  const probes = {} as Record<CliName, CliProbe>;
  const discoveries = {} as Record<CliName, Discovery>;
  for (const [index, cli] of CLI_NAMES.entries()) {
    const outcome = settled[index]!;
    if (outcome.status === "fulfilled") {
      probes[cli] = { ok: true, count: outcome.value.names.size };
      discoveries[cli] = outcome.value;
    } else {
      probes[cli] = { ok: false, error: errorMessage(outcome.reason) };
      discoveries[cli] = { names: new Set(), roots: [] };
    }
  }

  const rows = expected.map(
    (skill): SkillDoctorRow => ({
      name: skill.name,
      origin: skill.origin,
      visible: { claude: sees(discoveries.claude, skill), codex: sees(discoveries.codex, skill), grok: sees(discoveries.grok, skill) },
      problems: skillProblems(skill.name, readFileSync(join(skill.dir, SKILL_FILE), "utf8")),
    }),
  );
  return { dir: projectDir, probes, rows, brokenLinks: brokenLinks(SKILL_DIRS.map((sub) => join(cwd, sub))) };
}
