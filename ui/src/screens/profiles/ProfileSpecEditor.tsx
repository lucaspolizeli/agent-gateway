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
          "Profile saved.",
        );
      }}
    >
      {stale && <StaleNotice message="This profile was saved somewhere else while you were editing. Reload replaces your edits with the saved version." onReload={reload} />}
      <FieldSet>
        <FieldLegend>Inheritance and resources</FieldLegend>
        <FieldDescription>What this profile inherits and adds. Items from parent profiles are included automatically.</FieldDescription>
        <div className="grid gap-3 md:grid-cols-3">
          <CheckboxGroup
            legend="Extends"
            options={parentOptions}
            selected={draft.extends}
            empty="No other profiles."
            onChange={(extendsList) => edit({ ...draft, extends: extendsList })}
          />
          <CheckboxGroup
            legend="Servers"
            mono
            options={Object.keys(config.servers).sort()}
            selected={draft.servers}
            empty="No servers yet."
            onChange={(servers) => edit({ ...draft, servers })}
          />
          <CheckboxGroup
            legend="Skill sets"
            options={skillOptions}
            selected={draft.skills}
            empty="No skill sets yet."
            onChange={(skills) => edit({ ...draft, skills })}
          />
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Resolved chain</FieldLegend>
        <FieldDescription>What is saved now, with inheritance resolved.</FieldDescription>
        {view === undefined && <p className="text-sm text-muted-foreground">Resolved view unavailable.</p>}
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
            Discard
          </Button>
        )}
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending && <Spinner />}
          {!save.isPending && <SaveIcon />}
          Save profile
        </Button>
      </ActionBar>
    </form>
  );
}
