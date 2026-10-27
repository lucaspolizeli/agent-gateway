import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Config } from "../config.ts";
import { UserError } from "../errors.ts";
import { writeFileAtomic } from "../fsutil.ts";
import { userSkillDirs } from "../project.ts";
import { GLOBAL_SET, parseFrontmatter } from "../skills.ts";
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

/** Whether anything, a dangling symlink included, is at `path`. */
function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

/**
 * Whether `path` is a real directory (or file) of the hub: not a symlink itself, and with a real path
 * under the real `<home>/skills`. The root may be a symlink the user set up; nothing inside it may be.
 */
function isHubEntry(home: string, path: string, kind: "dir" | "file"): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined || stat.isSymbolicLink()) {
    return false;
  }
  if (kind === "dir" && !stat.isDirectory()) {
    return false;
  }
  if (kind === "file" && !stat.isFile()) {
    return false;
  }
  try {
    return realpathSync(path).startsWith(realpathSync(skillsRoot(home)) + sep);
  } catch {
    return false;
  }
}

function summary(dir: string, set: string): SkillSummary {
  const fields = parseFrontmatter(readFileSync(join(dir, SKILL_FILE), "utf8"));
  return { name: basename(dir), set, description: fields.description ?? "" };
}

function skillDir(home: string, set: string, name: string): string {
  return join(skillsRoot(home), set, name);
}

function requireSet(home: string, set: string) {
  if (!isHubEntry(home, join(skillsRoot(home), set), "dir")) {
    throw new UserError("notFound", `No skill set named "${set}"`);
  }
}

function requireSkill(home: string, set: string, name: string): string {
  requireSet(home, set);
  const dir = skillDir(home, set, name);
  if (!isHubEntry(home, dir, "dir") || !isHubEntry(home, join(dir, SKILL_FILE), "file")) {
    throw new UserError("notFound", `No skill "${name}" in set "${set}"`);
  }
  return dir;
}

function requireFree(home: string, set: string, name: string) {
  if (exists(skillDir(home, set, name))) {
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
        .filter((skill) => skill.isDirectory() && isHubEntry(home, join(root, set, skill.name, SKILL_FILE), "file"))
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

/** Regular files under `dir`. `readdir`'s recursive mode would follow a symlinked folder out of the skill, so this walks by hand. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(path);
    }
    if (entry.isFile()) {
      return [path];
    }
    return [];
  });
}

export function readSkill(home: string, set: string, name: string): SkillDocument {
  const dir = requireSkill(home, set, name);
  const files = listFiles(dir)
    .map((path) => relative(dir, path))
    .filter((path) => path !== SKILL_FILE)
    .sort();
  return { ...summary(dir, set), content: readFileSync(join(dir, SKILL_FILE), "utf8"), files };
}

/** Writes SKILL.md, creating the skill folder when missing. Returns whether the skill is new. */
export function writeSkill(home: string, set: string, name: string, content: string): boolean {
  requireSet(home, set);
  const fields = parseFrontmatter(content);
  if (fields.name !== name) {
    throw new UserError("invalid", `O frontmatter do SKILL.md precisa começar com "---" e ter "name: ${name}"`);
  }
  if (!fields.description) {
    throw new UserError("invalid", `O frontmatter do SKILL.md precisa de uma "description"`);
  }
  const dir = skillDir(home, set, name);
  const file = join(dir, SKILL_FILE);
  if ((exists(dir) && !isHubEntry(home, dir, "dir")) || (exists(file) && !isHubEntry(home, file, "file"))) {
    throw new UserError("conflict", `"${name}" in set "${set}" is a link or something other than a skill folder of the hub`);
  }
  const created = !exists(file);
  writeFileAtomic(join(dir, SKILL_FILE), content, { mode: 0o644 });
  return created;
}

export function createSet(home: string, set: string) {
  const dir = join(skillsRoot(home), set);
  if (exists(dir)) {
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
