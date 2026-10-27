import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

const repo = join(import.meta.dirname, "..");
const fixture = join(import.meta.dirname, "fixtures", "echo-server.ts");
const SECRET = "s3cr3t-value-that-must-not-leak";
const echo = (label: string) => ({ command: process.execPath, args: [fixture], env: { ECHO_LABEL: label } });

let home: string;
let userHome: string;
let project: string;
let fakeBin: string;
let openLog: string;
let port: number;
let token: string;
let serve: ChildProcess;
let mcp: Client;

type Reply = { status: number; text: string; json: unknown; headers: Record<string, string | string[] | undefined> };

function call(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Reply> {
  let payload: string | undefined;
  if (typeof options.body === "string") {
    payload = options.body;
  } else if (options.body !== undefined) {
    payload = JSON.stringify(options.body);
  }
  const headers: Record<string, string> = { "x-agw-token": token, "content-type": "application/json", ...options.headers };
  if (payload !== undefined) {
    // Node sends a DELETE body unframed unless the length is given.
    headers["content-length"] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode!, text, json, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = await call(method, path, { body });
  assert.equal(reply.status, 200, `${method} ${path} -> ${reply.status} ${reply.text}`);
  return reply.json as T;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port: free } = probe.address() as { port: number };
      probe.close(() => resolve(free));
    });
  });
}

/** Resolves once a tools/list_changed arrives and the tool list then satisfies `predicate`. */
function toolsChangedUntil(predicate: (names: string[]) => boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching tools/list_changed within 10s")), 10_000);
    mcp.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      const names = (await mcp.listTools()).tools.map((tool) => tool.name);
      if (predicate(names)) {
        clearTimeout(timer);
        resolve(names);
      }
    });
  });
}

function agw(args: string[]) {
  return spawnSync(join(repo, "bin", "agw"), args, {
    env: {
      ...process.env,
      AGW_HOME: home,
      HOME: userHome,
      AGW_NODE: process.execPath,
      PATH: `${fakeBin}:${process.env.PATH}`,
      OPEN_LOG: openLog,
    },
    encoding: "utf8",
  });
}

function makeSkill(dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} things\n---\nBody\n`);
}

before(async () => {
  const base = mkdtempSync(join(tmpdir(), "agw-admin-"));
  home = join(base, "home");
  userHome = join(base, "user");
  project = join(base, "project");
  const bin = join(base, "bin");
  fakeBin = bin;
  openLog = join(base, "opened-url");
  for (const dir of [home, userHome, project, bin]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const client of ["claude", "codex", "grok"]) {
    writeFileSync(join(bin, client), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, client), 0o755);
  }
  for (const opener of ["open", "xdg-open"]) {
    writeFileSync(join(bin, opener), '#!/bin/sh\nprintf "%s" "$1" > "$OPEN_LOG"\n');
    chmodSync(join(bin, opener), 0o755);
  }
  writeFileSync(
    join(home, "gateway.json"),
    JSON.stringify({
      servers: { alpha: echo("alpha") },
      profiles: { global: { skills: ["global"] }, work: { extends: ["global"], servers: ["alpha"], skills: ["globex"] } },
    }),
  );
  for (const set of ["global", "globex"]) {
    mkdirSync(join(home, "skills", set), { recursive: true });
  }

  port = await freePort();
  serve = spawn(join(repo, "bin", "agw"), ["serve", "--port", String(port)], {
    env: { ...process.env, AGW_HOME: home, HOME: userHome, AGW_NODE: process.execPath, PATH: `${bin}:${process.env.PATH}` },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  serve.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve did not start:\n${stderr}`)), 10_000);
    serve.stderr!.on("data", () => {
      if (stderr.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  token = readFileSync(join(home, "state", "admin-token"), "utf8").trim();

  mcp = new Client({ name: "test", version: "1.0.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/work`)));
});

after(async () => {
  await mcp.close();
  serve.kill("SIGTERM");
});

test("the admin token file is private and every /api request needs it", async () => {
  assert.equal(statSync(join(home, "state", "admin-token")).mode & 0o777, 0o600);
  assert.equal((await call("GET", "/api/config", { headers: { "x-agw-token": "" } })).status, 401);
  assert.equal((await call("GET", "/api/config", { headers: { "x-agw-token": "wrong" } })).status, 401);
  const reply = await call("GET", "/api/config");
  assert.equal(reply.status, 200);
  assert.deepEqual(Object.keys((reply.json as { servers: object }).servers), ["alpha"]);
});

test("a foreign Host header is refused on /api and /ui", async () => {
  assert.equal((await call("GET", "/api/config", { headers: { host: "evil.example.com" } })).status, 403);
  assert.equal((await call("GET", "/ui/", { headers: { host: `evil.example.com:${port}` } })).status, 403);
});

test("unknown routes, wrong methods and bad params are 4xx", async () => {
  assert.equal((await call("GET", "/api/nope")).status, 404);
  assert.equal((await call("DELETE", "/api/config")).status, 405);
  assert.equal((await call("GET", "/api/skills/globex/..%2F..%2Fgateway.json")).status, 400);
  assert.equal((await call("POST", "/api/config/edits", { body: { op: "explode" } })).status, 400);
});

test("a config edit reaches an open MCP session with tools/list_changed", async () => {
  assert.deepEqual((await mcp.listTools()).tools.map((tool) => tool.name).sort(), ["alpha__echo", "alpha__pid", "gateway__status"]);
  const changed = toolsChangedUntil((names) => names.includes("beta__echo"));
  await api("POST", "/api/config/edits", { op: "upsertServer", name: "beta", spec: echo("beta") });
  await api("POST", "/api/config/edits", {
    op: "upsertProfile",
    name: "work",
    profile: { extends: ["global"], servers: ["alpha", "beta"], skills: ["globex"] },
  });
  const names = await changed;
  assert.ok(names.includes("alpha__echo"));
  const status = await api<{ running: boolean; upstreams: unknown[] }>("GET", "/api/profiles/work/status");
  assert.equal(status.running, true);
  assert.deepEqual(
    status.upstreams,
    [
      { server: "alpha", state: "ready", toolCount: 2 },
      { server: "beta", state: "ready", toolCount: 2 },
    ],
  );
});

test("a secret is stored privately, used by the server, and never returned", async () => {
  const gone = toolsChangedUntil((names) => !names.includes("beta__echo"));
  await api("POST", "/api/config/edits", { op: "upsertServer", name: "beta", spec: echo("${BETA_LABEL}") });
  await gone;
  const status = await api<{ upstreams: Array<{ server: string }> }>("GET", "/api/profiles/work/status");
  assert.deepEqual(
    status.upstreams.find((upstream) => upstream.server === "beta"),
    { server: "beta", state: "failed", error: "Missing secret ${BETA_LABEL}" },
  );
  const profiles = await api<Array<{ name: string; missingSecrets: string[] }>>("GET", "/api/profiles");
  assert.deepEqual(profiles.find((profile) => profile.name === "work")?.missingSecrets, ["BETA_LABEL"]);

  const changed = toolsChangedUntil((names) => names.includes("beta__echo"));
  const tricky = `${SECRET} 'quoted' "double" # not a comment\nsecond line`;
  const view = await call("PUT", "/api/secrets/work/BETA_LABEL", { body: { value: tricky } });
  assert.deepEqual(view.json, { profile: "work", keys: ["BETA_LABEL"] });
  assert.equal(statSync(join(home, "secrets", "work.env")).mode & 0o777, 0o600);
  await changed;
  const echoed = await mcp.callTool({ name: "beta__echo", arguments: { text: "hi" } });
  assert.deepEqual(echoed.content, [{ type: "text", text: `${tricky}:hi` }]);

  const replies = [
    view,
    await call("GET", "/api/config"),
    await call("GET", "/api/profiles"),
    await call("GET", "/api/profiles/work/status"),
    await call("POST", "/api/profiles/work/servers/beta/reconnect"),
    await call("GET", "/api/secrets"),
    await call("PUT", "/api/secrets/work/OTHER", { body: { value: SECRET, extra: SECRET } }),
    await call("PUT", "/api/secrets/work/OTHER", { body: `{"value": ${SECRET}}` }),
    await call("POST", "/api/servers/test", {
      body: { spec: { url: "http://127.0.0.1:1/${BETA_LABEL}" }, profile: "work" },
    }),
    await call("POST", "/api/servers/test", { body: { spec: echo("${BETA_LABEL}"), profile: "work" } }),
  ];
  for (const reply of replies) {
    assert.equal(reply.text.includes(SECRET.slice(0, 6)), false, `secret leaked in: ${reply.text}`);
  }
  assert.deepEqual(
    (await api<Array<{ name: string; missingSecrets: string[] }>>("GET", "/api/profiles")).map((p) => p.missingSecrets),
    [[], []],
  );
  assert.deepEqual(await api("DELETE", "/api/secrets/work/BETA_LABEL"), { profile: "work", keys: [] });
  assert.equal((await call("DELETE", "/api/secrets/work/BETA_LABEL")).status, 404);
});

test("a hidden tool is neither listed nor callable", async () => {
  const changed = toolsChangedUntil((names) => !names.includes("alpha__echo"));
  await api("POST", "/api/config/edits", { op: "setToolHidden", profile: "global", tool: "alpha__echo", hidden: true });
  const names = await changed;
  assert.ok(names.includes("alpha__pid"));
  await assert.rejects(mcp.callTool({ name: "alpha__echo", arguments: { text: "hi" } }), /hidden by profile "global"/);
  const status = await api<{ tools: Array<{ name: string; hidden: boolean; hiddenBy?: string }> }>(
    "GET",
    "/api/profiles/work/status",
  );
  assert.deepEqual(
    status.tools.find((tool) => tool.name === "alpha__echo"),
    { name: "alpha__echo", server: "alpha", description: "Echoes text with the server label", hidden: true, hiddenBy: "global" },
  );
});

test("an invalid edit is refused and leaves gateway.json unchanged", async () => {
  const before = readFileSync(join(home, "gateway.json"), "utf8");
  const unknownServer = await call("POST", "/api/config/edits", {
    body: { op: "upsertProfile", name: "acme", profile: { servers: ["github"] } },
  });
  assert.equal(unknownServer.status, 400);
  assert.deepEqual(unknownServer.json, { error: 'Profile "acme" uses unknown server "github"' });
  assert.equal((await call("POST", "/api/config/edits", { body: { op: "removeServer", name: "nope" } })).status, 404);
  assert.equal((await call("POST", "/api/config/edits", { body: { op: "removeProfile", name: "global" } })).status, 409);
  assert.equal(readFileSync(join(home, "gateway.json"), "utf8"), before);
});

test("servers can be tested before saving without leaving a process behind", async () => {
  const marker = `probe-${process.pid}-${Date.now()}`;
  const spec = { ...echo("probe"), args: [fixture, marker] };
  const ok = await api<{ ok: boolean; tools: Array<{ name: string }> }>("POST", "/api/servers/test", { spec });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.tools.map((tool) => tool.name).sort(), ["echo", "pid"]);
  assert.throws(() => execFileSync("pgrep", ["-f", marker]), "the probe server exited");
  const failed = await api<{ ok: boolean; error: string }>("POST", "/api/servers/test", { spec: { command: "/nonexistent/binary" } });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /ENOENT|nonexistent/);
});

test("projects install through the API and skills stay linked as they are created, moved and deleted", async () => {
  const installed = await api<{ dir: string; clients: Array<{ client: string; ok: boolean }> }>("POST", "/api/projects", {
    dir: project,
    profile: "work",
    transport: "http",
  });
  assert.deepEqual(installed.clients.map(({ client, ok }) => [client, ok]), [["claude", true], ["codex", true], ["grok", true]]);
  assert.deepEqual(await api("GET", "/api/projects"), [{ dir: project, profile: "work", transport: "http", exists: true }]);
  assert.equal((await call("DELETE", "/api/config/edits", {})).status, 405);
  assert.equal((await call("POST", "/api/config/edits", { body: { op: "removeProfile", name: "work" } })).status, 409);

  const sets = await api<Array<{ name: string }>>("POST", "/api/skills/sets", { name: "acme" });
  assert.deepEqual(sets.map((set) => set.name), ["acme", "global", "globex"]);
  assert.equal((await call("POST", "/api/skills/sets", { body: { name: "acme" } })).status, 409);

  const content = "---\nname: deploy\ndescription: >\n  Ships the\n  service\n---\nSteps\n";
  const doc = await api("PUT", "/api/skills/acme/deploy", { content });
  assert.deepEqual(doc, { name: "deploy", set: "acme", description: "Ships the service", content, files: [] });
  assert.equal((await call("PUT", "/api/skills/acme/deploy", { body: { content: "no frontmatter" } })).status, 400);

  const linked = join(project, ".claude", "skills", "deploy");
  assert.equal(existsSync(linked), false, "acme is not in the work profile");
  const moved = await api<Array<{ name: string; skills: Array<{ name: string }>; usedBy: string[]; scope: string }>>(
    "POST",
    "/api/skills/acme/deploy/move",
    { toSet: "globex" },
  );
  assert.deepEqual(
    moved.map(({ name, skills, usedBy, scope }) => ({ name, skills: skills.map((skill) => skill.name), usedBy, scope })),
    [
      { name: "acme", skills: [], usedBy: [], scope: "project" },
      { name: "global", skills: [], usedBy: ["global"], scope: "user" },
      { name: "globex", skills: ["deploy"], usedBy: ["work"], scope: "project" },
    ],
  );
  assert.equal(readlinkSync(linked), join(home, "skills", "globex", "deploy"));
  assert.equal((await api<{ content: string }>("GET", "/api/skills/globex/deploy")).content, content);

  await api("DELETE", "/api/skills/globex/deploy");
  assert.equal(existsSync(join(home, "skills", "globex", "deploy")), false);
  assert.equal(lstatSync(join(project, ".claude", "skills")).isDirectory(), true);
  assert.equal(existsSync(linked) || isLink(linked), false, "the stale link is pruned");
  assert.equal((await call("GET", "/api/skills/globex/deploy")).status, 404);
});

test("real folders in the user skill dirs can be imported into the hub", async () => {
  const userSkills = join(userHome, ".claude", "skills");
  makeSkill(join(userSkills, "notes"), "notes");
  makeSkill(join(userHome, "elsewhere", "linked"), "linked");
  symlinkSync(join(userHome, "elsewhere", "linked"), join(userSkills, "linked"));

  const importable = await api("GET", "/api/skills/importable");
  assert.deepEqual(importable, [{ name: "notes", path: join(userSkills, "notes"), description: "notes things" }]);
  assert.equal((await call("POST", "/api/skills/import", { body: { path: join(userHome, "elsewhere", "linked"), toSet: "global" } })).status, 404);

  await api("POST", "/api/skills/import", { path: join(userSkills, "notes"), toSet: "global" });
  assert.equal(existsSync(join(home, "skills", "global", "notes", "SKILL.md")), true);
  assert.equal(readlinkSync(join(userSkills, "notes")), join(home, "skills", "global", "notes"));
  assert.equal(readlinkSync(join(userHome, ".agents", "skills", "notes")), join(home, "skills", "global", "notes"));
  assert.deepEqual(await api("GET", "/api/skills/importable"), []);
});

test("the UI is served without the token, and refuses to be framed", async () => {
  const missing = await call("GET", "/ui/");
  assert.equal(missing.status, 503);
  assert.match(missing.text, /pnpm --dir ui install &amp;&amp; pnpm --dir ui build/);

  const dist = join(home, "ui", "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<html><head><title>x</title></head><body></body></html>");
  writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");

  const index = await call("GET", "/ui/profiles/work", { headers: { "x-agw-token": "" } });
  assert.equal(index.status, 200);
  assert.equal(index.text, "<html><head><title>x</title></head><body></body></html>");
  assert.equal(index.headers["cache-control"], "no-store");
  const script = await call("GET", "/ui/assets/app.js");
  assert.equal(script.headers["content-type"], "text/javascript; charset=utf-8");
  const notFound = await call("GET", "/ui/assets/missing.js");
  assert.equal(notFound.status, 404);
  assert.equal((await call("GET", "/ui/..%2F..%2Fgateway.json")).status, 404);
  for (const reply of [missing, index, script, notFound]) {
    assert.equal(reply.text.includes(token), false);
    assert.equal(reply.headers["x-frame-options"], "DENY");
    assert.equal(reply.headers["content-security-policy"], "frame-ancestors 'none'");
  }
  const root = await call("GET", "/");
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, "/ui/");
});

test("agw ui opens the UI with the token in the URL fragment and does not print it", async () => {
  const opened = agw(["ui", "--port", String(port)]);
  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(opened.stdout.includes(token), false);
  let url = "";
  for (let attempt = 0; attempt < 50 && url === ""; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (existsSync(openLog)) {
      url = readFileSync(openLog, "utf8");
    }
  }
  assert.equal(url, `http://127.0.0.1:${port}/ui/#t=${token}`);
});

test("the home folder, or a folder that is the home through a symlink, cannot be a project", async () => {
  await api("PUT", "/api/skills/global/guard", { content: "---\nname: guard\ndescription: guard things\n---\nBody\n" });
  const userLink = join(userHome, ".claude", "skills", "guard");
  const hubSkill = join(home, "skills", "global", "guard");
  assert.equal(readlinkSync(userLink), hubSkill);

  const alias = join(dirname(userHome), "alias-of-home");
  symlinkSync(userHome, alias);
  const before = await api("GET", "/api/projects");
  for (const dir of [userHome, alias]) {
    const reply = await call("POST", "/api/projects", { body: { dir, profile: "work", transport: "stdio" } });
    assert.equal(reply.status, 400, reply.text);
    assert.match(reply.text, /pasta home/);
  }
  const viaCli = agw(["install", "work", userHome]);
  assert.notEqual(viaCli.status, 0);
  assert.match(viaCli.stderr, /pasta home/);

  assert.equal(readlinkSync(userLink), hubSkill, "the user-level skill link survives");
  assert.equal(existsSync(join(userHome, ".codex", "config.toml")), false);
  assert.deepEqual(await api("GET", "/api/projects"), before);
});

test("a profile used by the user-level install cannot be removed", async () => {
  const installed = agw(["global"]);
  assert.equal(installed.status, 0, installed.stderr);
  await api("POST", "/api/config/edits", {
    op: "upsertProfile",
    name: "work",
    profile: { extends: [], servers: ["alpha", "beta"], skills: ["globex"] },
  });
  const removal = await call("POST", "/api/config/edits", { body: { op: "removeProfile", name: "global" } });
  assert.equal(removal.status, 409, removal.text);
  assert.match(removal.text, /installed/);
  assert.ok("global" in (await api<{ profiles: object }>("GET", "/api/config")).profiles);
});

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

test("DELETE /api/projects accepts the folder the way POST does, with a trailing slash", async () => {
  const dir = join(dirname(project), "slashed");
  mkdirSync(dir);
  await api("POST", "/api/projects", { dir, profile: "work", transport: "stdio" });

  const removed = await call("DELETE", "/api/projects", { body: { dir: `${dir}/` } });
  assert.equal(removed.status, 200, removed.text);
  assert.equal((removed.json as { dir: string }).dir, dir);
  assert.equal((await api<Array<{ dir: string }>>("GET", "/api/projects")).some((entry) => entry.dir === dir), false);
});

test("POST /api/sync returns every project in exactly one bucket", async () => {
  const good = join(dirname(project), "sync-good");
  const gone = join(dirname(project), "sync-gone");
  const orphan = join(dirname(project), "sync-orphan");
  for (const dir of [good, gone, orphan]) {
    mkdirSync(dir);
  }
  await api("POST", "/api/config/edits", { op: "upsertProfile", name: "temp", profile: { extends: [], servers: [], skills: ["globex"] } });
  await api("POST", "/api/projects", { dir: good, profile: "work", transport: "stdio" });
  await api("POST", "/api/projects", { dir: gone, profile: "work", transport: "stdio" });
  await api("POST", "/api/projects", { dir: orphan, profile: "temp", transport: "stdio" });
  rmSync(gone, { recursive: true });
  const state = join(home, "state", "projects.json");
  const recorded = JSON.parse(readFileSync(state, "utf8")) as { projects: Record<string, unknown> };
  recorded.projects[orphan] = { profile: "removed-profile", transport: "stdio" };
  writeFileSync(state, JSON.stringify(recorded));

  const result = await api<{
    applied: Array<{ dir: string }>;
    missing: string[];
    unsafe: string[];
    failed: Array<{ dir: string; error: string }>;
  }>("POST", "/api/sync");

  assert.deepEqual(result.applied.map((entry) => entry.dir).filter((dir) => dir === good), [good]);
  assert.deepEqual(result.missing, [gone]);
  assert.deepEqual(result.unsafe, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]!.dir, orphan);
  assert.match(result.failed[0]!.error, /removed-profile/);

  for (const dir of [good, gone, orphan]) {
    await call("DELETE", "/api/projects", { body: { dir } });
  }
});

test("symlinks in the skills hub never let the API reach outside it", async () => {
  const outside = join(dirname(home), "outside-hub");
  const secretDoc = "---\nname: secret\ndescription: outside the hub\n---\nTop secret\n";
  mkdirSync(join(outside, "set", "secret"), { recursive: true });
  writeFileSync(join(outside, "set", "secret", "SKILL.md"), secretDoc);
  mkdirSync(join(outside, "skill"), { recursive: true });
  writeFileSync(join(outside, "skill", "SKILL.md"), secretDoc);
  writeFileSync(join(outside, "skill", "extra.txt"), "extra");
  writeFileSync(join(outside, "file.md"), secretDoc);
  const skills = join(home, "skills");
  symlinkSync(join(outside, "set"), join(skills, "linkset"));
  symlinkSync(join(outside, "skill"), join(skills, "globex", "escape"));
  mkdirSync(join(skills, "globex", "filelink"));
  symlinkSync(join(outside, "file.md"), join(skills, "globex", "filelink", "SKILL.md"));
  makeSkill(join(skills, "globex", "withrefs"), "withrefs");
  symlinkSync(join(outside, "skill"), join(skills, "globex", "withrefs", "refs"));
  makeSkill(join(skills, "globex", "real"), "real");
  const mine = "---\nname: real\ndescription: mine\n---\nBody\n";

  const snapshot = () => ["set/secret/SKILL.md", "skill/SKILL.md", "skill/extra.txt", "file.md"].map((file) => readFileSync(join(outside, file), "utf8"));
  const before = snapshot();
  const refused = async (method: string, path: string, body?: unknown) => {
    const reply = await call(method, path, { body });
    assert.ok(reply.status >= 400 && reply.status < 500, `${method} ${path} -> ${reply.status} ${reply.text}`);
    assert.equal(reply.text.includes("Top secret"), false, `${method} ${path} leaked outside content`);
  };

  for (const [set, name] of [["linkset", "secret"], ["globex", "escape"], ["globex", "filelink"]] as const) {
    await refused("GET", `/api/skills/${set}/${name}`);
    await refused("PUT", `/api/skills/${set}/${name}`, { content: `---\nname: ${name}\ndescription: overwritten\n---\n` });
    await refused("POST", `/api/skills/${set}/${name}/move`, { toSet: "acme" });
    await refused("DELETE", `/api/skills/${set}/${name}`);
  }
  await refused("PUT", "/api/skills/linkset/fresh", { content: "---\nname: fresh\ndescription: x\n---\n" });
  await refused("POST", "/api/skills/globex/real/move", { toSet: "linkset" });

  assert.deepEqual(snapshot(), before, "nothing outside the hub changed");
  assert.deepEqual(readdirSync(join(outside, "set")), ["secret"]);
  assert.equal(isLink(join(skills, "linkset")), true);
  assert.equal(isLink(join(skills, "globex", "escape")), true);

  const sets = await api<Array<{ name: string; skills: Array<{ name: string }> }>>("GET", "/api/skills");
  assert.equal(sets.some((set) => set.name === "linkset"), false);
  assert.deepEqual(sets.find((set) => set.name === "globex")?.skills.map((skill) => skill.name).sort(), ["real", "withrefs"]);
  assert.deepEqual((await api<{ files: string[] }>("GET", "/api/skills/globex/withrefs")).files, []);

  const written = await api<{ content: string }>("PUT", "/api/skills/globex/real", { content: mine });
  assert.equal(written.content, mine, "the hub's own skills still work");
});

test("validation errors read as plain pt-BR sentences, without zod's decorations", async () => {
  const errorOf = async (method: string, path: string, body?: unknown) => {
    const reply = await call(method, path, { body });
    assert.equal(reply.status, 400, `${method} ${path} -> ${reply.status} ${reply.text}`);
    return (reply.json as { error: string }).error;
  };
  const slugRule = "use letras minúsculas, dígitos e hífens simples, sem hífen no início ou no fim";

  assert.equal(await errorOf("POST", "/api/skills/sets", { name: "Bad Name" }), `Nome: ${slugRule}`);
  assert.equal(await errorOf("GET", "/api/skills/UPPER/deploy"), `Conjunto: ${slugRule}`);
  assert.equal(
    await errorOf("GET", "/api/skills/globex/.hidden"),
    "Nome: use letras, dígitos, '.', '_' e '-', sem começar com '.'",
  );
  assert.equal(
    await errorOf("PUT", "/api/secrets/work/9LIVES", { value: "x" }),
    "Chave: use letras, dígitos e '_', sem começar com dígito",
  );
  assert.equal(
    await errorOf("POST", "/api/projects", { dir: "relative/dir", profile: "work", transport: "stdio" }),
    "Pasta: precisa ser um caminho absoluto\nPasta: precisa ser uma pasta existente",
  );
  assert.equal(
    await errorOf("POST", "/api/projects", { dir: join(dirname(project), "nowhere"), profile: "work", transport: "stdio" }),
    "Pasta: precisa ser uma pasta existente",
  );
  assert.equal(
    await errorOf("PUT", "/api/skills/globex/plain", { content: "no frontmatter" }),
    'O frontmatter do SKILL.md precisa começar com "---" e ter "name: plain"',
  );
  assert.equal(
    await errorOf("PUT", "/api/skills/globex/plain", { content: "---\nname: plain\n---\nBody" }),
    'O frontmatter do SKILL.md precisa de uma "description"',
  );
  assert.match(await errorOf("PUT", "/api/secrets/work/CR", { value: "a\r\nb" }), /retorno de carro/);
});
