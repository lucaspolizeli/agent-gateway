import type { Health } from "../domain/health.ts";

const labels: Record<Health, string> = {
  ready: "pronto",
  connecting: "conectando",
  failed: "com falha",
  unknown: "sem status",
};

/** The dot carries color only; the label keeps the state readable for screen readers and tooltips. */
export function StatusDot({ health }: { health: Health }) {
  return (
    <span className={`dot dot-${health}`} title={labels[health]}>
      <span className="visually-hidden">{labels[health]}</span>
    </span>
  );
}
