import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
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
