import assert from "node:assert/strict";
import { test } from "node:test";
import { splitTokenFragment } from "../ui/src/api/tokenFragment.ts";

const TOKEN = "ab".repeat(32);

test("the token fragment is split off and the address bar keeps no trace of it", () => {
  assert.deepEqual(splitTokenFragment(`#t=${TOKEN}`), { token: TOKEN, hash: "" });
});

test("a route after the token is restored for the hash router", () => {
  assert.deepEqual(splitTokenFragment(`#t=${TOKEN}&/servers/alpha`), { token: TOKEN, hash: "#/servers/alpha" });
  assert.deepEqual(splitTokenFragment(`#t=${TOKEN}&`), { token: TOKEN, hash: "" });
});

test("a plain route or an empty hash is left alone", () => {
  assert.deepEqual(splitTokenFragment("#/profiles/work"), { token: undefined, hash: "#/profiles/work" });
  assert.deepEqual(splitTokenFragment(""), { token: undefined, hash: "" });
  assert.deepEqual(splitTokenFragment("#t="), { token: undefined, hash: "#t=" });
});
