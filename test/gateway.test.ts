import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

const repo = join(import.meta.dirname, "..");
const fixture = join(import.meta.dirname, "fixtures", "echo-server.ts");
let client: Client;
let home: string;
const echo = (label: string) => ({ command: process.execPath, args: [fixture], env: { ECHO_LABEL: label } });
const baseConfig = {
  servers: {
    alpha: echo("alpha"),
    beta: echo("${BETA_LABEL}"),
    broken: { command: "/nonexistent/binary" },
  },
  profiles: {
    base: { servers: ["alpha"] } as Record<string, unknown>,
    work: { extends: ["base"], servers: ["beta", "broken"] } as Record<string, unknown>,
  },
};

before(async () => {
  home = mkdtempSync(join(tmpdir(), "agw-"));
  writeFileSync(join(home, "gateway.json"), JSON.stringify(baseConfig));
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
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "alpha__echo",
    "alpha__pid",
    "beta__echo",
    "beta__pid",
    "gateway__status",
  ]);
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

async function text(name: string): Promise<string> {
  const result = await client.callTool({ name, arguments: { text: "hi" } });
  return (result.content as Array<{ text: string }>)[0]!.text;
}

/** Resolves once a tools/list_changed arrives and the tool list then satisfies `predicate`. */
function toolsChangedUntil(predicate: (names: string[]) => boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching tools/list_changed within 10s")), 10_000);
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      if (predicate(names)) {
        clearTimeout(timer);
        resolve(names);
      }
    });
  });
}

test("hot reload hides a tool from listing and calls", async () => {
  const changed = toolsChangedUntil((names) => !names.includes("alpha__echo"));
  baseConfig.profiles.work = { ...baseConfig.profiles.work, hiddenTools: ["alpha__echo"] };
  writeFileSync(join(home, "gateway.json"), JSON.stringify(baseConfig));
  const names = await changed;
  assert.ok(names.includes("alpha__pid"), "other tools of the server stay listed");
  await assert.rejects(client.callTool({ name: "alpha__echo", arguments: { text: "hi" } }), /hidden by profile "work"/);
});

test("a changed secret reconnects only the servers that use it", async () => {
  const alphaPid = await text("alpha__pid");
  const betaPid = await text("beta__pid");
  writeFileSync(join(home, "secrets", "work.env"), "BETA_LABEL=rotated\n");
  await toolsChangedUntil((names) => names.includes("beta__echo"));
  assert.equal(await text("beta__echo"), "rotated:hi");
  assert.notEqual(await text("beta__pid"), betaPid);
  assert.equal(await text("alpha__pid"), alphaPid);
});

test("an invalid config or a removed profile keeps the last good config running", async () => {
  writeFileSync(join(home, "gateway.json"), "{ not json");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await text("beta__echo"), "rotated:hi");

  writeFileSync(join(home, "gateway.json"), JSON.stringify({ ...baseConfig, profiles: { base: baseConfig.profiles.base } }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await text("beta__echo"), "rotated:hi");
  const { tools } = await client.listTools();
  assert.equal(tools.some((tool) => tool.name === "alpha__echo"), false);
});
