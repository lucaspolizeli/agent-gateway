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
  stdio: "um processo por cliente",
  http: "agw serve compartilhado",
};

type LastApply = { action: string; outcome: ApplyOutcome };

/** A request that succeeded can still leave a client, folder or project unapplied; that is a warning, not a success. */
function verdictFor(done: string) {
  return (outcome: ApplyOutcome): Verdict => {
    const problem = applyProblem(outcome);
    if (problem !== undefined) {
      return { tone: "warn", message: problem, description: "Veja os detalhes em Último resultado." };
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
    const outcome = await withFeedback(sync.mutateAsync(), verdictFor("Sincronizado."));
    if (outcome !== undefined) {
      setLast({ action: "Sincronização", outcome });
    }
  }

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Repositórios onde o agw está instalado para Claude, Codex e Grok."
        actions={
          <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => void syncAll()}>
            {sync.isPending && <Spinner />}
            {!sync.isPending && <RefreshCwIcon />}
            Sincronizar tudo
          </Button>
        }
      />
      <InstallCard
        dirInput={dirInput}
        onApplied={(result) => setLast({ action: "Instalação", outcome: outcomeOfResult(result) })}
      />
      {last !== undefined && (
        <LastResult last={last} installed={projects.data?.length ?? 0} onDismiss={() => setLast(undefined)} />
      )}
      <QueryState query={projects}>
        {(views) => (
          <ProjectTable
            projects={views}
            onEmptyAction={() => dirInput.current?.focus()}
            onUninstalled={(result) => setLast({ action: "Desinstalação", outcome: outcomeOfResult(result) })}
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
        <CardTitle>Instalar em um repositório</CardTitle>
        <CardDescription>
          Escreve a configuração MCP de Claude, Codex e Grok no repositório e linka as skills do perfil.
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
              (applied) => verdictFor("Instalado.")(outcomeOfResult(applied)),
            );
            if (result !== undefined) {
              onApplied(result);
            }
          }}
        >
          <Field data-invalid={dirHint !== undefined || install.error !== null} className="md:col-span-2 xl:col-span-1">
            <FieldLabel htmlFor="install-dir">Diretório do repositório</FieldLabel>
            <Input
              ref={dirInput}
              id="install-dir"
              className="font-mono"
              placeholder="/caminho/absoluto/do/repo"
              value={dir}
              aria-invalid={dirHint !== undefined}
              onChange={(event) => setDir(event.target.value)}
            />
            <FieldError>{dirHint ?? install.error?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="install-profile">Perfil</FieldLabel>
            <Select value={chosenProfile} onValueChange={setProfile} disabled={profiles.length === 0}>
              <SelectTrigger id="install-profile" className="w-full">
                <SelectValue placeholder="Nenhum perfil" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.error !== null && <FieldError>Perfis indisponíveis: {config.error.message}</FieldError>}
          </Field>
          <Field>
            <FieldLabel id="install-transport-label">Transporte</FieldLabel>
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
              Instalar
            </FieldLabel>
            <Button type="submit" disabled={blocked} className="w-full xl:w-auto">
              {install.isPending && <Spinner />}
              {!install.isPending && <DownloadIcon />}
              Instalar
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
        <CardTitle>Último resultado · {last.action}</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar resultado" onClick={onDismiss}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty && installed === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto instalado para sincronizar.</p>}
        {empty && installed > 0 && (
          <p className="text-sm text-muted-foreground">
            A resposta veio vazia, mas {plural(installed, "projeto está instalado", "projetos estão instalados")}.
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
          Instalados
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
            <EmptyTitle>Nenhum projeto instalado</EmptyTitle>
            <EmptyDescription>Informe o diretório de um repositório acima para instalar o agw nele.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onEmptyAction}>
              Instalar o primeiro projeto
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {sorted.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Diretório</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Transporte</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Ações</span>
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
        {!project.exists && <Badge variant="warning">pasta não encontrada</Badge>}
      </TableCell>
      <TableCell className="w-px pr-4 text-right">
        <ConfirmAction
          size="sm"
          label={
            <>
              {uninstall.isPending && <Spinner />}
              {!uninstall.isPending && <Trash2Icon />}
              Desinstalar
            </>
          }
          title={`Desinstalar de ${name}?`}
          description={
            <>
              Remove a configuração do agw e os links de skills de <span className="font-mono">{project.dir}</span>.
            </>
          }
          confirmLabel="Desinstalar"
          disabled={uninstall.isPending}
          onConfirm={async () => {
            const result = await withFeedback(uninstall.mutateAsync(project.dir), (applied) =>
              verdictFor(`${name} desinstalado.`)(outcomeOfResult(applied)),
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
