import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProfileStatus, ResolvedProfileView } from "../src/admin/contract.ts";
import { renderMenu } from "../src/menubar.ts";

const AGW = "/home/me/.agw/bin/agw";

function view(name: string, missingSecrets: string[] = []): ResolvedProfileView {
  return { name, chain: ["global", name], servers: {}, skillSets: [], missingSecrets };
}

function status(name: string, upstreams: ProfileStatus["upstreams"]): ProfileStatus {
  return { profile: view(name), running: true, upstreams, tools: [] };
}

test("an unreachable service turns the icon red and offers to start it", () => {
  const menu = renderMenu({ kind: "down", logPath: "/l" }, AGW);
  assert.match(menu.split("\n")[0]!, /sfcolor=#FF3B30/);
  assert.match(menu, /Iniciar serviço \| bash="\/home\/me\/.agw\/bin\/agw" param1="service" param2="start"/);
});

test("a failed upstream turns the icon orange and offers a reconnect with a flattened error", () => {
  const menu = renderMenu(
    {
      kind: "up",
      logPath: "/l",
      profiles: [
        { view: view("globex"), status: status("globex", [{ server: "ado", state: "ready", toolCount: 44 }, { server: "zep", state: "failed", error: "boom | bad\nline" }]) },
        { view: view("acme") },
      ],
    },
    AGW,
  );
  assert.match(menu.split("\n")[0]!, /sfcolor=#FF9500/);
  assert.match(menu, /agw · 1 de 2 perfis rodando · 1 falhas/);
  assert.match(menu, /--ado · 44 tools/);
  assert.match(menu, /----boom bad line \| size=11/);
  assert.match(menu, /----Reconectar \| bash="[^"]+" param1="menubar" param2="reconnect" param3="globex" param4="zep"/);
  assert.match(menu, /--Iniciar e testar conexões \| bash="[^"]+" param1="menubar" param2="start" param3="acme"/);
});

test("all running profiles healthy is green, and a missing secret links to its tab", () => {
  const healthy = renderMenu({ kind: "up", logPath: "/l", profiles: [{ view: view("globex"), status: status("globex", []) }] }, AGW);
  assert.match(healthy.split("\n")[0]!, /sfcolor=#34C759/);

  const missing = renderMenu({ kind: "up", logPath: "/l", profiles: [{ view: view("initech", ["ZOHO"]) }] }, AGW);
  assert.match(missing.split("\n")[0]!, /sfcolor=#FF9500/);
  assert.match(missing, /--Segredo faltando: ZOHO .* param1="ui" param2="profiles\/initech\/secrets"/);
});
