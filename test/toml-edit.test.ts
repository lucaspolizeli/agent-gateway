import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "smol-toml";
import { editTomlTable } from "../src/toml-edit.ts";

const GW = ["mcp_servers", "gw"];
const entry = { command: "/home/me/agw", args: ["stdio", "work"] };
const COMMENTED = `# Codex settings for this project
model = "gpt-5"   # keep this one

[profiles.fast]
# trimmed on purpose
effort = "low"

[mcp_servers.other]
command = "other"
args = [
  "--flag",   # a flag
  "[mcp_servers.gw]",
]
`;

test("install then uninstall leaves a commented file byte-identical", () => {
  const installed = editTomlTable(COMMENTED, GW, entry);
  assert.ok(installed.startsWith(COMMENTED), "everything that was there stays, byte for byte");
  assert.deepEqual(JSON.parse(JSON.stringify((parse(installed).mcp_servers as Record<string, unknown>).gw)), entry);
  assert.equal(editTomlTable(installed, GW, undefined), COMMENTED);
});

test("installing twice changes nothing, and a changed entry is rewritten in place", () => {
  const once = editTomlTable(COMMENTED, GW, entry);
  assert.equal(editTomlTable(once, GW, entry), once);

  const middle = `[mcp_servers.gw]\ncommand = "old"\n\n[mcp_servers.gw.env]\nA = "1"\n\n# after\n[tail]\nx = 1\n`;
  const replaced = editTomlTable(middle, GW, { url: "http://127.0.0.1:7820/mcp/work" });
  assert.equal(replaced, `[mcp_servers.gw]\nurl = "http://127.0.0.1:7820/mcp/work"\n\n# after\n[tail]\nx = 1\n`);
});

test("a header-looking line inside a multi-line string or array is not a table", () => {
  const text = `note = """\n[mcp_servers.gw]\nnot a table\n"""\nlist = [\n  [1, 2],\n]\n`;
  const installed = editTomlTable(text, GW, entry);
  assert.ok(installed.startsWith(text));
  assert.equal(editTomlTable(installed, GW, undefined), text);
  assert.equal(editTomlTable(text, GW, undefined), text);
});

test("removing the only table of a file leaves nothing, and a missing file starts from the entry", () => {
  const created = editTomlTable("", GW, entry);
  assert.equal(created, '[mcp_servers.gw]\ncommand = "/home/me/agw"\nargs = [ "stdio", "work" ]\n');
  assert.equal(editTomlTable(created, GW, undefined), "");
});

test("a quoted key and comments around the header are matched", () => {
  const text = `[mcp_servers."gw"] # ours\ncommand = "x"\n\n[keep]\na = 1\n`;
  assert.equal(editTomlTable(text, GW, undefined), "[keep]\na = 1\n");
});

test("a layout it cannot edit in place is refused instead of rewritten wrongly", () => {
  const dotted = `[mcp_servers]\ngw.command = "x"\n`;
  assert.throws(() => editTomlTable(dotted, GW, entry), /cannot be edited in place/);
  assert.throws(() => editTomlTable("[broken", GW, entry));
});

test("a file without a trailing newline comes back byte-identical after install then uninstall", () => {
  const bare = `# c\n[a]\nb = 1`;
  const installed = editTomlTable(bare, GW, entry);
  assert.equal(editTomlTable(installed, GW, undefined), bare);
});
