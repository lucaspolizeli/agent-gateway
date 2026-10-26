import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeConfig } from "../src/config.ts";

const config = { servers: {}, profiles: { global: { extends: [], servers: [], skills: [], hiddenTools: [] } } };

test("writing a symlinked gateway.json updates the target and keeps the link and the mode", () => {
  const base = mkdtempSync(join(tmpdir(), "agw-fsutil-"));
  const home = join(base, "home");
  const dotfiles = join(base, "dotfiles");
  mkdirSync(home);
  mkdirSync(dotfiles);
  const real = join(dotfiles, "gateway.json");
  writeFileSync(real, "{}\n");
  chmodSync(real, 0o640);
  symlinkSync(real, join(home, "gateway.json"));

  writeConfig(home, config);

  assert.equal(lstatSync(join(home, "gateway.json")).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(home, "gateway.json")), real);
  assert.deepEqual(JSON.parse(readFileSync(real, "utf8")), config);
  assert.equal(statSync(real).mode & 0o777, 0o640);
  assert.deepEqual(readdirSync(dotfiles), ["gateway.json"]);
});

test("a new gateway.json is private", () => {
  const home = mkdtempSync(join(tmpdir(), "agw-fsutil-"));
  writeConfig(home, config);
  assert.equal(statSync(join(home, "gateway.json")).mode & 0o777, 0o600);
});

test("an existing gateway.json keeps a looser mode the user chose", () => {
  const home = mkdtempSync(join(tmpdir(), "agw-fsutil-"));
  writeFileSync(join(home, "gateway.json"), "{}\n");
  chmodSync(join(home, "gateway.json"), 0o644);
  writeConfig(home, config);
  assert.equal(statSync(join(home, "gateway.json")).mode & 0o777, 0o644);
});
