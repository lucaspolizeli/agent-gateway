import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { registerAll, unregisterAll } from "../src/clients.ts";

const endpoint = { kind: "http", url: "http://127.0.0.1:1/mcp/work" } as const;
let dir: string;
let originalPath: string | undefined;

function fakeCli(bin: string, name: string, script: string) {
  writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
  chmodSync(join(bin, name), 0o755);
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), "agw-clients-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  fakeCli(bin, "claude", '[ "$2" = remove ] && [ -z "$HANG_REMOVE" ] && exit 1\nsleep 8');
  fakeCli(bin, "codex", "exit 0");
  fakeCli(bin, "grok", "echo grok refused >&2\nexit 1");
});

after(() => {
  process.env.PATH = originalPath;
});

test("a client CLI that hangs is reported as failed at the deadline while the event loop keeps running", async () => {
  let ticks = 0;
  const ticker = setInterval(() => ticks++, 20);
  const started = Date.now();
  const results = await registerAll(endpoint, { kind: "project", dir }, { timeoutMs: 1500 });
  const elapsed = Date.now() - started;
  clearInterval(ticker);

  assert.deepEqual(results.map(({ client, ok }) => [client, ok]), [["claude", false], ["codex", true], ["grok", false]]);
  assert.match(results[0]!.detail, /claude did not finish within 1\.5s/);
  assert.equal(results[2]!.detail, "grok refused");
  assert.ok(elapsed < 5000, `took ${elapsed}ms; the deadline did not cut the hung CLI short`);
  assert.ok(ticks >= 5, `the event loop was blocked (${ticks} ticks)`);
});

test("unregistering reports a hung CLI the same way", async () => {
  process.env.HANG_REMOVE = "1";
  const results = await unregisterAll({ kind: "project", dir }, { timeoutMs: 1500 });
  delete process.env.HANG_REMOVE;
  assert.equal(results[0]!.ok, false);
  assert.match(results[0]!.detail, /did not finish/);
});
