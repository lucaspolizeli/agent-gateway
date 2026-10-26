import { Badge } from "./Badge.tsx";

export function RunningBadge({ running }: { running: boolean }) {
  if (running) {
    return <Badge tone="ok">rodando</Badge>;
  }
  return <Badge tone="neutral">parado</Badge>;
}
