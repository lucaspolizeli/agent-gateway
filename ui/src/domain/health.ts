import type { ProfileStatus, ResolvedProfileView, UpstreamState } from "../contract.ts";

export type Health = "ready" | "connecting" | "failed" | "unknown";

export type AttentionItem =
  | { kind: "failedServer"; profile: string; server: string; error: string }
  | { kind: "missingSecret"; profile: string; key: string };

export type HealthSummary = {
  profiles: number;
  running: number;
  serversReady: number;
  serversFailing: number;
  missingSecrets: number;
  attention: AttentionItem[];
};

/** Upstreams of stopped gateways are stale or empty, so only running profiles count. */
function runningUpstreams(statuses: ProfileStatus[]): Array<{ profile: string; upstream: UpstreamState }> {
  return statuses
    .filter((status) => status.running)
    .flatMap((status) => status.upstreams.map((upstream) => ({ profile: status.profile.name, upstream })));
}

export function healthSummary(views: ResolvedProfileView[], statuses: ProfileStatus[]): HealthSummary {
  const attention: AttentionItem[] = [];
  let serversReady = 0;
  for (const { profile, upstream } of runningUpstreams(statuses)) {
    if (upstream.state === "ready") {
      serversReady += 1;
    }
    if (upstream.state === "failed") {
      attention.push({ kind: "failedServer", profile, server: upstream.server, error: upstream.error });
    }
  }
  const serversFailing = attention.length;
  for (const view of views) {
    for (const key of view.missingSecrets) {
      attention.push({ kind: "missingSecret", profile: view.name, key });
    }
  }
  return {
    profiles: views.length,
    running: statuses.filter((status) => status.running).length,
    serversReady,
    serversFailing,
    missingSecrets: attention.length - serversFailing,
    attention,
  };
}

const severity: Record<Health, number> = { unknown: 0, ready: 1, connecting: 2, failed: 3 };

function worse(a: Health, b: Health): Health {
  if (severity[b] > severity[a]) {
    return b;
  }
  return a;
}

/** A server's health across every running profile that includes it: the worst state wins. */
export function serverHealth(statuses: ProfileStatus[]): Map<string, Health> {
  const health = new Map<string, Health>();
  for (const { upstream } of runningUpstreams(statuses)) {
    health.set(upstream.server, worse(health.get(upstream.server) ?? "unknown", upstream.state));
  }
  return health;
}

export type ProfileState = "running" | "degraded" | "stopped" | "unknown";

export function profileState(status: ProfileStatus | undefined): ProfileState {
  if (status === undefined) {
    return "unknown";
  }
  if (!status.running) {
    return "stopped";
  }
  if (status.upstreams.some((upstream) => upstream.state === "failed")) {
    return "degraded";
  }
  return "running";
}
