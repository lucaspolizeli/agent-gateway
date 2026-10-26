import type { ProjectApplyResult } from "../contract.ts";

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
