import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adminTokenPath, ensureAdminToken, tokenMatches } from "../src/admin/token.ts";

function homeWithToken(content: string): string {
  const home = mkdtempSync(join(tmpdir(), "agw-token-"));
  mkdirSync(join(home, "state"));
  writeFileSync(adminTokenPath(home), content, { mode: 0o644 });
  return home;
}

test("a valid token file is kept", () => {
  const token = "ab".repeat(32);
  const home = homeWithToken(`${token}\n`);
  assert.equal(ensureAdminToken(home), token);
  assert.equal(ensureAdminToken(home), token);
});

test("an empty, short or malformed token file is regenerated, privately", () => {
  for (const content of ["", "\n", "   \n", "short", "zz".repeat(32), "ab".repeat(33)]) {
    const home = homeWithToken(content);
    const token = ensureAdminToken(home);
    assert.match(token, /^[0-9a-f]{64}$/, `content ${JSON.stringify(content)}`);
    assert.equal(readFileSync(adminTokenPath(home), "utf8"), `${token}\n`);
    assert.equal(statSync(adminTokenPath(home)).mode & 0o777, 0o600);
  }
});

test("a missing token file is created", () => {
  const home = mkdtempSync(join(tmpdir(), "agw-token-"));
  const token = ensureAdminToken(home);
  assert.equal(readFileSync(adminTokenPath(home), "utf8"), `${token}\n`);
  assert.equal(statSync(adminTokenPath(home)).mode & 0o777, 0o600);
});

test("an empty token never matches, even against an empty expectation", () => {
  assert.equal(tokenMatches("", ""), false);
  assert.equal(tokenMatches("", undefined), false);
  assert.equal(tokenMatches("abc", ""), false);
  assert.equal(tokenMatches("abc", "abc"), true);
  assert.equal(tokenMatches("abc", ["abc"]), false);
});
