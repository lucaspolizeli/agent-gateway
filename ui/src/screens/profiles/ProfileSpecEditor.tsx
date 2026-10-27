import { SaveIcon, Undo2Icon } from "lucide-react";
import type { GatewayConfig, ProfileSpec, ResolvedProfileView } from "../../contract.ts";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { CheckboxGroup } from "../../components/CheckboxGroup.tsx";
import { withFeedback } from "../../components/feedback.ts";
import { focusFirstField } from "../../components/focusFirstField.ts";
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
  function edit(next: ProfileSpec) {
    save.reset();
    setDraft(next);
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void withFeedback(
          save.mutateAsync({ op: "upsertProfile", name, profile: { ...draft, hiddenTools: spec.hiddenTools } }),
          "Perfil salvo.",
        );
      }}
    >
      {stale && <StaleNotice message="Este perfil foi salvo em outro lugar enquanto você editava. Recarregar troca suas edições pela versão salva." onReload={reload} />}
      <FieldSet>
        <FieldLegend>Herança e recursos</FieldLegend>
        <FieldDescription>O que este perfil herda e acrescenta. Os itens dos perfis pais entram sozinhos.</FieldDescription>
        <div className="grid gap-3 md:grid-cols-3">
          <CheckboxGroup
            legend="Estende"
            options={parentOptions}
            selected={draft.extends}
            empty="Nenhum outro perfil."
            onChange={(extendsList) => edit({ ...draft, extends: extendsList })}
          />
          <CheckboxGroup
            legend="Servidores"
            mono
            options={Object.keys(config.servers).sort()}
            selected={draft.servers}
            empty="Nenhum servidor cadastrado."
            onChange={(servers) => edit({ ...draft, servers })}
          />
          <CheckboxGroup
            legend="Conjuntos de skills"
            options={skillOptions}
            selected={draft.skills}
            empty="Nenhum conjunto."
            onChange={(skills) => edit({ ...draft, skills })}
          />
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Resultado da cadeia</FieldLegend>
        <FieldDescription>O que fica salvo hoje, já com a herança resolvida.</FieldDescription>
        {view === undefined && <p className="text-sm text-muted-foreground">Visão resolvida indisponível.</p>}
        {view !== undefined && <ResolvedPanel view={view} />}
      </FieldSet>
      {save.error !== null && <FieldError className="whitespace-pre-wrap">{save.error.message}</FieldError>}
      <ActionBar status={<DirtyIndicator dirty={dirty} />}>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => {
              const form = event.currentTarget.form;
              reload();
              save.reset();
              focusFirstField(form);
            }}
          >
            <Undo2Icon />
            Descartar
          </Button>
        )}
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending && <Spinner />}
          {!save.isPending && <SaveIcon />}
          Salvar perfil
        </Button>
      </ActionBar>
    </form>
  );
}
