import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { formatEnvLine } from "../src/admin/secrets.ts";
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
