import { useState } from "react";
import type { GatewayConfig, ProfileStatus, ResolvedProfileView } from "../contract.ts";
import { Badge } from "../components/Badge.tsx";
import { FieldHint } from "../components/FieldHint.tsx";
import { Chain } from "../components/Chain.tsx";
import { ConfirmButton } from "../components/ConfirmButton.tsx";
import { CountBadge } from "../components/CountBadge.tsx";
import { ChevronIcon, PlusIcon } from "../components/Icons.tsx";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Popover } from "../components/Popover.tsx";
import { ErrorBox, QueryState } from "../components/QueryState.tsx";
import { RunningBadge } from "../components/RunningBadge.tsx";
import { Tabs, type TabItem } from "../components/Tabs.tsx";
import { plural } from "../domain/format.ts";
import { profileState } from "../domain/health.ts";
import { emptyProfile } from "../domain/profiles.ts";
import { hintFor, profileNameProblem } from "../domain/validation.ts";
import { hrefFor, navigate, type ProfileTab } from "../router.ts";
import { useConfig, useConfigEdit } from "../state/config.ts";
import { useGatewayHealth } from "../state/health.ts";
import { useProfiles } from "../state/profiles.ts";
import { useSkillSets } from "../state/skills.ts";
import { ProfileSpecEditor } from "./profiles/ProfileSpecEditor.tsx";
import { SecretsEditor } from "./profiles/SecretsEditor.tsx";
import { ToolsPanel } from "./profiles/ToolsPanel.tsx";

type Props = { selected?: string; tab?: ProfileTab };

export function ProfilesScreen({ selected, tab }: Props) {
  const config = useConfig();
  const profiles = useProfiles();
  const health = useGatewayHealth();
  return (
    <section>
      <PageHeader
        title="Perfis"
        description="Um perfil por empresa: servidores, skills, tools e segredos, herdados pela cadeia."
        actions={
          <Popover
            title="Novo perfil"
            triggerClassName="primary"
            label={
              <>
                <PlusIcon />
                Novo perfil
              </>
            }
          >
            {(close) => <NewProfileForm existing={Object.keys(config.data?.profiles ?? {})} onDone={close} />}
          </Popover>
        }
      />
      <QueryState query={config}>
        {(data) => (
          <div className="split">
            <ProfileList
              config={data}
              views={profiles.data ?? []}
              statuses={health.statuses}
              selected={selected}
            />
            <DetailPane config={data} selected={selected} tab={tab ?? "composicao"} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function NewProfileForm({ existing, onDone }: { existing: string[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const create = useConfigEdit();
  const trimmed = name.trim();
  let problem = profileNameProblem(trimmed);
  if (problem === undefined && existing.includes(trimmed)) {
    problem = "Já existe um perfil com esse nome.";
  }
  const hint = hintFor(trimmed, problem);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { op: "upsertProfile", name: trimmed, profile: emptyProfile },
          {
            onSuccess: () => {
              onDone();
              navigate({ screen: "profiles", profile: trimmed });
            },
          },
        );
      }}
    >
      <label className="field">
        <span className="field-label">Nome</span>
        <input
          autoFocus
          placeholder="nova-empresa"
          value={name}
          aria-invalid={hint !== undefined}
          aria-describedby={hint && "profile-name-hint"}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <FieldHint id="profile-name-hint" message={hint} />
      <MutationStatus mutation={create} success="Criado." />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={problem !== undefined || create.isPending}>
          Criar perfil
        </button>
      </div>
    </form>
  );
}

type ListProps = {
  config: GatewayConfig;
  views: ResolvedProfileView[];
  statuses: Map<string, ProfileStatus>;
  selected?: string;
};

function ProfileList({ config, views, statuses, selected }: ListProps) {
  const names = Object.keys(config.profiles).sort();
  return (
    <nav className="master" aria-label="Perfis">
      {names.length === 0 && <p className="empty">Nenhum perfil.</p>}
      {names.map((name) => {
        const view = views.find((candidate) => candidate.name === name);
        const missing = view?.missingSecrets.length ?? 0;
        return (
          <a
            key={name}
            className="master-item"
            aria-current={name === selected && "page"}
            href={hrefFor({ screen: "profiles", profile: name })}
          >
            <span className="master-item-title">
              <span className="truncate">{name}</span>
              <span className="spacer" />
              <RunningBadge state={profileState(statuses.get(name))} />
            </span>
            <span className="master-item-meta row">
              <Chain chain={view?.chain ?? [name]} />
              <span className="spacer" />
              {missing > 0 && <Badge tone="warn">{plural(missing, "segredo", "segredos")}</Badge>}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

function DetailPane({ config, selected, tab }: { config: GatewayConfig; selected?: string; tab: ProfileTab }) {
  if (selected === undefined) {
    return <div className="placeholder">Selecione um perfil.</div>;
  }
  const spec = config.profiles[selected];
  if (spec === undefined) {
    return <div className="placeholder">O perfil {selected} não existe.</div>;
  }
  return <ProfileDetail key={selected} name={selected} config={config} tab={tab} />;
}

type DetailProps = { name: string; config: GatewayConfig; tab: ProfileTab };

function ProfileDetail({ name, config, tab }: DetailProps) {
  const profiles = useProfiles();
  const skillSets = useSkillSets();
  const health = useGatewayHealth();
  const remove = useConfigEdit(() => navigate({ screen: "profiles" }));
  const spec = config.profiles[name] ?? emptyProfile;
  const view = profiles.data?.find((candidate) => candidate.name === name);
  const status = health.statuses.get(name);
  const missing = view?.missingSecrets ?? [];
  const chain = view?.chain ?? [name];

  const tabs: TabItem[] = [
    { id: "composicao", label: "Composição", href: hrefFor({ screen: "profiles", profile: name, tab: "composicao" }) },
    {
      id: "tools",
      label: "Tools",
      href: hrefFor({ screen: "profiles", profile: name, tab: "tools" }),
      extra: <CountBadge count={status?.tools.length ?? 0} />,
    },
    {
      id: "segredos",
      label: "Segredos",
      href: hrefFor({ screen: "profiles", profile: name, tab: "segredos" }),
      extra: <CountBadge count={missing.length} tone="warn" label="segredos faltando" />,
    },
  ];

  return (
    <div className="detail">
      <header className="detail-header">
        <div className="detail-title">
          <nav className="breadcrumb" aria-label="Cadeia de herança">
            {chain.map((profile, index) => (
              <span key={profile} className="row">
                {index > 0 && <ChevronIcon />}
                {profile !== name && <a href={hrefFor({ screen: "profiles", profile })}>{profile}</a>}
                {profile === name && <span aria-current="page">{profile}</span>}
              </span>
            ))}
          </nav>
          <h2>
            {name}
            <RunningBadge state={profileState(status)} />
          </h2>
        </div>
        <MutationStatus mutation={remove} success="Removido." />
        <ConfirmButton
          label="Remover perfil"
          question={`Remover o perfil ${name}?`}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate({ op: "removeProfile", name })}
        />
      </header>
      <div className="detail-tabs">
        <Tabs items={tabs} current={tab} label="Seções do perfil" />
      </div>
      {skillSets.error !== null && <ErrorBox message={`Conjuntos de skills: ${skillSets.error.message}`} />}
      {tab === "composicao" && (
        <ProfileSpecEditor
          name={name}
          spec={spec}
          config={config}
          view={view}
          skillSets={(skillSets.data ?? []).map((set) => set.name)}
        />
      )}
      {tab === "tools" && <ToolsPanel profile={name} />}
      {tab === "segredos" && <SecretsEditor profile={name} missing={missing} />}
    </div>
  );
}
