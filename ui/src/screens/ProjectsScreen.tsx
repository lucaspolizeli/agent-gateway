import { useState, type ReactNode } from "react";
import type { ProjectApplyResult, ProjectView, Transport } from "../contract.ts";
import { ApplyResultView } from "../components/ApplyResultView.tsx";
import { Badge } from "../components/Badge.tsx";
import { ConfirmButton } from "../components/ConfirmButton.tsx";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { basename, parentDir } from "../domain/format.ts";
import { hrefFor } from "../router.ts";
import { useConfig } from "../state/config.ts";
import { useInstallProject, useProjects, useSyncAll, useUninstallProject } from "../state/projects.ts";

const transportLabels: Record<Transport, string> = { stdio: "stdio", http: "http" };
const transportHints: Record<Transport, string> = {
  stdio: "um processo por cliente",
  http: "agw serve compartilhado",
};

type LastApply = { action: string; results: ProjectApplyResult[] };

export function ProjectsScreen() {
  const projects = useProjects();
  const sync = useSyncAll();
  const uninstall = useUninstallProject();
  const [last, setLast] = useState<LastApply | undefined>(undefined);
  return (
    <section>
      <PageHeader
        title="Projetos"
        description="Repositórios onde o agw está instalado para Claude, Codex e Grok."
        actions={
          <>
            <MutationStatus mutation={sync} success="Sincronizado." />
            <button
              type="button"
              disabled={sync.isPending}
              onClick={() => sync.mutate(undefined, { onSuccess: (results) => setLast({ action: "Sincronização", results }) })}
            >
              Sincronizar tudo
            </button>
          </>
        }
      />
      <div className="projects-page">
        <InstallCard onApplied={(result) => setLast({ action: "Instalação", results: [result] })} />
        {last !== undefined && <LastResult last={last} onDismiss={() => setLast(undefined)} />}
        <QueryState query={projects}>
          {(views) => (
            <ProjectTable
              projects={views}
              removing={uninstall.isPending && uninstall.variables}
              status={<MutationStatus mutation={uninstall} success="Desinstalado." />}
              onUninstall={(dir) =>
                uninstall.mutate(dir, { onSuccess: (result) => setLast({ action: "Desinstalação", results: [result] }) })
              }
            />
          )}
        </QueryState>
      </div>
    </section>
  );
}

function InstallCard({ onApplied }: { onApplied: (result: ProjectApplyResult) => void }) {
  const config = useConfig();
  const install = useInstallProject();
  const profiles = Object.keys(config.data?.profiles ?? {}).sort();
  const [dir, setDir] = useState("");
  const [profile, setProfile] = useState("");
  const [transport, setTransport] = useState<Transport>("stdio");
  const chosenProfile = profile || profiles[0] || "";
  const trimmedDir = dir.trim();
  const absolute = trimmedDir.startsWith("/");

  return (
    <form
      className="panel install-card"
      onSubmit={(event) => {
        event.preventDefault();
        install.mutate({ dir: trimmedDir, profile: chosenProfile, transport }, { onSuccess: onApplied });
      }}
    >
      <div className="install-fields">
        <label className="field install-dir">
          <span className="field-label">Diretório do repositório</span>
          <input
            className="mono"
            placeholder="/caminho/absoluto/do/repo"
            value={dir}
            onChange={(event) => setDir(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Perfil</span>
          <select value={chosenProfile} onChange={(event) => setProfile(event.target.value)}>
            {profiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Transporte</span>
          <div className="segmented" role="radiogroup" aria-label="Transporte">
            {(Object.keys(transportLabels) as Transport[]).map((option) => (
              <label key={option} className="segment" title={transportHints[option]}>
                <input
                  type="radio"
                  name="transport"
                  checked={transport === option}
                  onChange={() => setTransport(option)}
                />
                {transportLabels[option]}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="primary" disabled={!absolute || chosenProfile === "" || install.isPending}>
          Instalar
        </button>
      </div>
      <div className="install-footer">
        <span className="muted small">
          {transportLabels[transport]}: {transportHints[transport]}.
        </span>
        {trimmedDir !== "" && !absolute && <span className="status-line error">Use um caminho absoluto.</span>}
        {config.error !== null && <span className="status-line error">Perfis indisponíveis: {config.error.message}</span>}
        <MutationStatus mutation={install} success="Instalado." />
      </div>
    </form>
  );
}

function LastResult({ last, onDismiss }: { last: LastApply; onDismiss: () => void }) {
  return (
    <section className="panel last-result" aria-live="polite">
      <header className="panel-header">
        <h2 className="panel-title">Último resultado · {last.action}</h2>
        <span className="spacer" />
        <button type="button" className="small ghost" onClick={onDismiss}>
          Fechar
        </button>
      </header>
      {last.results.length === 0 && <p className="empty">Nenhum projeto para sincronizar.</p>}
      {last.results.map((result) => (
        <ApplyResultView key={result.dir} result={result} />
      ))}
    </section>
  );
}

type TableProps = {
  projects: ProjectView[];
  removing: string | false | undefined;
  status: ReactNode;
  onUninstall: (dir: string) => void;
};

function ProjectTable({ projects, removing, status, onUninstall }: TableProps) {
  const sorted = [...projects].sort((a, b) => a.dir.localeCompare(b.dir));
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">Instalados</h2>
        <span className="count count-neutral">{projects.length}</span>
        <span className="spacer" />
        {status}
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>Diretório</th>
            <th>Perfil</th>
            <th>Transporte</th>
            <th>Status</th>
            <th>
              <span className="visually-hidden">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                Nenhum projeto instalado.
              </td>
            </tr>
          )}
          {sorted.map((project) => (
            <ProjectRow
              key={project.dir}
              project={project}
              busy={removing === project.dir}
              onUninstall={() => onUninstall(project.dir)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

type RowProps = { project: ProjectView; busy: boolean; onUninstall: () => void };

function ProjectRow({ project, busy, onUninstall }: RowProps) {
  return (
    <tr>
      <td className="project-dir">
        <span className="project-name">{basename(project.dir)}</span>
        <span className="mono muted small truncate" title={project.dir}>
          {parentDir(project.dir)}
        </span>
      </td>
      <td>
        <a href={hrefFor({ screen: "profiles", profile: project.profile })}>{project.profile}</a>
      </td>
      <td>
        <Badge tone="neutral">{transportLabels[project.transport]}</Badge>
      </td>
      <td>
        {project.exists && <Badge tone="ok">ok</Badge>}
        {!project.exists && <Badge tone="warn">pasta não encontrada</Badge>}
      </td>
      <td className="actions">
        <ConfirmButton label="Desinstalar" question="Desinstalar deste projeto?" disabled={busy} onConfirm={onUninstall} />
      </td>
    </tr>
  );
}
