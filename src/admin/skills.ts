import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Config } from "../config.ts";
import { UserError } from "../errors.ts";
import { writeFileAtomic } from "../fsutil.ts";
import { userSkillDirs } from "../project.ts";
import { GLOBAL_SET } from "../skills.ts";
import type { ImportableSkill, SkillDocument, SkillSet, SkillSummary } from "./contract.ts";

/** Folder names a skill may have: no separators and no leading dot, so a name never leaves its set. */
export const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const SKILL_FILE = "SKILL.md";

function skillsRoot(home: string): string {
  return join(home, "skills");
}

function isRealDir(path: string): boolean {
  return existsSync(path) && lstatSync(path).isDirectory();
}

/** `key: value` pairs of the leading `---` block. Folded (`>`) and literal (`|`) values are joined into one line. */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) {
    return {};
  }
  const fields: Record<string, string> = {};
  let current: string | undefined;
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (field) {
      current = field[1]!;
      fields[current] = unquote(field[2]!.trim()).replace(/^[>|][-+]?$/, "");
    } else if (current && /^\s+\S/.test(line)) {
      fields[current] = `${fields[current]} ${line.trim()}`.trim();
    }
  }
  return fields;
}

function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

function summary(dir: string, set: string): SkillSummary {
  const fields = parseFrontmatter(readFileSync(join(dir, SKILL_FILE), "utf8"));
  return { name: basename(dir), set, description: fields.description ?? "" };
}

function skillDir(home: string, set: string, name: string): string {
  return join(skillsRoot(home), set, name);
}

function requireSet(home: string, set: string) {
  if (!isRealDir(join(skillsRoot(home), set))) {
    throw new UserError("notFound", `No skill set named "${set}"`);
  }
}

function requireSkill(home: string, set: string, name: string): string {
  const dir = skillDir(home, set, name);
  if (!existsSync(join(dir, SKILL_FILE))) {
    throw new UserError("notFound", `No skill "${name}" in set "${set}"`);
  }
  return dir;
}

function requireFree(home: string, set: string, name: string) {
  if (existsSync(skillDir(home, set, name))) {
    throw new UserError("conflict", `Set "${set}" already has a skill named "${name}"`);
  }
}

export function listSkillSets(home: string, config: Config): SkillSet[] {
  const root = skillsRoot(home);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): SkillSet => {
      const set = entry.name;
      const skills = readdirSync(join(root, set), { withFileTypes: true })
        .filter((skill) => skill.isDirectory() && existsSync(join(root, set, skill.name, SKILL_FILE)))
        .map((skill) => summary(join(root, set, skill.name), set));
      let scope: SkillSet["scope"] = "project";
      if (set === GLOBAL_SET) {
        scope = "user";
      }
      const usedBy = Object.entries(config.profiles)
        .filter(([, profile]) => profile.skills.includes(set))
        .map(([name]) => name);
      return { name: set, scope, skills, usedBy };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkill(home: string, set: string, name: string): SkillDocument {
  const dir = requireSkill(home, set, name);
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .filter((path) => path !== SKILL_FILE)
    .sort();
  return { ...summary(dir, set), content: readFileSync(join(dir, SKILL_FILE), "utf8"), files };
}

/** Writes SKILL.md, creating the skill folder when missing. Returns whether the skill is new. */
export function writeSkill(home: string, set: string, name: string, content: string): boolean {
  requireSet(home, set);
  const fields = parseFrontmatter(content);
  if (fields.name !== name) {
    throw new UserError("invalid", `SKILL.md frontmatter must start with "---" and have "name: ${name}"`);
  }
  if (!fields.description) {
    throw new UserError("invalid", "SKILL.md frontmatter needs a description");
  }
  const dir = skillDir(home, set, name);
  const created = !existsSync(join(dir, SKILL_FILE));
  writeFileAtomic(join(dir, SKILL_FILE), content, { mode: 0o644 });
  return created;
}

export function createSet(home: string, set: string) {
  const dir = join(skillsRoot(home), set);
  if (existsSync(dir)) {
    throw new UserError("conflict", `Skill set "${set}" already exists`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitkeep"), "");
}

export function moveSkill(home: string, set: string, name: string, toSet: string) {
  const from = requireSkill(home, set, name);
  requireSet(home, toSet);
  if (set === toSet) {
    return;
  }
  requireFree(home, toSet, name);
  renameSync(from, skillDir(home, toSet, name));
}

export function deleteSkill(home: string, set: string, name: string) {
  rmSync(requireSkill(home, set, name), { recursive: true });
}

/** Real skill folders (not links into the hub) in the user-level skill dirs. */
export function listImportable(): ImportableSkill[] {
  return userSkillDirs().flatMap((dir) => {
    if (!isRealDir(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => SKILL_NAME.test(name) && isRealDir(join(dir, name)) && existsSync(join(dir, name, SKILL_FILE)))
      .map((name) => {
        const path = join(dir, name);
        return { name, path, description: summary(path, "").description };
      });
  });
}

/** Moves a listed importable folder into `toSet`. Only paths `listImportable` returns are accepted. */
export function importSkill(home: string, path: string, toSet: string): string {
  const skill = listImportable().find((candidate) => candidate.path === path);
  if (!skill) {
    throw new UserError("notFound", `${path} is not an importable skill folder`);
  }
  requireSet(home, toSet);
  requireFree(home, toSet, skill.name);
  const target = skillDir(home, toSet, skill.name);
  try {
    renameSync(path, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    cpSync(path, target, { recursive: true, verbatimSymlinks: true });
    rmSync(path, { recursive: true });
  }
  return skill.name;
}
