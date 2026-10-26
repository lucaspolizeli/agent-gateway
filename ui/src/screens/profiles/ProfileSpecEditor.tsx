import { useState } from "react";
import type { GatewayConfig, ProfileSpec } from "../../contract.ts";
import { CheckboxGroup } from "../../components/CheckboxGroup.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { descendantsOf, sameProfileSpec } from "../../domain/profiles.ts";
import { useConfigEdit } from "../../state/config.ts";

type Props = { name: string; spec: ProfileSpec; config: GatewayConfig; skillSets: string[] };

export function ProfileSpecEditor({ name, spec, config, skillSets }: Props) {
  const [draft, setDraft] = useState(spec);
  const save = useConfigEdit();
  const descendants = descendantsOf(name, config.profiles);
  const parentOptions = Object.keys(config.profiles)
    .filter((profile) => profile !== name && !descendants.has(profile))
    .sort();
  const skillOptions = [...new Set([...skillSets, ...draft.skills])].sort();
  const dirty = !sameProfileSpec(draft, spec);

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ op: "upsertProfile", name, profile: { ...draft, hiddenTools: spec.hiddenTools } });
      }}
    >
      <div className="columns">
        <CheckboxGroup
          legend="Estende"
          options={parentOptions}
          selected={draft.extends}
          empty="Nenhum outro perfil."
          onChange={(extendsList) => setDraft({ ...draft, extends: extendsList })}
        />
        <CheckboxGroup
          legend="Servidores"
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
      <div className="row">
        <button type="submit" className="primary" disabled={!dirty || save.isPending}>
          Salvar perfil
        </button>
        {dirty && (
          <button type="button" onClick={() => setDraft(spec)}>
            Descartar
          </button>
        )}
        <MutationStatus mutation={save} />
      </div>
    </form>
  );
}
