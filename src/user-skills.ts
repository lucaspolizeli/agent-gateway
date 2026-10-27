import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import type { SkillOrigin } from "./admin/contract.ts";
import { UserError } from "./errors.ts";
import { collectSkills, GLOBAL_SET, linkSkills, type LinkReport, parseFrontmatter } from "./skills.ts";

/** User-level skill folders: Claude Code (and Grok) read `~/.claude/skills`, Codex reads `~/.agents/skills`. Read through `os.homedir()` on every call. */
export function userSkillDirs(): string[] {
  return [join(homedir(), ".claude", "skills"), join(homedir(), ".agents", "skills")];
}

/** Folder names a skill may have: no separators and no leading dot, so a name never leaves its set. */
export const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const SKILL_FILE = "SKILL.md";

/** A skill the CLIs can see at user level, and the folder they read it from. */
export type UserSkill = { name: string; description: string; origin: SkillOrigin; dir: string };

const SkillLockSchema = z.object({ skills: z.record(z.string(), z.object({ source: z.string() })) });

/** Skill name -> source, for the skills the vercel `skills` CLI installed and keeps updating in place. */
export function readSkillLock(): Map<string, string> {
  const path = join(homedir(), ".agents", ".skill-lock.json");
  if (!existsSync(path)) {
    return new Map();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new UserError("invalid", `${path} is not valid JSON`);
  }
  const parsed = SkillLockSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UserError("invalid", `${path} has no "skills" map of { source } entries`);
  }
  return new Map(Object.entries(parsed.data.skills).map(([name, entry]) => [name, entry.source]));
}

export function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

function realPath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

export function description(dir: string): string {
  return parseFrontmatter(readFileSync(join(dir, SKILL_FILE), "utf8")).description ?? "";
}

/** Entries of `dir` that are skills: a valid name and a SKILL.md, through a symlink or not. Dangling links and plain folders are not. */
export function skillEntries(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => SKILL_NAME.test(name) && existsSync(join(dir, name, SKILL_FILE)))
    .sort();
}

export function isRealDir(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * Origin of the skill at `path`, an entry of a user or project skill dir: a link into the hub, a skill the
 * `skills` CLI installed, or anything else, which nothing manages.
 */
export function originOf(home: string, path: string, name: string, lock: Map<string, string>): SkillOrigin {
  const hub = realPath(join(home, "skills"));
  const target = realPath(path);
  if (hub !== undefined && target !== undefined && isInside(target, hub)) {
    return { kind: "hub", set: relative(hub, target).split(sep)[0]! };
  }
  const source = lock.get(name);
  if (source !== undefined) {
    return { kind: "managed", source };
  }
  if (isRealDir(path)) {
    return { kind: "unmanaged", path };
  }
  return { kind: "unmanaged", path: target ?? path };
}

/** Every skill the CLIs see at user level, deduped by name: the hub's global set first, then the user skill dirs. */
export function listUserSkills(home: string): UserSkill[] {
  const skillsRoot = join(home, "skills");
  const skills = new Map<string, UserSkill>();
  if (existsSync(join(skillsRoot, GLOBAL_SET))) {
    for (const [name, dir] of [...collectSkills(skillsRoot, [GLOBAL_SET])].sort(([a], [b]) => a.localeCompare(b))) {
      skills.set(name, { name, description: description(dir), origin: { kind: "hub", set: GLOBAL_SET }, dir });
    }
  }
  const lock = readSkillLock();
  for (const dir of userSkillDirs()) {
    for (const name of skillEntries(dir)) {
      if (!skills.has(name)) {
        const path = join(dir, name);
        skills.set(name, { name, description: description(path), origin: originOf(home, path, name, lock), dir: path });
      }
    }
  }
  return [...skills.values()];
}

/**
 * Links the hub's global set into every user skill dir, then gives every other user-level skill an entry in
 * the dirs that lack one: a relative link to its real folder, the kind the `skills` CLI makes, so Claude Code,
 * Codex and Grok all see it. An existing entry is never replaced, so the `skills` CLI's own links stay as they are.
 */
export function linkUserSkills(home: string): LinkReport[] {
  const skillsRoot = join(home, "skills");
  let hub = new Map<string, string>();
  if (existsSync(join(skillsRoot, GLOBAL_SET))) {
    hub = collectSkills(skillsRoot, [GLOBAL_SET]);
  }
  const reports = userSkillDirs().map((target) => linkSkills(target, hub, skillsRoot));
  for (const skill of listUserSkills(home)) {
    const folder = realPath(skill.dir);
    if (skill.origin.kind === "hub" || folder === undefined) {
      continue;
    }
    for (const report of reports) {
      const path = join(report.target, skill.name);
      if (lstatSync(path, { throwIfNoEntry: false }) === undefined) {
        symlinkSync(relative(realpathSync(report.target), folder), path, "dir");
        report.linked.push(skill.name);
      }
    }
  }
  return reports;
}
