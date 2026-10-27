import type { ProfileStatus, ResolvedProfileView, UpstreamState } from "./admin/contract.ts";
import { readAdminToken, TOKEN_HEADER } from "./admin/token.ts";

/** What the menu bar shows: either the service is unreachable, or a snapshot of every profile. */
export type MenuState =
  | { kind: "down"; logPath: string }
  | { kind: "up"; profiles: Array<{ view: ResolvedProfileView; status?: ProfileStatus }>; logPath: string };

type Health = "ok" | "warn" | "idle" | "down";

const HEALTH_COLOR: Record<Health, string> = { ok: "#34C759", warn: "#FF9500", idle: "#8E8E93", down: "#FF3B30" };
const ICON = "point.3.connected.trianglepath.dotted";

const UPSTREAM_SYMBOL: Record<UpstreamState["state"], string> = {
  ready: "checkmark.circle.fill",
  connecting: "arrow.triangle.2.circlepath",
  failed: "xmark.octagon.fill",
};
const UPSTREAM_COLOR: Record<UpstreamState["state"], string> = {
  ready: HEALTH_COLOR.ok,
  connecting: HEALTH_COLOR.idle,
  failed: HEALTH_COLOR.down,
};

/** SwiftBar splits a line on `|` and ends it at a newline, so upstream error text is flattened. */
function text(value: string, max = 90): string {
  const flat = value.replace(/\s*[|\n\r]+\s*/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, max - 1)}…`;
}

function action(agw: string, args: string[]): string {
  const params = args.map((arg, index) => `param${index + 1}="${arg}"`).join(" ");
  return `bash="${agw}" ${params} terminal=false refresh=true`;
}

function profileHealth(status: ProfileStatus | undefined, view: ResolvedProfileView): Health {
  if (status === undefined || !status.running) {
    if (view.missingSecrets.length > 0) {
      return "warn";
    }
    return "idle";
  }
  if (view.missingSecrets.length > 0 || status.upstreams.some((upstream) => upstream.state === "failed")) {
    return "warn";
  }
  return "ok";
}

function overallHealth(state: MenuState): Health {
  if (state.kind === "down") {
    return "down";
  }
  const healths = state.profiles.map(({ view, status }) => profileHealth(status, view));
  if (healths.includes("warn")) {
    return "warn";
  }
  if (healths.includes("ok")) {
    return "ok";
  }
  return "idle";
}

function upstreamLines(profile: string, upstream: UpstreamState, agw: string): string[] {
  const style = `sfimage=${UPSTREAM_SYMBOL[upstream.state]} sfcolor=${UPSTREAM_COLOR[upstream.state]}`;
  if (upstream.state === "ready") {
    return [`--${upstream.server} · ${upstream.toolCount} tools | ${style}`];
  }
  if (upstream.state === "connecting") {
    return [`--${upstream.server} · conectando | ${style}`];
  }
  return [
    `--${upstream.server} · falhou | ${style}`,
    `----${text(upstream.error)} | size=11`,
    `----Reconectar | ${action(agw, ["menubar", "reconnect", profile, upstream.server])}`,
  ];
}

function profileLines(view: ResolvedProfileView, status: ProfileStatus | undefined, agw: string): string[] {
  const health = profileHealth(status, view);
  let label = "parado";
  if (status?.running) {
    label = "rodando";
  }
  const lines = [`${view.name} · ${label} | sfimage=circle.fill sfcolor=${HEALTH_COLOR[health]}`];
  lines.push(`--${view.chain.join(" › ")} | size=11`);
  if (status?.running) {
    for (const upstream of status.upstreams) {
      lines.push(...upstreamLines(view.name, upstream, agw));
    }
    if (status.upstreams.length === 0) {
      lines.push("--Nenhum servidor neste perfil | size=11");
    }
  } else {
    lines.push(`--Iniciar e testar conexões | ${action(agw, ["menubar", "start", view.name])}`);
  }
  for (const key of view.missingSecrets) {
    lines.push(`--Segredo faltando: ${key} | sfimage=key.fill sfcolor=${HEALTH_COLOR.warn} ${action(agw, ["ui", `profiles/${view.name}/segredos`])}`);
  }
  lines.push(`--Abrir na interface | ${action(agw, ["ui", `profiles/${view.name}`])}`);
  return lines;
}

/** Renders SwiftBar's plugin output. `agw` is the absolute path the menu actions run. */
export function renderMenu(state: MenuState, agw: string): string {
  const lines = [` | sfimage=${ICON} sfcolor=${HEALTH_COLOR[overallHealth(state)]}`, "---"];
  if (state.kind === "down") {
    lines.push("agw serve não está rodando | color=#FF3B30");
    lines.push(`Iniciar serviço | ${action(agw, ["service", "start"])}`);
  } else {
    const running = state.profiles.filter(({ status }) => status?.running).length;
    const failures = state.profiles
      .flatMap(({ status }) => status?.upstreams ?? [])
      .filter((upstream) => upstream.state === "failed").length;
    lines.push(`agw · ${running} de ${state.profiles.length} perfis rodando · ${failures} falhas | size=12`);
    lines.push(`Abrir interface | sfimage=macwindow ${action(agw, ["ui"])}`);
    lines.push("---");
    for (const { view, status } of state.profiles) {
      lines.push(...profileLines(view, status, agw));
    }
    lines.push("---");
    lines.push(`Reiniciar serviço | ${action(agw, ["service", "start"])}`);
  }
  lines.push(`Ver log | bash="/usr/bin/open" param1="-a" param2="Console" param3="${state.logPath}" terminal=false`);
  lines.push("Atualizar | refresh=true");
  return `${lines.join("\n")}\n`;
}

async function api<T>(port: number, token: string, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    headers: { [TOKEN_HEADER]: token },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadMenuState(home: string, port: number, logPath: string): Promise<MenuState> {
  const token = readAdminToken(home);
  if (token === undefined) {
    return { kind: "down", logPath };
  }
  let views: ResolvedProfileView[];
  try {
    views = await api<ResolvedProfileView[]>(port, token, "/profiles");
  } catch {
    return { kind: "down", logPath };
  }
  const statuses = await Promise.all(
    views.map((view) => api<ProfileStatus>(port, token, `/profiles/${view.name}/status`).catch(() => undefined)),
  );
  const profiles = views
    .map((view, index) => ({ view, status: statuses[index] }))
    .sort((a, b) => a.view.name.localeCompare(b.view.name));
  return { kind: "up", profiles, logPath };
}

const MENU_ACTIONS: Record<string, (args: string[]) => { method: "GET" | "POST"; path: string }> = {
  start: ([profile]) => ({ method: "GET", path: `/profiles/${profile}/status?start=1` }),
  reconnect: ([profile, server]) => ({ method: "POST", path: `/profiles/${profile}/servers/${server}/reconnect` }),
};

/** The menu's write actions go through the same admin API as the web UI. */
export async function runMenuAction(home: string, port: number, verb: string, args: string[]): Promise<void> {
  const token = readAdminToken(home);
  if (token === undefined) {
    throw new Error("No admin token; is agw serve running?");
  }
  const build = MENU_ACTIONS[verb];
  if (build === undefined) {
    throw new Error(`Unknown menubar action "${verb}"`);
  }
  const { method, path } = build(args);
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { [TOKEN_HEADER]: token } });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
}
