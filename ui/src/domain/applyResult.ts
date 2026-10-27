import type { ProjectApplyResult } from "../contract.ts";
import { plural } from "./format.ts";

export type SkillCounts = { linked: number; removed: number; skipped: number };

export function skillCounts(result: ProjectApplyResult): SkillCounts {
  const counts: SkillCounts = { linked: 0, removed: 0, skipped: 0 };
  for (const target of result.skills) {
    counts.linked += target.linked.length;
    counts.removed += target.removed.length;
    counts.skipped += target.skipped.length;
  }
  return counts;
}

/** Clients that did not apply cleanly, each named once across every project. */
export function failedClients(results: ProjectApplyResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const client of result.clients) {
      if (!client.ok) {
        names.add(client.client);
      }
    }
  }
  return [...names];
}

export type ApplyOutcome = {
  applied: ProjectApplyResult[];
  missing: string[];
  unsafe: string[];
  failed: Array<{ dir: string; error: string }>;
};

export function outcomeOfResult(result: ProjectApplyResult): ApplyOutcome {
  return { applied: [result], missing: [], unsafe: [], failed: [] };
}

export function isEmptyOutcome(outcome: ApplyOutcome): boolean {
  return (
    outcome.applied.length === 0 &&
    outcome.missing.length === 0 &&
    outcome.unsafe.length === 0 &&
    outcome.failed.length === 0
  );
}

/** What went wrong in an apply, or `undefined` when every client of every project succeeded. */
export function applyProblem(outcome: ApplyOutcome): string | undefined {
  const parts: string[] = [];
  const clients = failedClients(outcome.applied);
  if (clients.length > 0) {
    parts.push(`Done, but ${clients.join(", ")} failed`);
  }
  if (outcome.missing.length > 0) {
    parts.push(plural(outcome.missing.length, "missing folder", "missing folders"));
  }
  if (outcome.unsafe.length > 0) {
    parts.push(plural(outcome.unsafe.length, "refused folder", "refused folders"));
  }
  if (outcome.failed.length > 0) {
    parts.push(plural(outcome.failed.length, "project not applied", "projects not applied"));
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (clients.length === 0) {
    parts[0] = `Done with issues: ${parts[0]}`;
  }
  return parts.join(" · ");
}
