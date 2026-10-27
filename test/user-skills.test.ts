import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createSandbox, type Sandbox } from "./support/sandbox.ts";

function writeSkill(dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} things\n---\nBody\n`);
}

/** The machine as the `skills` CLI and the user leave it: a lock, its folders and links, and folders nothing manages. */
function userLevel(sandbox: Sandbox) {
  const claude = join(sandbox.userHome, ".claude", "skills");
  const agents = join(sandbox.userHome, ".agents", "skills");
  writeSkill(join(agents, "tdd"), "tdd");
  writeSkill(join(agents, "grill"), "grill");
  writeSkill(join(agents, "reporting"), "reporting");
  writeFileSync(
    join(sandbox.userHome, ".agents", ".skill-lock.json"),
    JSON.stringify({ version: 3, skills: { tdd: { source: "mattpocock/skills" }, grill: { source: "mattpocock/skills" } } }),
  );
  mkdirSync(claude, { recursive: true });
  symlinkSync(join("..", "..", ".agents", "skills", "tdd"), join(claude, "tdd"));
  writeSkill(join(claude, "hours"), "hours");
  mkdirSync(join(claude, "synced"));
  mkdirSync(join(claude, ".trash"));
  return { claude, agents };
}

test("sync gives every user-level skill an entry in both user skill dirs and leaves foreign entries alone", () => {
  const sandbox = createSandbox();
  const { claude, agents } = userLevel(sandbox);

  const result = sandbox.agw(["sync"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`skills ${claude}: \\+3 -0\\n    linked: g1, grill, reporting`));
  assert.match(result.stdout, new RegExp(`skills ${agents}: \\+2 -0\\n    linked: g1, hours`));

  assert.deepEqual(readdirSync(claude).sort(), [".trash", "g1", "grill", "hours", "reporting", "synced", "tdd"]);
  assert.deepEqual(readdirSync(agents).sort(), ["g1", "grill", "hours", "reporting", "tdd"]);
  assert.equal(readlinkSync(join(claude, "grill")), join("..", "..", ".agents", "skills", "grill"));
  assert.equal(readlinkSync(join(agents, "hours")), join("..", "..", ".claude", "skills", "hours"));
  assert.equal(readlinkSync(join(claude, "tdd")), join("..", "..", ".agents", "skills", "tdd"), "the skills CLI's link is kept");
  assert.equal(lstatSync(join(claude, "hours")).isDirectory(), true);
  assert.equal(realpathSync(join(claude, "g1")), realpathSync(join(sandbox.home, "skills", "global", "g1")));

  const again = sandbox.agw(["sync"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, new RegExp(`skills ${claude}: \\+0 -0\\n`));
  assert.match(again.stdout, new RegExp(`skills ${agents}: \\+0 -0\\n`));
});
test("skills list shows every user-level skill once with its origin, hub first", () => {
  const sandbox = createSandbox();
  userLevel(sandbox);
  const result = sandbox.agw(["skills", "list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "  g1         hub global",
    "  hours      unmanaged",
    "  tdd        managed mattpocock/skills",
    "  grill      managed mattpocock/skills",
    "  reporting  unmanaged",
  ]);
});

function claudeInit(skills: string[]): string {
  return `${JSON.stringify({ type: "system", subtype: "hook_started" })}\n${JSON.stringify({ type: "system", subtype: "init", skills })}\n`;
}

function codexPrompt(root: string, skills: string[]): string {
  const entries = skills.map((name) => `- ${name}: ${name} things (file: r0/${name}/SKILL.md)`);
  const text = ["<skills_instructions>", "### Skill roots", `- \`r0\` = \`${root}\``, "### Available skills", ...entries, "</skills_instructions>"].join("\n");
  return JSON.stringify([{ type: "message", role: "developer", content: [{ type: "input_text", text }] }]);
}

function grokInspect(skills: Array<[string, string]>): string {
  const lines = skills.map(([name, source]) => `  └ ${name.padEnd(20)}  ${source}`);
  return ["  Environment", "  └ Version: 1.0.70", "", `  Skills (${skills.length})`, ...lines, "", "  Agents (1)", "  └ plan  builtin", ""].join("\n");
}

test("skills doctor at user level marks what each CLI misses, frontmatter problems and broken links", () => {
  const sandbox = createSandbox();
  const { agents } = userLevel(sandbox);
  writeFileSync(join(sandbox.userHome, ".claude", "skills", "hours", "SKILL.md"), "---\nname: hours-log\ndescription: hours\n---\n");
  mkdirSync(join(agents, "grill", "agents"));
  writeFileSync(join(agents, "grill", "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
  mkdirSync(join(sandbox.userHome, ".grok", "skills"), { recursive: true });
  symlinkSync(join(sandbox.userHome, "nowhere"), join(sandbox.userHome, ".grok", "skills", "gone"));
  sandbox.probe("claude", claudeInit(["g1", "hours", "tdd", "pstack:grill"]));
  sandbox.probe("codex", codexPrompt(agents, ["tdd", "reporting"]));
  sandbox.probe("grok", grokInspect([["g1", "user"], ["hours", "user"], ["tdd", "user"], ["grill", "plugin: pstack"]]));

  const started = Date.now();
  const result = sandbox.agw(["skills", "doctor"]);
  assert.ok(Date.now() - started < 15_000, "the claude probe is stopped once it has printed its init line");
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "Skills doctor: user level",
    "  claude ok, 4 skills discovered",
    "  codex  ok, 2 skills discovered",
    "  grok   ok, 3 skills discovered",
    "  name       origin                     claude codex grok  problems",
    "  g1         hub global                 ✓      ✗     ✓",
    `  hours      unmanaged                  ✓      ✗     ✓     "name: hours-log" does not match the folder name "hours"`,
    "  tdd        managed mattpocock/skills  ✓      ✓     ✓",
    "  grill      managed mattpocock/skills  ✗      ✓     ✗",
    "  reporting  unmanaged                  ✗      ✓     ✗",
    "  broken links:",
    `    ${join(sandbox.userHome, ".grok", "skills", "gone")}`,
    "Summary: 5 skills, 4 hidden from some CLI, 1 with problems, 0 probes failed, 1 broken links",
  ]);
  const probes = sandbox.cliLog().filter((line) => line.includes(" probe in "));
  assert.deepEqual(probes.map((line) => line.split(" probe in ")[1]).map((dir) => realpathSync(dir!)), Array(3).fill(realpathSync(sandbox.userHome)));
});

test("skills doctor in a project expects its hub sets and own skill folders, and a failed probe never passes", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("app");
  assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  writeSkill(join(project, ".agents", "skills", "local"), "local");
  const everything = ["deploy", "local", "g1"];
  sandbox.probe("claude", claudeInit(everything));
  sandbox.probe("codex", codexPrompt(join(project, ".agents", "skills"), everything));
  sandbox.probe("grok", grokInspect(everything.map((name) => [name, "project"])));

  const clean = sandbox.agw(["skills", "doctor", project]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, new RegExp(`^Skills doctor: ${project}\\n`));
  assert.match(clean.stdout, /\n {2}deploy {2}hub globex +✓ {6}✓ {5}✓\n {2}local {3}unmanaged +✓ {6}✓ {5}✓\n {2}g1 {6}hub global +✓ {6}✓ {5}✓\n/);
  assert.match(clean.stdout, /Summary: 3 skills, 0 hidden from some CLI, 0 with problems, 0 probes failed, 0 broken links/);

  rmSync(join(sandbox.base, "fake-state", "grok.probe"));
  const failed = sandbox.agw(["skills", "doctor", project]);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /\n {2}grok {3}FAIL grok exited with 2: grok: not logged in\n/);
  assert.match(failed.stdout, /\n {2}deploy {2}hub globex +✓ {6}✓ {5}✗\n/);
  assert.match(failed.stdout, /Summary: 3 skills, 3 hidden from some CLI, 0 with problems, 1 probes failed/);
});

test("skills import takes a folder nothing manages into the hub and refuses one the skills CLI installed", () => {
  const sandbox = createSandbox();
  const { claude, agents } = userLevel(sandbox);
  assert.equal(sandbox.agw(["sync"]).status, 0);

  const imported = sandbox.agw(["skills", "import", join(claude, "hours"), "global"]);
  assert.equal(imported.status, 0, imported.stderr);
  const hubFolder = join(sandbox.home, "skills", "global", "hours");
  assert.equal(readlinkSync(join(claude, "hours")), hubFolder);
  assert.equal(readlinkSync(join(agents, "hours")), hubFolder, "the link to the old folder is replaced by a hub link");

  const refused = sandbox.agw(["skills", "import", join(agents, "tdd"), "global"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /is not an importable skill folder/);
  assert.equal(lstatSync(join(agents, "tdd")).isDirectory(), true);
});
