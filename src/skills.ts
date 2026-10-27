import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { UserError } from "./errors.ts";

export type LinkReport = { target: string; linked: string[]; removed: string[]; skipped: string[] };

/** Skill set that is linked into the user-level skill folders instead of into projects. */
export const GLOBAL_SET = "global";

/** Skill name -> absolute skill folder. A later set overrides an earlier one with the same skill name. */
export function collectSkills(skillsRoot: string, sets: string[]): Map<string, string> {
  const skills = new Map<string, string>();
  for (const set of sets) {
    const setDir = join(skillsRoot, set);
    if (!existsSync(setDir)) {
      throw new UserError("invalid", `Skill set "${set}" has no folder at ${setDir}`);
    }
    for (const entry of readdirSync(setDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(setDir, entry.name, "SKILL.md"))) {
        skills.set(entry.name, join(setDir, entry.name));
      }
    }
  }
  return skills;
}

export function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * Makes `target` hold exactly one symlink per skill in `skills`. Only symlinks that point into
 * `skillsRoot` are ever removed; real folders and foreign symlinks are left alone and reported.
 */
export function linkSkills(target: string, skills: Map<string, string>, skillsRoot: string): LinkReport {
  const root = resolve(skillsRoot);
  const report: LinkReport = { target, linked: [], removed: [], skipped: [] };
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(target)) {
    const path = join(target, entry);
    if (!lstatSync(path).isSymbolicLink()) {
      continue;
    }
    const pointsTo = resolve(target, readlinkSync(path));
    if (isInside(pointsTo, root) && skills.get(entry) !== pointsTo) {
      rmSync(path);
      report.removed.push(entry);
    }
  }

  for (const [name, source] of skills) {
    const path = join(target, name);
    if (!existsSync(path) && !isBrokenLink(path)) {
      symlinkSync(source, path, "dir");
      report.linked.push(name);
      continue;
    }
    const isOurs = lstatSync(path).isSymbolicLink() && resolve(target, readlinkSync(path)) === source;
    if (!isOurs) {
      report.skipped.push(name);
    }
  }
  return report;
}

function isBrokenLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
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

/** The `name` rule of the Agent Skills spec, which Claude Code, Codex and Grok enforce. */
const SPEC_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

/** Frontmatter of the SKILL.md in folder `folder` that a CLI would reject or skip, one sentence per problem. */
export function skillProblems(folder: string, content: string): string[] {
  const fields = parseFrontmatter(content);
  const problems: string[] = [];
  const name = fields.name;
  if (!name) {
    problems.push(`o frontmatter não tem "name"`);
  } else {
    if (name !== folder) {
      problems.push(`"name: ${name}" é diferente do nome da pasta "${folder}"`);
    }
    if (!SPEC_NAME.test(name)) {
      problems.push(`"name" só pode ter letras minúsculas, dígitos e hífens simples entre eles`);
    }
    if (name.length > MAX_NAME) {
      problems.push(`"name" tem ${name.length} caracteres, o máximo é ${MAX_NAME}`);
    }
  }
  const description = fields.description;
  if (!description) {
    problems.push(`o frontmatter não tem "description"`);
  } else if (description.length > MAX_DESCRIPTION) {
    problems.push(`"description" tem ${description.length} caracteres, o máximo é ${MAX_DESCRIPTION}`);
  }
  return problems;
}
