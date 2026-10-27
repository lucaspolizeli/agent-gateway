import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { formatEnvLine, setSecret } from "../src/admin/secrets.ts";
import { UserError } from "../src/errors.ts";

test("every storable value reads back exactly through util.parseEnv", () => {
  const values = [
    "plain",
    "",
    "  padded  ",
    "has # hash",
    "it's",
    'say "hi"',
    "it's \"both\"",
    "back\\slash \\n not a newline",
    "real\nnewline",
    "`tick` and 'single'",
    "`tick` and \"double\" with \\n",
    "${NOT_INTERPOLATED} $HOME",
    "=starts with equals",
  ];
  for (const value of values) {
    const line = formatEnvLine("KEY", value);
    assert.equal(parseEnv(line).KEY, value, `round trip of ${JSON.stringify(value)} via ${line}`);
  }
});

test("a value with all three quote kinds is refused", () => {
  assert.throws(() => formatEnvLine("KEY", `a'b"c\`d`), UserError);
});

test("a value with a carriage return is refused for that reason, not for its quotes", () => {
  assert.throws(
    () => formatEnvLine("KEY", "line one\r\nline two"),
    (error: unknown) => error instanceof UserError && /carriage returns/.test(error.message) && !error.message.includes("together"),
  );
});

test("writing a secret tightens a secrets file that was looser", () => {
  const home = mkdtempSync(join(tmpdir(), "agw-secrets-"));
  const path = join(home, "secrets", "work.env");
  mkdirSync(join(home, "secrets"));
  writeFileSync(path, "OLD=1\n");
  chmodSync(path, 0o644);

  setSecret(home, "work", "NEW", "2");

  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(readFileSync(path, "utf8"), "OLD='1'\nNEW='2'\n");
});
