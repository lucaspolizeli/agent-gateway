import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export type LinkReport = { target: string; linked: string[]; removed: string[]; skipped: string[] };

/** Skill set that is linked into the user-level skill folders instead of into projects. */
export const GLOBAL_SET = "global";

/** Skill name -> absolute skill folder. A later set overrides an earlier one with the same skill name. */
export function collectSkills(skillsRoot: string, sets: string[]): Map<string, string> {
  const skills = new Map<string, string>();
  for (const set of sets) {
    const setDir = join(skillsRoot, set);
    if (!existsSync(setDir)) {
      throw new Error(`Skill set "${set}" has no folder at ${setDir}`);
    }
    for (const entry of readdirSync(setDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(setDir, entry.name, "SKILL.md"))) {
        skills.set(entry.name, join(setDir, entry.name));
      }
    }
  }
  return skills;
}

function isInside(path: string, root: string): boolean {
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
