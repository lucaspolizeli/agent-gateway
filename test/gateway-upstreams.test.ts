import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig, resolveProfile } from "../src/config.ts";
import { Gateway } from "../src/gateway.ts";

const fixture = join(import.meta.dirname, "fixtures", "echo-server.ts");

type Setup = { home: string; spawnLog: string; failFlag: string; marker: string };

function setup(servers: Record<string, Record<string, string>>, profile: string[]): Setup {
  const home = mkdtempSync(join(tmpdir(), "agw-upstreams-"));
  const spawnLog = join(home, "spawns.log");
  const failFlag = join(home, "fail-flag");
  const marker = `upstream-marker-${process.pid}-${Date.now()}`;
  const specs = Object.fromEntries(
    Object.entries(servers).map(([name, env]) => [
      name,
      { command: process.execPath, args: [fixture, marker], env: { ECHO_LABEL: name, SPAWN_LOG: spawnLog, FAIL_FLAG: failFlag, ALLOW_DIE: "1", ...env } },
    ]),
  );
  writeFileSync(join(home, "gateway.json"), JSON.stringify({ servers: specs, profiles: { work: { servers: profile } } }));
  return { home, spawnLog, failFlag, marker };
}

function open(home: string): Gateway {
  return new Gateway(home, resolveProfile(loadConfig(home), "work"));
}

function spawns(spawnLog: string): number[] {
  if (!existsSync(spawnLog)) {
    return [];
  }
  return readFileSync(spawnLog, "utf8").split("\n").filter(Boolean).map(Number);
}

async function text(gateway: Gateway, name: string): Promise<string> {
  const result = await gateway.callTool(name, {});
  return (result.content as Array<{ text: string }>)[0]!.text;
}

async function until<T>(what: string, ms: number, probe: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = await probe();
    if (found !== undefined) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function leftovers(marker: string): boolean {
  try {
    execFileSync("pgrep", ["-f", marker]);
    return true;
  } catch {
    return false;
  }
}

async function stateOf(gateway: Gateway, server: string) {
  return (await gateway.status()).find((entry) => entry.server === server);
}

test("a dead upstream is reconnected with doubling delays, and shows a state while it waits", async () => {
  const { home, spawnLog, failFlag, marker } = setup({ alpha: {} }, ["alpha"]);
  const gateway = open(home);
  try {
    await gateway.start();
    const firstPid = await text(gateway, "alpha__pid");
    writeFileSync(failFlag, "");
    await gateway.callTool("alpha__die", {});

    const waiting = await until("the failed state", 3000, async () => {
      const state = await stateOf(gateway, "alpha");
      if (state?.state === "failed") {
        return state;
      }
      return undefined;
    });
    assert.match(waiting.error, /connection closed; retrying in 1s/);

    await until("two failed retries", 8000, async () => {
      if (spawns(spawnLog).length >= 3) {
        return true;
      }
      return undefined;
    });
    const times = spawns(spawnLog);
    assert.ok(times[1]! - times[0]! >= 950, `first retry came ${times[1]! - times[0]!}ms after the start`);
    assert.ok(times[2]! - times[1]! >= 1900, `second retry came ${times[2]! - times[1]!}ms after the first`);
    assert.match((await stateOf(gateway, "alpha") as { error: string }).error, /retrying in (2|4)s/);

    rmSync(failFlag);
    await until("the upstream to come back", 8000, async () => {
      const state = await stateOf(gateway, "alpha");
      if (state?.state === "ready") {
        return state;
      }
      return undefined;
    });
    assert.notEqual(await text(gateway, "alpha__pid"), firstPid);
  } finally {
    await gateway.close();
  }
  assert.equal(leftovers(marker), false, "no upstream process outlives the gateway");
});

test("a retry is cancelled when the server leaves the profile, and when the gateway closes", async () => {
  const { home, spawnLog, marker } = setup({ alpha: {}, beta: {} }, ["alpha", "beta"]);
  const gateway = open(home);
  await gateway.start();
  const initial = spawns(spawnLog).length;
  assert.equal(initial, 2);
  await gateway.callTool("alpha__die", {});
  await gateway.callTool("beta__die", {});
  await until("both to be waiting", 3000, async () => {
    const states = await gateway.status();
    if (states.every((entry) => entry.state === "failed")) {
      return true;
    }
    return undefined;
  });

  const profile = resolveProfile(loadConfig(home), "work");
  profile.servers.delete("alpha");
  await gateway.reconfigure(profile);
  await until("beta to be retried", 4000, async () => {
    if ((await stateOf(gateway, "beta"))?.state === "ready") {
      return true;
    }
    return undefined;
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(spawns(spawnLog).length, initial + 1, "only beta, still in the profile, was started again");

  await gateway.callTool("beta__die", {});
  await until("beta to be waiting", 3000, async () => {
    if ((await stateOf(gateway, "beta"))?.state === "failed") {
      return true;
    }
    return undefined;
  });
  await gateway.close();
  await new Promise((resolve) => setTimeout(resolve, 2500));

  assert.equal(spawns(spawnLog).length, initial + 1, "closing cancelled the pending retry");
  assert.equal(leftovers(marker), false);
});

test("a resource read stops going to a server that left the profile", async () => {
  const { home } = setup({ alpha: {}, beta: { LIST_RESOURCES: "1" } }, ["alpha", "beta"]);
  const gateway = open(home);
  try {
    await gateway.start();
    assert.deepEqual((await gateway.listResources()).map((resource) => resource.uri), ["shared://doc"]);
    const before = await gateway.readResource("shared://doc");
    assert.deepEqual(before.contents, [{ uri: "shared://doc", text: "beta:doc" }]);

    const profile = resolveProfile(loadConfig(home), "work");
    profile.servers.delete("beta");
    await gateway.reconfigure(profile);

    const after = await gateway.readResource("shared://doc");
    assert.deepEqual(after.contents, [{ uri: "shared://doc", text: "alpha:doc" }]);
  } finally {
    await gateway.close();
  }
});

test("a server that fails its first connect keeps retrying and comes up once the cause is gone", async () => {
  const { home, failFlag, marker } = setup({ a: {} }, ["a"]);
  writeFileSync(failFlag, "");
  const gateway = open(home);
  await gateway.start();
  const first = await stateOf(gateway, "a");
  assert.equal(first?.state, "failed");
  assert.match((first as { error: string }).error, /retrying in 1s/);
  rmSync(failFlag);
  await until("a to come up", 6000, async () => {
    const entry = await stateOf(gateway, "a");
    if (entry?.state === "ready") {
      return entry;
    }
    return undefined;
  });
  await gateway.close();
  await until("no leftover upstream", 3000, async () => {
    if (leftovers(marker)) {
      return undefined;
    }
    return true;
  });
});
