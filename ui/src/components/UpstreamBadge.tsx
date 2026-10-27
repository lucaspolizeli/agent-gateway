import type { UpstreamState } from "../contract.ts";
import { Badge, type Tone } from "./Badge.tsx";

const tones: Record<UpstreamState["state"], Tone> = {
  connecting: "accent",
  ready: "ok",
  failed: "danger",
};

function label(upstream: UpstreamState): string {
  switch (upstream.state) {
    case "connecting":
      return "conectando";
    case "ready":
      return `${upstream.toolCount} tools`;
    case "failed":
      return "falhou";
  }
}

export function UpstreamBadge({ upstream }: { upstream: UpstreamState }) {
  return <Badge tone={tones[upstream.state]}>{label(upstream)}</Badge>;
}
