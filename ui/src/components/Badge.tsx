import type { ReactNode } from "react";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}
