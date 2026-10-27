import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createSandbox, git, initRepo } from "./support/sandbox.ts";

function status(dir: string): string {
  return git(dir, "status", "--porcelain", "--untracked-files=all").trim();
}

function excludeFile(repo: string): string {
  return readFileSync(join(repo, ".git", "info", "exclude"), "utf8");
}

test("checkouts of one repository each keep their own exclude block", () => {
  const sandbox = createSandbox();
  const main = join(sandbox.base, "main-checkout");
  const linked = join(sandbox.base, "linked-checkout");
  initRepo(main);
  git(main, "worktree", "add", "-q", "-b", "feature", linked);

  for (const dir of [main, linked]) {
    const installed = sandbox.agw(["install", "work", dir]);
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    assert.equal(status(dir), "", `${dir} shows generated files after install`);
  }
  assert.equal(excludeFile(main).match(/# agent-gateway:.*:start/g)?.length, 2, "one block per checkout");

  const removed = sandbox.agw(["uninstall", linked]);
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  assert.equal(status(linked), "");
  assert.equal(status(main), "", "the main checkout lost its exclude block when the worktree was uninstalled");
  assert.equal(excludeFile(main).match(/# agent-gateway:.*:start/g)?.length, 1);

  assert.equal(sandbox.agw(["uninstall", main]).status, 0);
  assert.equal(status(main), "");
  assert.doesNotMatch(excludeFile(main), /agent-gateway/);
});

test("projects in the same subfolder of two checkouts do not share a block", () => {
  const sandbox = createSandbox();
  const main = join(sandbox.base, "mono");
  const linked = join(sandbox.base, "mono-linked");
  initRepo(main);
  git(main, "worktree", "add", "-q", "-b", "feature", linked);
  const projects = [join(main, "packages", "app"), join(linked, "packages", "app")];
  for (const project of projects) {
    mkdirSync(project, { recursive: true });
    assert.equal(sandbox.agw(["install", "work", project]).status, 0);
  }
  assert.equal(status(main), "");
  assert.equal(status(linked), "");

  assert.equal(sandbox.agw(["uninstall", projects[1]!]).status, 0);
  assert.equal(status(main), "", "the main checkout's block survived");
  assert.match(excludeFile(main), /\/packages\/app\/\.codex\/config\.toml/);
});

test("folder names with gitignore wildcards are excluded literally", () => {
  const sandbox = createSandbox();
  const repo = join(sandbox.base, "wild");
  initRepo(repo);
  const bracket = join(repo, "a[1]");
  const star = join(repo, "b*c");
  mkdirSync(bracket);
  mkdirSync(star);
  for (const dir of [bracket, star]) {
    const installed = sandbox.agw(["install", "work", dir]);
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  }
  assert.equal(status(repo), "", "the generated files of a[1] and b*c show in git status");

  const lookalikes = [join(repo, "a1", ".codex", "config.toml"), join(repo, "bxc", ".codex", "config.toml")];
  for (const file of lookalikes) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "x = 1\n");
  }
  assert.equal(status(repo).split("\n").length, 2, "other folders must not be swallowed by the escaped patterns");
});

test("only the links the gateway owns are excluded, never a user's own skill of the same name", () => {
  const sandbox = createSandbox();
  const repo = join(sandbox.base, "owned");
  initRepo(repo);
  const own = join(repo, ".claude", "skills", "deploy");
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, "SKILL.md"), "---\nname: deploy\ndescription: mine\n---\n");

  const installed = sandbox.agw(["install", "work", repo]);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);

  assert.doesNotMatch(excludeFile(repo), /\/\.claude\/skills\/deploy/);
  assert.match(excludeFile(repo), /\/\.agents\/skills\/deploy/);
  assert.equal(status(repo), "?? .claude/skills/deploy/SKILL.md");
});
