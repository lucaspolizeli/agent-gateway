import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";

const SECRET = "s3cr3t-value-that-must-not-leak";

function loadFrom(content: string): Error {
  const home = mkdtempSync(join(tmpdir(), "agw-config-"));
  writeFileSync(join(home, "gateway.json"), content);
  try {
    loadConfig(home);
  } catch (error) {
    return error as Error;
  }
  throw new Error("loadConfig accepted invalid JSON");
}

test("a JSON syntax error names the position and never quotes the config text", () => {
  const bareValue = loadFrom(`{"servers": {"a": {"command": "x", "env": {"K": ${SECRET}}}}}`);
  assert.equal(bareValue.message.includes(SECRET.slice(0, 6)), false, bareValue.message);
  assert.match(bareValue.message, /not valid JSON/);

  const missingComma = loadFrom(`{\n  "servers": {"a": "${SECRET}" "b": 1}\n}`);
  assert.equal(missingComma.message.includes(SECRET.slice(0, 6)), false, missingComma.message);
  assert.match(missingComma.message, /line 2, column \d+/);
});
