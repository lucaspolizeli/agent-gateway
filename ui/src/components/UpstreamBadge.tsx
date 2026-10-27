import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type { UpstreamState } from "../contract.ts";

const variants: Record<UpstreamState["state"], ComponentProps<typeof Badge>["variant"]> = {
  connecting: "warning",
  ready: "success",
  failed: "destructive",
};

function label(upstream: UpstreamState): string {
  switch (upstream.state) {
    case "connecting":
      return "connecting";
    case "ready":
      return `${upstream.toolCount} tools`;
    case "failed":
      return "failed";
  }
}

export function UpstreamBadge({ upstream }: { upstream: UpstreamState }) {
  return <Badge variant={variants[upstream.state]}>{label(upstream)}</Badge>;
}
