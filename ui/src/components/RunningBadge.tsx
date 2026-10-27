import type { ProfileState } from "../domain/health.ts";
import { Badge, type Tone } from "./Badge.tsx";

const looks: Record<ProfileState, { tone: Tone; label: string }> = {
  running: { tone: "ok", label: "rodando" },
  degraded: { tone: "warn", label: "com falha" },
  stopped: { tone: "neutral", label: "parado" },
  unknown: { tone: "neutral", label: "…" },
};

export function RunningBadge({ state }: { state: ProfileState }) {
  const look = looks[state];
  return <Badge tone={look.tone}>{look.label}</Badge>;
}
