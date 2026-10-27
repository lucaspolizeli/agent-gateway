import { cn } from "@/lib/utils";
import type { Health } from "../domain/health.ts";

const labels: Record<Health, string> = {
  ready: "pronto",
  connecting: "conectando",
  failed: "com falha",
  unknown: "sem status",
};

const tones: Record<Health, string> = {
  ready: "bg-success",
  connecting: "bg-warning animate-pulse",
  failed: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

/** The dot carries color only; the label keeps the state readable for screen readers and tooltips. */
export function StatusDot({ health }: { health: Health }) {
  return (
    <span className="inline-flex size-2 shrink-0 items-center" title={labels[health]}>
      <span className={cn("size-2 rounded-full", tones[health])} />
      <span className="sr-only">{labels[health]}</span>
    </span>
  );
}
