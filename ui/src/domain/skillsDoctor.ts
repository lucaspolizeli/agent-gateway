import type { CliName, CliProbe, SkillDoctorRow, SkillsDoctorReport } from "../contract.ts";

export const cliNames: CliName[] = ["claude", "codex", "grok"];

export const cliLabels: Record<CliName, string> = { claude: "Claude", codex: "Codex", grok: "Grok" };

/** `unknown` when the CLI could not be asked: its `visible` flag then says nothing. */
export type Visibility = "visible" | "missing" | "unknown";

export function visibility(row: SkillDoctorRow, cli: CliName, probes: Record<CliName, CliProbe>): Visibility {
  if (!probes[cli].ok) {
    return "unknown";
  }
  if (row.visible[cli]) {
    return "visible";
  }
  return "missing";
}

export function needsAttention(row: SkillDoctorRow, probes: Record<CliName, CliProbe>): boolean {
  return row.problems.length > 0 || cliNames.some((cli) => visibility(row, cli, probes) === "missing");
}

export function failedProbes(report: SkillsDoctorReport): Array<{ cli: CliName; error: string }> {
  return cliNames.flatMap((cli) => {
    const probe = report.probes[cli];
    if (probe.ok) {
      return [];
    }
    return [{ cli, error: probe.error }];
  });
}

export function shownRows(report: SkillsDoctorReport, onlyProblems: boolean): SkillDoctorRow[] {
  const rows = [...report.rows].sort((a, b) => a.name.localeCompare(b.name));
  if (!onlyProblems) {
    return rows;
  }
  return rows.filter((row) => needsAttention(row, report.probes));
}

/** The doctor's scope as a Select value: the user level, or a project's absolute directory. */
export const USER_SCOPE = "user";

export function scopeDir(scope: string): string | undefined {
  if (scope === USER_SCOPE) {
    return undefined;
  }
  return scope;
}
