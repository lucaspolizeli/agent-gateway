import type { Tone } from "./Badge.tsx";

/** A small count pill; renders nothing for zero so empty states stay quiet. */
export function CountBadge({ count, tone = "neutral", label }: { count: number; tone?: Tone; label?: string }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className={`count count-${tone}`} title={label}>
      {count}
    </span>
  );
}
