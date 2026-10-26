import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectSkills, linkSkills } from "../src/skills.ts";

function makeSkill(root: string, set: string, name: string) {
  mkdirSync(join(root, set, name), { recursive: true });
  writeFileSync(join(root, set, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
}

test("links the profile's skills, prunes stale hub links, and never touches foreign entries", () => {
  const base = mkdtempSync(join(tmpdir(), "agw-skills-"));
  const hub = join(base, "hub");
  const target = join(base, "project", ".claude", "skills");
  makeSkill(hub, "globex", "deploy");
  makeSkill(hub, "globex", "review");
  makeSkill(hub, "globex-med", "review");
  makeSkill(hub, "acme", "stale");
  mkdirSync(join(target, "deploy"), { recursive: true });
  symlinkSync(join(hub, "acme", "stale"), join(target, "stale"));
  symlinkSync(join(base, "elsewhere"), join(target, "foreign"));

  const report = linkSkills(target, collectSkills(hub, ["globex", "globex-med"]), hub);

  assert.deepEqual(report.linked, ["review"]);
  assert.deepEqual(report.removed, ["stale"]);
  assert.deepEqual(report.skipped, ["deploy"]);
  assert.equal(readlinkSync(join(target, "review")), join(hub, "globex-med", "review"));
  assert.equal(lstatSync(join(target, "deploy")).isDirectory(), true);
  assert.deepEqual(readdirSync(target).sort(), ["deploy", "foreign", "review"]);

  const again = linkSkills(target, collectSkills(hub, ["globex", "globex-med"]), hub);
  assert.deepEqual([again.linked, again.removed], [[], []]);
});
