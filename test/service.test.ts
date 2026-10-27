import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { launchAgentPlist } from "../src/service.ts";

const plist = launchAgentPlist("/Users/me/agent & gateway", 7900, "/Users/me/.nvm/bin:/usr/bin");

test("the launch agent runs agw serve from the home at login and keeps it alive", () => {
  for (const fragment of [
    "<key>Label</key>\n  <string>dev.agent-gateway</string>",
    "<string>/Users/me/agent &amp; gateway/bin/agw</string>\n    <string>serve</string>\n    <string>--port</string>\n    <string>7900</string>",
    "<key>AGW_HOME</key>\n    <string>/Users/me/agent &amp; gateway</string>",
    "<key>PATH</key>\n    <string>/Users/me/.nvm/bin:/usr/bin</string>",
    "<key>RunAtLoad</key>\n  <true/>",
    "<key>KeepAlive</key>\n  <true/>",
    "<key>StandardOutPath</key>\n  <string>/Users/me/agent &amp; gateway/state/serve.log</string>",
    "<key>StandardErrorPath</key>\n  <string>/Users/me/agent &amp; gateway/state/serve.log</string>",
  ]) {
    assert.ok(plist.includes(fragment), `missing:\n${fragment}`);
  }
});

test("the launch agent is a valid property list", { skip: process.platform !== "darwin" }, () => {
  const path = join(mkdtempSync(join(tmpdir(), "agw-plist-")), "agent.plist");
  writeFileSync(path, plist);
  const json = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", path]).toString());
  assert.deepEqual(json.ProgramArguments, ["/Users/me/agent & gateway/bin/agw", "serve", "--port", "7900"]);
  assert.equal(json.KeepAlive, true);
});
