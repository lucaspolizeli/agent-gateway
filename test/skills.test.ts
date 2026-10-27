import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectSkills, linkSkills, skillProblems } from "../src/skills.ts";

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

test("frontmatter that a CLI would reject or skip is reported, one problem per rule", () => {
  const skill = (fields: string) => `---\n${fields}\n---\nBody\n`;
  assert.deepEqual(skillProblems("deploy", skill("name: deploy\ndescription: Ships it")), []);
  assert.deepEqual(skillProblems("deploy", skill("name: >\n  deploy\ndescription: |\n  Ships\n  it")), []);
  assert.deepEqual(skillProblems("deploy", "no frontmatter"), [`o frontmatter não tem "name"`, `o frontmatter não tem "description"`]);
  assert.deepEqual(skillProblems("deploy", skill("name: ship\ndescription: x")), [`"name: ship" é diferente do nome da pasta "deploy"`]);
  assert.deepEqual(skillProblems("Deploy_It", skill("name: Deploy_It\ndescription: x")), [
    `"name" só pode ter letras minúsculas, dígitos e hífens simples entre eles`,
  ]);
  assert.deepEqual(skillProblems("a--b", skill("name: a--b\ndescription: x")), [
    `"name" só pode ter letras minúsculas, dígitos e hífens simples entre eles`,
  ]);
  const long = "a".repeat(65);
  assert.deepEqual(skillProblems(long, skill(`name: ${long}\ndescription: x`)), [`"name" tem 65 caracteres, o máximo é 64`]);
  assert.deepEqual(skillProblems("a".repeat(64), skill(`name: ${"a".repeat(64)}\ndescription: ${"d".repeat(1024)}`)), []);
  assert.deepEqual(skillProblems("deploy", skill(`name: deploy\ndescription: ${"d".repeat(1025)}`)), [
    `"description" tem 1025 caracteres, o máximo é 1024`,
  ]);
});
