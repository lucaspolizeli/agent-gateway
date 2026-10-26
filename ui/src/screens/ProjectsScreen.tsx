import { useState } from "react";
import type { ProjectView, Transport } from "../contract.ts";
import { ApplyResultView } from "../components/ApplyResultView.tsx";
import { Badge } from "../components/Badge.tsx";
import { ConfirmButton } from "../components/ConfirmButton.tsx";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { useConfig } from "../state/config.ts";
import { useInstallProject, useProjects, useSyncAll, useUninstallProject } from "../state/projects.ts";

const transportLabels: Record<Transport, string> = {
  stdio: "stdio (um processo por cliente)",
  http: "http (agw serve compartilhado)",
};

export function ProjectsScreen() {
  const projects = useProjects();
  const sync = useSyncAll();
  return (
    <section>
      <header className="screen-header">
        <h1>Projetos</h1>
        <span className="spacer" />
        <button type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>
          Sincronizar tudo
        </button>
      </header>
      <MutationStatus mutation={sync} success="Sincronizado." />
      {sync.data !== undefined && (
        <div className="panel">
          {sync.data.length === 0 && <p className="muted">Nenhum projeto para sincronizar.</p>}
          {sync.data.map((result) => (
            <ApplyResultView key={result.dir} result={result} />
          ))}
        </div>
      )}
      <InstallForm />
      <QueryState query={projects}>{(views) => <ProjectTable projects={views} />}</QueryState>
    </section>
  );
}

function InstallForm() {
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
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        install.mutate({ dir: trimmedDir, profile: chosenProfile, transport });
      }}
    >
      <h3>Instalar em um projeto</h3>
      <div className="row wrap">
        <input
          className="mono grow"
          placeholder="/caminho/absoluto/do/repo"
          value={dir}
          onChange={(event) => setDir(event.target.value)}
        />
        <select value={chosenProfile} onChange={(event) => setProfile(event.target.value)}>
          {profiles.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {(Object.keys(transportLabels) as Transport[]).map((option) => (
          <label key={option} className="inline">
            <input type="radio" name="transport" checked={transport === option} onChange={() => setTransport(option)} />
            {transportLabels[option]}
          </label>
        ))}
        <button type="submit" className="primary" disabled={!absolute || chosenProfile === "" || install.isPending}>
          Instalar
        </button>
      </div>
      {trimmedDir !== "" && !absolute && <div className="warn-line">Use um caminho absoluto.</div>}
      {config.error !== null && <div className="warn-line">Perfis indisponíveis: {config.error.message}</div>}
      <MutationStatus mutation={install} success="Instalado." />
      {install.data !== undefined && <ApplyResultView result={install.data} />}
    </form>
  );
}

function ProjectTable({ projects }: { projects: ProjectView[] }) {
  const sorted = [...projects].sort((a, b) => a.dir.localeCompare(b.dir));
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Diretório</th>
          <th>Perfil</th>
          <th>Transporte</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="muted">
              Nenhum projeto instalado.
            </td>
          </tr>
        )}
        {sorted.map((project) => (
          <ProjectRow key={project.dir} project={project} />
        ))}
      </tbody>
    </table>
  );
}

function ProjectRow({ project }: { project: ProjectView }) {
  const uninstall = useUninstallProject();
  return (
    <tr>
      <td>
        <span className="mono">{project.dir}</span> {!project.exists && <Badge tone="warn">pasta não encontrada</Badge>}
        {uninstall.data !== undefined && <ApplyResultView result={uninstall.data} />}
      </td>
      <td className="mono">{project.profile}</td>
      <td>{project.transport}</td>
      <td className="actions">
        <ConfirmButton
          label="Desinstalar"
          question="Desinstalar deste projeto?"
          disabled={uninstall.isPending}
          onConfirm={() => uninstall.mutate(project.dir)}
        />
        <MutationStatus mutation={uninstall} success="Desinstalado." />
      </td>
    </tr>
  );
}
