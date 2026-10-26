import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdit } from "../src/admin/edits.ts";
import { type Config, parseConfig } from "../src/config.ts";
import { UserError } from "../src/errors.ts";

const config: Config = parseConfig({
  servers: {
    ado: { command: "ado-mcp", env: { PAT: "${ADO_PAT}" } },
    linear: { url: "https://mcp.example.com/mcp" },
  },
  profiles: {
    global: { servers: ["linear"] },
    globex: { extends: ["global"], servers: ["ado"], hiddenTools: ["ado__delete_repo", "linear__archive"] },
  },
});
const none = new Set<string>();

function rejects(kind: UserError["kind"], message: RegExp, run: () => unknown) {
  assert.throws(run, (error: unknown) => error instanceof UserError && error.kind === kind && message.test(error.message));
}

test("upsertServer adds or replaces a server without touching the input", () => {
  const next = applyEdit(config, { op: "upsertServer", name: "ado", spec: { command: "other", args: [], env: {} } }, none);
  assert.deepEqual(next.servers.ado, { command: "other", args: [], env: {} });
  assert.equal((config.servers.ado as { command: string }).command, "ado-mcp");
});

test("removeServer drops it from every profile and drops its hidden tools", () => {
  const next = applyEdit(config, { op: "removeServer", name: "ado" }, none);
  assert.equal("ado" in next.servers, false);
  assert.deepEqual(next.profiles.globex?.servers, []);
  assert.deepEqual(next.profiles.globex?.hiddenTools, ["linear__archive"]);
});

test("renameServer rewrites profile references and hidden tool names", () => {
  const next = applyEdit(config, { op: "renameServer", from: "ado", to: "azure" }, none);
  assert.deepEqual(Object.keys(next.servers), ["azure", "linear"]);
  assert.deepEqual(next.profiles.globex?.servers, ["azure"]);
  assert.deepEqual(next.profiles.globex?.hiddenTools, ["azure__delete_repo", "linear__archive"]);
  rejects("conflict", /already exists/, () => applyEdit(config, { op: "renameServer", from: "ado", to: "linear" }, none));
  rejects("notFound", /No server named "nope"/, () => applyEdit(config, { op: "renameServer", from: "nope", to: "x" }, none));
});

test("upsertProfile is validated against servers, parents and cycles", () => {
  const profile = { extends: ["globex"], servers: [], skills: ["globex-med"], hiddenTools: [] };
  const next = applyEdit(config, { op: "upsertProfile", name: "globex-med", profile }, none);
  assert.deepEqual(next.profiles["globex-med"], profile);
  rejects("invalid", /unknown server "github"/, () =>
    applyEdit(config, { op: "upsertProfile", name: "x", profile: { ...profile, servers: ["github"] } }, none),
  );
  rejects("invalid", /extends unknown profile "acme"/, () =>
    applyEdit(config, { op: "upsertProfile", name: "x", profile: { ...profile, extends: ["acme"] } }, none),
  );
  rejects("invalid", /Profile cycle: global -> globex -> global/, () =>
    applyEdit(config, { op: "upsertProfile", name: "global", profile: { ...profile, extends: ["globex"] } }, none),
  );
});

test("removeProfile is refused while a child extends it or a project uses it", () => {
  rejects("conflict", /extended by globex/, () => applyEdit(config, { op: "removeProfile", name: "global" }, none));
  rejects("conflict", /installed in a project/, () => applyEdit(config, { op: "removeProfile", name: "globex" }, new Set(["globex"])));
  const next = applyEdit(config, { op: "removeProfile", name: "globex" }, none);
  assert.deepEqual(Object.keys(next.profiles), ["global"]);
});

test("setToolHidden toggles a qualified tool of a known server", () => {
  const hidden = applyEdit(config, { op: "setToolHidden", profile: "global", tool: "linear__search", hidden: true }, none);
  assert.deepEqual(hidden.profiles.global?.hiddenTools, ["linear__search"]);
  const again = applyEdit(hidden, { op: "setToolHidden", profile: "global", tool: "linear__search", hidden: true }, none);
  assert.deepEqual(again.profiles.global?.hiddenTools, ["linear__search"]);
  const shown = applyEdit(config, { op: "setToolHidden", profile: "globex", tool: "ado__delete_repo", hidden: false }, none);
  assert.deepEqual(shown.profiles.globex?.hiddenTools, ["linear__archive"]);
  rejects("invalid", /not a <server>__<tool> name of a known server/, () =>
    applyEdit(config, { op: "setToolHidden", profile: "globex", tool: "github__x", hidden: true }, none),
  );
  rejects("notFound", /No profile named "acme"/, () =>
    applyEdit(config, { op: "setToolHidden", profile: "acme", tool: "ado__x", hidden: true }, none),
  );
});

test("the reserved gateway server name is rejected", () => {
  rejects("invalid", /reserved/, () =>
    applyEdit(config, { op: "upsertServer", name: "gateway", spec: { url: "https://x.example.com", headers: {} } }, none),
  );
});
