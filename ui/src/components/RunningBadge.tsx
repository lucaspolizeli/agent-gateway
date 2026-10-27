import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type { ProfileState } from "../domain/health.ts";

type Variant = ComponentProps<typeof Badge>["variant"];

const looks: Record<ProfileState, { variant: Variant; label: string }> = {
  running: { variant: "success", label: "running" },
  degraded: { variant: "warning", label: "failing" },
  stopped: { variant: "secondary", label: "stopped" },
  unknown: { variant: "outline", label: "…" },
};

export function RunningBadge({ state }: { state: ProfileState }) {
  const look = looks[state];
  return <Badge variant={look.variant}>{look.label}</Badge>;
}
