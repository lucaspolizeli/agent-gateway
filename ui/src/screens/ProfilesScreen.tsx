import { useState } from "react";
import type { GatewayConfig, ResolvedProfileView } from "../contract.ts";
import { ConfirmButton } from "../components/ConfirmButton.tsx";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { ErrorBox, QueryState } from "../components/QueryState.tsx";
import { emptyProfile } from "../domain/profiles.ts";
import { hrefFor, navigate } from "../router.ts";
import { useConfig, useConfigEdit } from "../state/config.ts";
import { useProfiles } from "../state/profiles.ts";
import { useSkillSets } from "../state/skills.ts";
import { ProfileSpecEditor } from "./profiles/ProfileSpecEditor.tsx";
import { ResolvedPanel } from "./profiles/ResolvedPanel.tsx";
import { SecretsEditor } from "./profiles/SecretsEditor.tsx";
import { ToolsPanel } from "./profiles/ToolsPanel.tsx";

export function ProfilesScreen({ selected }: { selected?: string }) {
  const config = useConfig();
  return (
    <section>
      <header className="screen-header">
        <h1>Perfis</h1>
      </header>
      <QueryState query={config}>
        {(data) => (
          <div className="split">
            <div>
              <NewProfileForm existing={Object.keys(data.profiles)} />
              <ProfileList config={data} selected={selected} />
            </div>
            <DetailPane config={data} selected={selected} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function NewProfileForm({ existing }: { existing: string[] }) {
  const [name, setName] = useState("");
  const create = useConfigEdit();
  const trimmed = name.trim();
  const taken = existing.includes(trimmed);
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { op: "upsertProfile", name: trimmed, profile: emptyProfile },
          {
            onSuccess: () => {
              setName("");
              navigate({ screen: "profiles", profile: trimmed });
            },
          },
        );
      }}
    >
      <input
        className="mono"
        placeholder="novo-perfil"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={trimmed === "" || taken || create.isPending}>
        Criar perfil
      </button>
      {taken && <span className="muted small">Já existe.</span>}
      <MutationStatus mutation={create} success="Criado." />
    </form>
  );
}

function ProfileList({ config, selected }: { config: GatewayConfig; selected?: string }) {
  const names = Object.keys(config.profiles).sort();
  return (
    <nav className="list">
      {names.length === 0 && <p className="muted">Nenhum perfil.</p>}
      {names.map((name) => (
        <a
          key={name}
          className="list-item"
          aria-current={name === selected}
          href={hrefFor({ screen: "profiles", profile: name })}
        >
          <span className="mono">{name}</span>
          {(config.profiles[name]?.extends.length ?? 0) > 0 && (
            <div className="muted small">estende {config.profiles[name]?.extends.join(", ")}</div>
          )}
        </a>
      ))}
    </nav>
  );
}

function DetailPane({ config, selected }: { config: GatewayConfig; selected?: string }) {
  if (selected === undefined) {
    return <div className="placeholder muted">Selecione um perfil.</div>;
  }
  const spec = config.profiles[selected];
  if (spec === undefined) {
    return <div className="placeholder muted">Perfil {selected} não existe.</div>;
  }
  return <ProfileDetail key={selected} name={selected} config={config} />;
}

function ProfileDetail({ name, config }: { name: string; config: GatewayConfig }) {
  const profiles = useProfiles();
  const skillSets = useSkillSets();
  const remove = useConfigEdit(() => navigate({ screen: "profiles" }));
  const spec = config.profiles[name] ?? emptyProfile;
  const view = profiles.data?.find((candidate) => candidate.name === name);

  return (
    <div className="detail">
      <header className="editor-header">
        <h2 className="mono">{name}</h2>
        <span className="spacer" />
        <ConfirmButton
          label="Remover perfil"
          question={`Remover o perfil ${name}?`}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate({ op: "removeProfile", name })}
        />
      </header>
      <MutationStatus mutation={remove} success="Removido." />
      {skillSets.error !== null && <ErrorBox message={`Conjuntos de skills: ${skillSets.error.message}`} />}
      <ProfileSpecEditor
        name={name}
        spec={spec}
        config={config}
        skillSets={(skillSets.data ?? []).map((set) => set.name)}
      />
      <ResolvedSection query={profiles} view={view} />
      <ToolsPanel profile={name} />
      <SecretsEditor profile={name} missing={view?.missingSecrets ?? []} />
    </div>
  );
}

type ResolvedSectionProps = {
  query: { data: ResolvedProfileView[] | undefined; error: Error | null; isPending: boolean };
  view?: ResolvedProfileView;
};

function ResolvedSection({ query, view }: ResolvedSectionProps) {
  return (
    <QueryState query={query}>
      {() => {
        if (view === undefined) {
          return <p className="muted">Visão resolvida indisponível.</p>;
        }
        return <ResolvedPanel view={view} />;
      }}
    </QueryState>
  );
}
