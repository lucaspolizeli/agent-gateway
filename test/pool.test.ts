import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GatewayPool } from "../src/pool.ts";

const fixture = join(import.meta.dirname, "fixtures", "echo-server.ts");
const echo = (label: string) => ({ command: process.execPath, args: [fixture], env: { ECHO_LABEL: label } });
const work = { servers: ["alpha"] };

function makeHome(profiles: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), "agw-pool-"));
  writeFileSync(join(home, "gateway.json"), JSON.stringify({ servers: { alpha: echo("alpha") }, profiles }));
  return home;
}

test("a start that fails is not cached: the next start retries", async () => {
  const home = makeHome({ work });
  mkdirSync(join(home, "secrets", "work.env"), { recursive: true });
  const pool = new GatewayPool(home);
  try {
    await assert.rejects(pool.start("work"), /EISDIR/);
    assert.equal(pool.running("work"), undefined);

    rmSync(join(home, "secrets", "work.env"), { recursive: true });
    const gateway = await pool.start("work");
    assert.deepEqual(await gateway.status(), [{ server: "alpha", state: "ready", toolCount: 2 }]);
  } finally {
    await pool.closeAll();
  }
});

test("a profile removed from the config is refused for new starts while the running gateway keeps serving", async () => {
  const home = makeHome({ work, other: work });
  const pool = new GatewayPool(home);
  try {
    const gateway = await pool.start("work");
    writeFileSync(join(home, "gateway.json"), JSON.stringify({ servers: { alpha: echo("alpha") }, profiles: { other: work } }));

    await assert.rejects(pool.start("work"), /Unknown profile "work"/);
    assert.equal(pool.running("work"), gateway);
    assert.deepEqual(await gateway.status(), [{ server: "alpha", state: "ready", toolCount: 2 }]);

    await assert.rejects(pool.start("never-existed"), /Unknown profile "never-existed"/);
    assert.deepEqual(await (await pool.start("other")).status(), [{ server: "alpha", state: "ready", toolCount: 2 }]);
  } finally {
    await pool.closeAll();
  }
});

test("a running profile keeps being reused while gateway.json is unreadable", async () => {
  const home = makeHome({ work });
  const pool = new GatewayPool(home);
  try {
    const gateway = await pool.start("work");
    writeFileSync(join(home, "gateway.json"), "{ not json");
    assert.equal(await pool.start("work"), gateway);
    await assert.rejects(pool.start("other"), /Invalid/);
  } finally {
    await pool.closeAll();
  }
});
