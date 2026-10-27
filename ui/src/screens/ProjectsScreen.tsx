import { DownloadIcon, FolderGit2Icon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import type { ProjectApplyResult, ProjectView, Transport } from "../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApplyOutcomeView } from "../components/ApplyOutcomeView.tsx";
import { ConfirmAction } from "../components/ConfirmAction.tsx";
import { withFeedback, type Verdict } from "../components/feedback.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { applyProblem, isEmptyOutcome, outcomeOfResult, type ApplyOutcome } from "../domain/applyResult.ts";
import { basename, parentDir, plural } from "../domain/format.ts";
import { hintFor, projectDirProblem } from "../domain/validation.ts";
import { hrefFor } from "../router.ts";
import { useConfig } from "../state/config.ts";
import { useInstallProject, useProjects, useSyncAll, useUninstallProject } from "../state/projects.ts";

const transports: Transport[] = ["stdio", "http"];
const transportHints: Record<Transport, string> = {
  stdio: "one process per client",
  http: "shared agw serve",
};

type LastApply = { action: string; outcome: ApplyOutcome };

/** A request that succeeded can still leave a client, folder or project unapplied; that is a warning, not a success. */
function verdictFor(done: string) {
  return (outcome: ApplyOutcome): Verdict => {
    const problem = applyProblem(outcome);
    if (problem !== undefined) {
      return { tone: "warn", message: problem, description: "See the details under Last result." };
    }
    return { tone: "ok", message: done };
  };
}

function isTransport(value: string): value is Transport {
  return transports.some((transport) => transport === value);
}

export function ProjectsScreen() {
  const projects = useProjects();
  const sync = useSyncAll();
  const [last, setLast] = useState<LastApply | undefined>(undefined);
  const dirInput = useRef<HTMLInputElement>(null);

  async function syncAll() {
    const outcome = await withFeedback(sync.mutateAsync(), verdictFor("Synced."));
    if (outcome !== undefined) {
      setLast({ action: "Sync", outcome });
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Repositories where agw is installed for Claude Code, Codex and Grok."
        actions={
          <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => void syncAll()}>
            {sync.isPending && <Spinner />}
            {!sync.isPending && <RefreshCwIcon />}
            Sync all
          </Button>
        }
      />
      <InstallCard
        dirInput={dirInput}
        onApplied={(result) => setLast({ action: "Install", outcome: outcomeOfResult(result) })}
      />
      {last !== undefined && (
        <LastResult last={last} installed={projects.data?.length ?? 0} onDismiss={() => setLast(undefined)} />
      )}
      <QueryState query={projects}>
        {(views) => (
          <ProjectTable
            projects={views}
            onEmptyAction={() => dirInput.current?.focus()}
            onUninstalled={(result) => setLast({ action: "Uninstall", outcome: outcomeOfResult(result) })}
          />
        )}
      </QueryState>
    </>
  );
}

type InstallProps = { dirInput: RefObject<HTMLInputElement | null>; onApplied: (result: ProjectApplyResult) => void };

function InstallCard({ dirInput, onApplied }: InstallProps) {
  const config = useConfig();
  const install = useInstallProject();
  const profiles = Object.keys(config.data?.profiles ?? {}).sort();
  const [dir, setDir] = useState("");
  const [profile, setProfile] = useState("");
  const [transport, setTransport] = useState<Transport>("stdio");
  const chosenProfile = profile || profiles[0] || "";
  const trimmedDir = dir.trim();
  const dirProblem = projectDirProblem(trimmedDir);
  const dirHint = hintFor(trimmedDir, dirProblem);
  const blocked = dirProblem !== undefined || chosenProfile === "" || install.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install in a repository</CardTitle>
        <CardDescription>
          Writes the MCP configuration for Claude Code, Codex and Grok into the repository and links the profile's skills.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem] xl:grid-cols-[minmax(0,1fr)_12rem_auto_auto] xl:items-start"
          onChange={() => install.reset()}
          onSubmit={async (event) => {
            event.preventDefault();
            if (blocked) {
              return;
            }
            const result = await withFeedback(
              install.mutateAsync({ dir: trimmedDir, profile: chosenProfile, transport }),
              (applied) => verdictFor("Installed.")(outcomeOfResult(applied)),
            );
            if (result !== undefined) {
              onApplied(result);
            }
          }}
        >
          <Field data-invalid={dirHint !== undefined || install.error !== null} className="md:col-span-2 xl:col-span-1">
            <FieldLabel htmlFor="install-dir">Repository folder</FieldLabel>
            <Input
              ref={dirInput}
              id="install-dir"
              className="font-mono"
              placeholder="/absolute/path/to/repo"
              value={dir}
              aria-invalid={dirHint !== undefined}
              onChange={(event) => setDir(event.target.value)}
            />
            <FieldError>{dirHint ?? install.error?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="install-profile">Profile</FieldLabel>
            <Select value={chosenProfile} onValueChange={setProfile} disabled={profiles.length === 0}>
              <SelectTrigger id="install-profile" className="w-full">
                <SelectValue placeholder="No profiles" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.error !== null && <FieldError>Profiles unavailable: {config.error.message}</FieldError>}
          </Field>
          <Field>
            <FieldLabel id="install-transport-label">Transport</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-labelledby="install-transport-label"
              value={transport}
              onValueChange={(value) => {
                if (isTransport(value)) {
                  setTransport(value);
                }
              }}
            >
              {transports.map((option) => (
                <ToggleGroupItem key={option} value={option} className="px-4 font-mono" title={transportHints[option]}>
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>{transportHints[transport]}</FieldDescription>
          </Field>
          <Field className="md:col-span-2 xl:col-span-1">
            <FieldLabel className="hidden xl:block xl:invisible" aria-hidden="true">
              Install
            </FieldLabel>
            <Button type="submit" disabled={blocked} className="w-full xl:w-auto">
              {install.isPending && <Spinner />}
              {!install.isPending && <DownloadIcon />}
              Install
            </Button>
          </Field>
        </form>
      </CardContent>
    </Card>
  );
}

function LastResult({ last, installed, onDismiss }: { last: LastApply; installed: number; onDismiss: () => void }) {
  const { outcome } = last;
  const empty = isEmptyOutcome(outcome);
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>Last result · {last.action}</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close result" onClick={onDismiss}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty && installed === 0 && <p className="text-sm text-muted-foreground">No installed projects to sync.</p>}
        {empty && installed > 0 && (
          <p className="text-sm text-muted-foreground">
            The response was empty, but {plural(installed, "project is installed", "projects are installed")}.
          </p>
        )}
        <ApplyOutcomeView outcome={outcome} />
      </CardContent>
    </Card>
  );
}

type TableProps = {
  projects: ProjectView[];
  onEmptyAction: () => void;
  onUninstalled: (result: ProjectApplyResult) => void;
};

function ProjectTable({ projects, onEmptyAction, onUninstalled }: TableProps) {
  const sorted = [...projects].sort((a, b) => a.dir.localeCompare(b.dir));
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          Installed
          <Badge variant="secondary" className="tabular-nums">
            {projects.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      {sorted.length === 0 && (
        <Empty className="p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderGit2Icon />
            </EmptyMedia>
            <EmptyTitle>No projects installed</EmptyTitle>
            <EmptyDescription>Enter a repository folder above to install agw in it.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onEmptyAction}>
              Install your first project
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {sorted.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Folder</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Transport</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((project) => (
              <ProjectRow key={project.dir} project={project} onUninstalled={onUninstalled} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

type RowProps = { project: ProjectView; onUninstalled: (result: ProjectApplyResult) => void };

function ProjectRow({ project, onUninstalled }: RowProps) {
  const uninstall = useUninstallProject();
  const name = basename(project.dir);
  return (
    <TableRow>
      <TableCell className="max-w-0 pl-4">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={project.dir}>
          {parentDir(project.dir)}
        </div>
      </TableCell>
      <TableCell>
        <a className="underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile: project.profile })}>
          {project.profile}
        </a>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {project.transport}
        </Badge>
      </TableCell>
      <TableCell>
        {project.exists && <Badge variant="success">ok</Badge>}
        {!project.exists && <Badge variant="warning">folder not found</Badge>}
      </TableCell>
      <TableCell className="w-px pr-4 text-right">
        <ConfirmAction
          size="sm"
          label={
            <>
              {uninstall.isPending && <Spinner />}
              {!uninstall.isPending && <Trash2Icon />}
              Uninstall
            </>
          }
          title={`Uninstall from ${name}?`}
          description={
            <>
              Removes the agw configuration and the skill links from <span className="font-mono">{project.dir}</span>.
            </>
          }
          confirmLabel="Uninstall"
          disabled={uninstall.isPending}
          onConfirm={async () => {
            const result = await withFeedback(uninstall.mutateAsync(project.dir), (applied) =>
              verdictFor(`${name} uninstalled.`)(outcomeOfResult(applied)),
            );
            if (result !== undefined) {
              onUninstalled(result);
            }
          }}
        />
      </TableCell>
    </TableRow>
  );
}
