import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { ApplyOutcome } from "../domain/applyResult.ts";
import { ApplyResultView } from "./ApplyResultView.tsx";

type Entry = { dir: string; reason: string };

const MISSING_REASON = "The folder no longer exists. Create it again or uninstall the project.";
const UNSAFE_REASON = "The folder resolves to your user-level configuration (for example, $HOME), so agw does not write to it.";

/** Every bucket of an apply, so a project never disappears from the result: applied, missing, refused or failed. */
export function ApplyOutcomeView({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <div className="space-y-3">
      {outcome.applied.length > 0 && (
        <Bucket title="Applied" variant="success" count={outcome.applied.length}>
          {outcome.applied.map((result) => (
            <ApplyResultView key={result.dir} result={result} />
          ))}
        </Bucket>
      )}
      <ReasonBucket
        title="Folder not found"
        variant="warning"
        entries={outcome.missing.map((dir) => ({ dir, reason: MISSING_REASON }))}
      />
      <ReasonBucket
        title="Refused"
        variant="warning"
        entries={outcome.unsafe.map((dir) => ({ dir, reason: UNSAFE_REASON }))}
      />
      <ReasonBucket
        title="Not applied"
        variant="destructive"
        entries={outcome.failed.map((entry) => ({ dir: entry.dir, reason: entry.error }))}
      />
    </div>
  );
}

type BucketProps = {
  title: string;
  variant: ComponentProps<typeof Badge>["variant"];
  count: number;
  children: ReactNode;
};

function Bucket({ title, variant, count, children }: BucketProps) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Badge variant={variant}>{title}</Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function ReasonBucket({ title, variant, entries }: Omit<BucketProps, "count" | "children"> & { entries: Entry[] }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <Bucket title={title} variant={variant} count={entries.length}>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.dir} className="rounded-lg border p-3">
            <div className="truncate font-mono text-xs" title={entry.dir}>
              {entry.dir}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{entry.reason}</div>
          </li>
        ))}
      </ul>
    </Bucket>
  );
}
