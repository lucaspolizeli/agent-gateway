import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createSandbox, git, initRepo } from "./support/sandbox.ts";

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

const COMMENTED = `# my codex settings
model = "gpt-5"  # do not touch

[profiles.fast]
# keep me
effort = "low"
`;

test("installing then uninstalling leaves a commented .codex/config.toml byte-identical", () => {
  const sandbox = createSandbox();
  const repo = join(sandbox.base, "tracked");
  initRepo(repo);
  mkdirSync(join(repo, ".codex"));
  writeFileSync(join(repo, ".codex", "config.toml"), COMMENTED);
  git(repo, "add", ".codex/config.toml");
  git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "codex config");

  const installed = sandbox.agw(["install", "work", repo]);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const afterInstall = readFileSync(join(repo, ".codex", "config.toml"), "utf8");
  assert.ok(afterInstall.startsWith(COMMENTED), "comments and formatting above the new table are untouched");
  assert.match(afterInstall, /\[mcp_servers\.gw\]/);

  const removed = sandbox.agw(["uninstall", repo]);
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  assert.equal(readFileSync(join(repo, ".codex", "config.toml"), "utf8"), COMMENTED);
  assert.equal(git(repo, "status", "--porcelain", "--untracked-files=all").trim(), "");
});

test("a config the gateway created is removed with its folder on uninstall", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("fresh");
  assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  assert.equal(existsSync(join(project, ".codex", "config.toml")), true);

  assert.equal(sandbox.agw(["uninstall", project]).status, 0);
  assert.deepEqual(readdirSync(project), [], "no .codex, .claude or .agents left behind");
});

test("uninstall keeps skill folders that still hold something", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("busy");
  mkdirSync(join(project, ".claude", "skills", "mine"), { recursive: true });
  writeFileSync(join(project, ".claude", "skills", "mine", "SKILL.md"), "mine\n");
  writeFileSync(join(project, ".claude", "settings.local.json"), "{}\n");
  mkdirSync(join(project, ".agents"));
  writeFileSync(join(project, ".agents", "notes.md"), "notes\n");

  assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  assert.equal(isLink(join(project, ".claude", "skills", "deploy")), true);
  assert.equal(sandbox.agw(["uninstall", project]).status, 0);

  assert.deepEqual(readdirSync(join(project, ".claude", "skills")), ["mine"]);
  assert.equal(existsSync(join(project, ".claude", "settings.local.json")), true);
  assert.equal(existsSync(join(project, ".agents", "skills")), false, "the emptied skills folder goes");
  assert.equal(existsSync(join(project, ".agents", "notes.md")), true, "its non-empty parent stays");
});

test("a failed client makes install, uninstall and global exit non-zero and say so", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("failing");
  sandbox.failClient("grok", "add");

  const install = sandbox.agw(["install", "work", project]);
  assert.notEqual(install.status, 0);
  assert.match(install.stdout, /FAIL grok: grok exploded/);
  assert.match(install.stdout, /Summary: 2 of 3 clients ok/);

  sandbox.failClient("grok", "add", false);
  const again = sandbox.agw(["install", "work", project]);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /Summary: 3 of 3 clients ok/);

  sandbox.failClient("claude", "remove");
  const uninstall = sandbox.agw(["uninstall", project]);
  assert.notEqual(uninstall.status, 0);
  assert.match(uninstall.stdout, /FAIL claude/);

  sandbox.failClient("codex", "add");
  const global = sandbox.agw(["global"]);
  assert.notEqual(global.status, 0);
  assert.match(global.stdout, /Summary: 2 of 3 clients ok/);
});

test("an uninstall whose client removal failed keeps the record and a retry finishes it", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("retry");
  assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  sandbox.failClient("grok", "remove");

  const first = sandbox.agw(["uninstall", project]);
  assert.notEqual(first.status, 0);
  assert.match(first.stdout, /still recorded/);
  assert.match(sandbox.agw(["list"]).stdout, new RegExp(`${project} -> work`));
  assert.equal(isLink(join(project, ".claude", "skills", "deploy")), false, "the skill links are removed regardless");
  assert.deepEqual(readdirSync(project).filter((name) => name !== ".grok"), [], "so are the other generated files");

  sandbox.failClient("grok", "remove", false);
  const retry = sandbox.agw(["uninstall", project]);
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.match(retry.stdout, /Summary: 3 of 3 clients ok/);
  assert.doesNotMatch(sandbox.agw(["list"]).stdout, new RegExp(project));

  const third = sandbox.agw(["uninstall", project]);
  assert.equal(third.status, 0, "uninstalling what is gone is not an error");
});

test("a corrupt .codex or .grok config does not stop the rest of the uninstall", () => {
  const sandbox = createSandbox();
  const repo = join(sandbox.base, "corrupt");
  initRepo(repo);
  assert.equal(sandbox.agw(["install", "work", repo]).status, 0);
  writeFileSync(join(repo, ".codex", "config.toml"), "this is = = not toml\n");
  mkdirSync(join(repo, ".grok"), { recursive: true });
  writeFileSync(join(repo, ".grok", "config.toml"), "[broken\n");

  const removed = sandbox.agw(["uninstall", repo]);
  assert.notEqual(removed.status, 0);
  assert.match(removed.stdout, /FAIL codex/);
  assert.match(removed.stdout, /FAIL grok/);
  assert.match(removed.stdout, /ok\s+claude/);
  assert.equal(isLink(join(repo, ".claude", "skills", "deploy")), false, "skill links were still removed");
  assert.doesNotMatch(readFileSync(join(repo, ".git", "info", "exclude"), "utf8"), /agent-gateway/, "so was the exclude block");
  assert.match(sandbox.agw(["list"]).stdout, /corrupt -> work/, "the record stays for a retry");
});

test("installing into a folder that does not exist is refused and creates nothing", () => {
  const sandbox = createSandbox();
  const missing = join(sandbox.base, "not-there", "deeper");
  const result = sandbox.agw(["install", "work", missing]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /precisa existir/);
  assert.equal(existsSync(join(sandbox.base, "not-there")), false);
  assert.doesNotMatch(sandbox.agw(["list"]).stdout, /not-there/);

  const file = join(sandbox.base, "a-file");
  writeFileSync(file, "x");
  assert.notEqual(sandbox.agw(["install", "work", file]).status, 0);
});

test("registering again is idempotent for every client", () => {
  const sandbox = createSandbox();
  const project = sandbox.project("twice");
  assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  const again = sandbox.agw(["install", "work", project]);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /Summary: 3 of 3 clients ok/);
  assert.ok(sandbox.cliLog().some((line) => line.startsWith("grok mcp remove gw")), "grok removes before adding");
});

test("sync applies every project it can and reports each bucket", () => {
  const sandbox = createSandbox();
  sandbox.writeConfig({
    global: { skills: ["global"] },
    work: { extends: ["global"], servers: ["alpha"], skills: ["globex"] },
    doomed: { skills: ["globex"] },
  });
  const good = sandbox.project("good");
  const doomed = sandbox.project("doomed");
  const gone = sandbox.project("gone");
  for (const [profile, dir] of [["doomed", doomed], ["work", gone], ["work", good]] as const) {
    assert.equal(sandbox.agw(["install", profile, dir]).status, 0);
  }
  sandbox.agw(["global"]);
  sandbox.writeConfig({ global: { skills: ["global"] }, work: { extends: ["global"], servers: ["alpha"], skills: ["globex"] } });
  rmSync(gone, { recursive: true });
  sandbox.makeSkill("global", "g2");
  sandbox.makeSkill("globex", "review");

  const result = sandbox.agw(["sync"]);
  assert.notEqual(result.status, 0, "one project failed");
  assert.match(result.stdout, new RegExp(`${doomed}: FAIL .*doomed`));
  assert.match(result.stdout, new RegExp(`${gone}: folder is gone`));
  assert.match(result.stdout, new RegExp(`${good} \\(work\\)`));
  assert.match(result.stdout, /Summary: 3 of 3 clients ok, 1 projects failed/);
  assert.equal(isLink(join(good, ".claude", "skills", "review")), true, "projects after the bad one are still applied");
  assert.equal(isLink(join(sandbox.userHome, ".claude", "skills", "g2")), true, "global skills are linked");
});
