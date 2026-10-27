import { CheckIcon, CircleAlertIcon, HelpCircleIcon, LinkIcon, StethoscopeIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import type { CliName, CliProbe, SkillDoctorRow, SkillsDoctorReport } from "../../contract.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { announce } from "../../components/feedback.ts";
import { ErrorBox } from "../../components/QueryState.tsx";
import { basename, plural } from "../../domain/format.ts";
import { originDetail, originLabels } from "../../domain/skillOrigin.ts";
import {
  cliLabels,
  cliNames,
  failedProbes,
  needsAttention,
  scopeDir,
  shownRows,
  USER_SCOPE,
  visibility,
  type Visibility,
} from "../../domain/skillsDoctor.ts";
import { useProjects } from "../../state/projects.ts";
import { useSkillsDoctor } from "../../state/skills.ts";

/** How long a run usually takes, so the bar moves while the CLIs answer; it never claims to finish early. */
const EXPECTED_SECONDS = 12;

function useElapsedSeconds(running: boolean): number {
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  if (running && startedAt === undefined) {
    setStartedAt(Date.now());
  }
  if (!running && startedAt !== undefined) {
    setStartedAt(undefined);
  }
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  if (startedAt === undefined) {
    return 0;
  }
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function scopeLabel(dir: string | null | undefined): string {
  if (dir === null || dir === undefined) {
    return "User level";
  }
  return dir;
}

export function DoctorView() {
  const projects = useProjects();
  const doctor = useSkillsDoctor();
  const [scope, setScope] = useState(USER_SCOPE);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const elapsed = useElapsedSeconds(doctor.isPending);
  const dirs = (projects.data ?? []).map((project) => project.dir).sort();

  async function run() {
    try {
      const report = await doctor.mutateAsync(scopeDir(scope));
      const flagged = report.rows.filter((row) => needsAttention(row, report.probes)).length;
      const failed = failedProbes(report).length;
      if (failed > 0) {
        announce({ tone: "warn", message: `Partial check: ${plural(failed, "CLI did not answer", "CLIs did not answer")}.` });
      } else if (flagged > 0 || report.brokenLinks.length > 0) {
        announce({ tone: "warn", message: `${plural(flagged, "skill has problems", "skills have problems")}.` });
      } else {
        announce({ tone: "ok", message: "Every skill shows up in all three CLIs." });
      }
    } catch (error) {
      let message = String(error);
      if (error instanceof Error) {
        message = error.message;
      }
      announce({ tone: "error", message: `Doctor failed: ${message}` });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="w-full sm:w-80">
            <FieldLabel htmlFor="doctor-scope">Scope</FieldLabel>
            <Select value={scope} onValueChange={setScope} disabled={doctor.isPending}>
              <SelectTrigger id="doctor-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USER_SCOPE}>User level</SelectItem>
                {dirs.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Installed projects</SelectLabel>
                    {dirs.map((dir) => (
                      <SelectItem key={dir} value={dir}>
                        <span className="font-medium">{basename(dir)}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{dir}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </Field>
          <Button type="button" disabled={doctor.isPending} onClick={() => void run()}>
            {doctor.isPending && <Spinner />}
            {!doctor.isPending && <StethoscopeIcon />}
            Run doctor
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Runs Claude Code, Codex and Grok and asks which skills each one discovers. This takes a few seconds.
          </p>
        </CardContent>
      </Card>
      <DoctorBody
        pending={doctor.isPending}
        elapsed={elapsed}
        error={doctor.error}
        report={doctor.data}
        onlyProblems={onlyProblems}
        onOnlyProblems={setOnlyProblems}
        onRun={() => void run()}
      />
    </div>
  );
}

type BodyProps = {
  pending: boolean;
  elapsed: number;
  error: Error | null;
  report?: SkillsDoctorReport;
  onlyProblems: boolean;
  onOnlyProblems: (only: boolean) => void;
  onRun: () => void;
};

function DoctorBody({ pending, elapsed, error, report, onlyProblems, onOnlyProblems, onRun }: BodyProps) {
  if (pending) {
    return <Running elapsed={elapsed} />;
  }
  if (error !== null) {
    return <ErrorBox title="Doctor failed" message={error.message} />;
  }
  if (report === undefined) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <StethoscopeIcon />
          </EmptyMedia>
          <EmptyTitle>No doctor run yet</EmptyTitle>
          <EmptyDescription>
            Choose a scope and check that every skill shows up in Claude Code, Codex and Grok with valid frontmatter.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={onRun}>
            <StethoscopeIcon />
            Run doctor
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return <Report report={report} onlyProblems={onlyProblems} onOnlyProblems={onOnlyProblems} />;
}

function Running({ elapsed }: { elapsed: number }) {
  const progress = Math.min(95, Math.round((elapsed / EXPECTED_SECONDS) * 100));
  return (
    <Card size="sm" aria-busy="true">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner />
          Asking Claude Code, Codex and Grok…
        </CardTitle>
        <CardDescription role="status">{plural(elapsed, "second", "seconds")} so far</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={progress} aria-label="Doctor progress" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

type ReportProps = { report: SkillsDoctorReport; onlyProblems: boolean; onOnlyProblems: (only: boolean) => void };

function Report({ report, onlyProblems, onOnlyProblems }: ReportProps) {
  const rows = shownRows(report, onlyProblems);
  const flagged = report.rows.filter((row) => needsAttention(row, report.probes)).length;
  const failed = failedProbes(report);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Result for</span>
        <span className="font-medium">{scopeLabel(report.dir)}</span>
        <span className="flex-1" />
        {cliNames.map((cli) => (
          <ProbeBadge key={cli} cli={cli} probe={report.probes[cli]} />
        ))}
      </div>
      {failed.map(({ cli, error }) => (
        <Alert key={cli} variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Could not ask {cliLabels[cli]}</AlertTitle>
          <AlertDescription>
            <span>The {cliLabels[cli]} column shows "?" because its answer is unknown.</span>
            <pre className="mt-1 w-full overflow-auto font-mono text-xs whitespace-pre-wrap">{error}</pre>
          </AlertDescription>
        </Alert>
      ))}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <span className="text-sm">
            {plural(report.rows.length, "skill", "skills")}
            {flagged > 0 && <span className="text-destructive"> · {flagged} with problems</span>}
          </span>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <Switch id="only-problems" checked={onlyProblems} onCheckedChange={onOnlyProblems} />
            <Label htmlFor="only-problems">Only problems</Label>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Skill</TableHead>
              {cliNames.map((cli) => (
                <TableHead key={cli} className="w-20 text-center">
                  {cliLabels[cli]}
                </TableHead>
              ))}
              <TableHead className="pr-4">Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cliNames.length + 2}>
                  <Empty className="p-6">
                    <EmptyHeader>
                      <EmptyTitle>{emptyTitle(report, onlyProblems)}</EmptyTitle>
                    </EmptyHeader>
                    {onlyProblems && (
                      <EmptyContent>
                        <Button type="button" variant="outline" size="sm" onClick={() => onOnlyProblems(false)}>
                          Show all
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <DoctorRow key={row.name} row={row} probes={report.probes} />
            ))}
          </TableBody>
        </Table>
      </Card>
      <BrokenLinks links={report.brokenLinks} />
    </div>
  );
}

function emptyTitle(report: SkillsDoctorReport, onlyProblems: boolean): string {
  if (report.rows.length === 0) {
    return "No skills expected in this scope";
  }
  if (onlyProblems) {
    return "No skills with problems";
  }
  return "No skills";
}

function ProbeBadge({ cli, probe }: { cli: CliName; probe: CliProbe }) {
  if (!probe.ok) {
    return (
      <Badge variant="destructive">
        <XIcon data-icon="inline-start" />
        {cliLabels[cli]}: failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      {cliLabels[cli]}: {plural(probe.count, "skill", "skills")}
    </Badge>
  );
}

const cellLooks: Record<Visibility, { variant: ComponentProps<typeof Badge>["variant"]; label: string }> = {
  visible: { variant: "success", label: "sees it" },
  missing: { variant: "destructive", label: "does not see it" },
  unknown: { variant: "outline", label: "unknown: the CLI did not answer" },
};

const cellIcons: Record<Visibility, typeof CheckIcon> = { visible: CheckIcon, missing: XIcon, unknown: HelpCircleIcon };

function DoctorRow({ row, probes }: { row: SkillDoctorRow; probes: Record<CliName, CliProbe> }) {
  return (
    <TableRow>
      <TableCell className="max-w-0 pl-4">
        <div className="truncate font-medium">{row.name}</div>
        <div className="truncate text-xs text-muted-foreground" title={originDetail(row.origin)}>
          {originLabels[row.origin.kind]} · <span className="font-mono">{originDetail(row.origin)}</span>
        </div>
      </TableCell>
      {cliNames.map((cli) => {
        const state = visibility(row, cli, probes);
        const look = cellLooks[state];
        const Icon = cellIcons[state];
        return (
          <TableCell key={cli} className="text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={look.variant} className="w-8" tabIndex={0} aria-label={`${cliLabels[cli]}: ${look.label}`}>
                  <Icon />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {cliLabels[cli]}: {look.label}
              </TooltipContent>
            </Tooltip>
          </TableCell>
        );
      })}
      <TableCell className="max-w-0 pr-4 whitespace-normal">
        {row.problems.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
        <ul className="space-y-0.5">
          {row.problems.map((problem) => (
            <li key={problem} className="text-xs text-destructive">
              {problem}
            </li>
          ))}
        </ul>
      </TableCell>
    </TableRow>
  );
}

function BrokenLinks({ links }: { links: string[] }) {
  if (links.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LinkIcon className="size-4" />
        No broken links.
      </p>
    );
  }
  return (
    <Alert variant="warning">
      <LinkIcon />
      <AlertTitle>{plural(links.length, "broken link", "broken links")}</AlertTitle>
      <AlertDescription>
        <span>Symlinks in skill folders whose target no longer exists. Remove them to clear this list.</span>
        <ul className="mt-1 w-full space-y-0.5">
          {links.map((link) => (
            <li key={link} className="truncate font-mono text-xs" title={link}>
              {link}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
