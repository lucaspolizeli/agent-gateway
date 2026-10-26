import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repo = join(import.meta.dirname, "..");
const fixture = join(import.meta.dirname, "fixtures", "echo-server.ts");
let client: Client;

before(async () => {
  const home = mkdtempSync(join(tmpdir(), "agw-"));
  const echo = (label: string) => ({ command: process.execPath, args: [fixture], env: { ECHO_LABEL: label } });
  writeFileSync(
    join(home, "gateway.json"),
    JSON.stringify({
      servers: {
        alpha: echo("alpha"),
        beta: echo("${BETA_LABEL}"),
        broken: { command: "/nonexistent/binary" },
      },
      profiles: {
        base: { servers: ["alpha"] },
        work: { extends: ["base"], servers: ["beta", "broken"] },
      },
    }),
  );
  mkdirSync(join(home, "secrets"));
  writeFileSync(join(home, "secrets", "work.env"), "BETA_LABEL=from-secret\n");

  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: join(repo, "bin", "agw"),
      args: ["stdio", "work"],
      env: { ...process.env, AGW_HOME: home, AGW_NODE: process.execPath } as Record<string, string>,
      stderr: "ignore",
    }),
  );
});

after(async () => {
  await client.close();
});

test("lists tools of the profile and its parents under server-prefixed names", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["alpha__echo", "beta__echo", "gateway__status"]);
});

test("routes a call to the owning server, with secrets from the profile env file", async () => {
  const result = await client.callTool({ name: "beta__echo", arguments: { text: "hi" } });
  assert.deepEqual(result.content, [{ type: "text", text: "from-secret:hi" }]);
});

test("routes prompts the same way", async () => {
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((prompt) => prompt.name).sort(), ["alpha__greet", "beta__greet"]);
  const prompt = await client.getPrompt({ name: "alpha__greet" });
  assert.deepEqual(prompt.messages[0]?.content, { type: "text", text: "hello from alpha" });
});

test("reports a server that failed to start without hiding the others", async () => {
  const result = await client.callTool({ name: "gateway__status", arguments: {} });
  const status = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as Array<{ server: string; state: string }>;
  assert.deepEqual(
    status.map(({ server, state }) => ({ server, state })).sort((a, b) => a.server.localeCompare(b.server)),
    [
      { server: "alpha", state: "ready" },
      { server: "beta", state: "ready" },
      { server: "broken", state: "failed" },
    ],
  );
  const call = await client.callTool({ name: "broken__anything", arguments: {} });
  assert.equal(call.isError, true);
});
