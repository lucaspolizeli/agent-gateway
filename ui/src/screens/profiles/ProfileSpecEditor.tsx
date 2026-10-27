import type { GatewayConfig, ProfileSpec, ResolvedProfileView } from "../../contract.ts";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { CheckboxGroup } from "../../components/CheckboxGroup.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { StaleNotice } from "../../components/StaleNotice.tsx";
import { descendantsOf, sameProfileSpec } from "../../domain/profiles.ts";
import { useConfigEdit } from "../../state/config.ts";
import { useSyncedDraft } from "../../state/syncedDraft.ts";
import { useUnsavedGuard } from "../../state/unsaved.ts";
import { ResolvedPanel } from "./ResolvedPanel.tsx";

type Props = {
  name: string;
  spec: ProfileSpec;
  config: GatewayConfig;
  view?: ResolvedProfileView;
  skillSets: string[];
};

export function ProfileSpecEditor({ name, spec, config, view, skillSets }: Props) {
  const { draft, setDraft, dirty, stale, reload } = useSyncedDraft({
    source: spec,
    toDraft: (source: ProfileSpec) => source,
    matches: sameProfileSpec,
    same: sameProfileSpec,
  });
  useUnsavedGuard(dirty);
  const save = useConfigEdit();
  const descendants = descendantsOf(name, config.profiles);
  const parentOptions = Object.keys(config.profiles)
    .filter((profile) => profile !== name && !descendants.has(profile))
    .sort();
  const skillOptions = [...new Set([...skillSets, ...draft.skills])].sort();

  return (
    <form
      className="tab-body"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ op: "upsertProfile", name, profile: { ...draft, hiddenTools: spec.hiddenTools } });
      }}
    >
      {stale && <StaleNotice message="O perfil mudou fora daqui. Recarregar?" onReload={reload} />}
      <section className="section">
        <h3 className="section-title">Herança e recursos</h3>
        <p className="section-hint">O que este perfil herda e acrescenta. Os itens dos perfis pais entram sozinhos.</p>
        <div className="checkbox-columns">
          <CheckboxGroup
            legend="Estende"
            options={parentOptions}
            selected={draft.extends}
            empty="Nenhum outro perfil."
            onChange={(extendsList) => setDraft({ ...draft, extends: extendsList })}
          />
          <CheckboxGroup
            legend="Servidores"
            mono
            options={Object.keys(config.servers).sort()}
            selected={draft.servers}
            empty="Nenhum servidor cadastrado."
            onChange={(servers) => setDraft({ ...draft, servers })}
          />
          <CheckboxGroup
            legend="Conjuntos de skills"
            options={skillOptions}
            selected={draft.skills}
            empty="Nenhum conjunto."
            onChange={(skills) => setDraft({ ...draft, skills })}
          />
        </div>
      </section>
      <section className="section">
        <h3 className="section-title">Resultado da cadeia</h3>
        <p className="section-hint">O que fica salvo hoje, já com a herança resolvida.</p>
        {view === undefined && <p className="muted">Visão resolvida indisponível.</p>}
        {view !== undefined && <ResolvedPanel view={view} />}
      </section>
      <ActionBar>
        <DirtyIndicator dirty={dirty} />
        <MutationStatus mutation={save} />
        <span className="spacer" />
        {dirty && (
          <button type="button" onClick={reload}>
            Descartar
          </button>
        )}
        <button type="submit" className="primary" disabled={!dirty || save.isPending}>
          Salvar perfil
        </button>
      </ActionBar>
    </form>
  );
}
