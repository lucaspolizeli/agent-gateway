import { SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConfigEdit, ServerSpec } from "../../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { ConfirmAction } from "../../components/ConfirmAction.tsx";
import { withFeedback } from "../../components/feedback.ts";
import { RenameControl } from "../../components/RenameControl.tsx";
import { StaleNotice } from "../../components/StaleNotice.tsx";
import {
  emptyForms,
  emptySpec,
  formFromSpec,
  formProblems,
  sameSpec,
  specFromForm,
  type ServerForm,
  type ServerKind,
} from "../../domain/serverForm.ts";
import { hintFor, serverNameProblem } from "../../domain/validation.ts";
import { hrefFor, navigate } from "../../router.ts";
import { useConfigEdit, useServerTest } from "../../state/config.ts";
import { useSyncedDraft } from "../../state/syncedDraft.ts";
import { confirmLeave, useUnsavedGuard } from "../../state/unsaved.ts";
import { AdvancedFields, ConnectionFields, VariablesFields } from "./ServerFields.tsx";
import { TestControls, TestResultView, NO_PROFILE } from "./ServerTestPanel.tsx";

type RenameServer = Extract<ConfigEdit, { op: "renameServer" }>;

export type EditorTarget = { kind: "new" } | { kind: "existing"; name: string; spec: ServerSpec };

type Props = {
  target: EditorTarget;
  profiles: string[];
  usedBy: string[];
  existingNames: string[];
  onCreated: (name: string) => void;
};

const kindLabels: Record<ServerKind, { name: string; hint: string }> = {
  stdio: { name: "stdio", hint: "processo local" },
  http: { name: "http", hint: "remoto" },
};
const kinds: ServerKind[] = ["stdio", "http"];
const variablesTitles: Record<ServerKind, string> = { stdio: "Ambiente", http: "Headers" };

function sourceOf(target: EditorTarget): ServerSpec {
  if (target.kind === "existing") {
    return target.spec;
  }
  return emptySpec;
}

function formOf(target: EditorTarget, source: ServerSpec): ServerForm {
  if (target.kind === "existing") {
    return formFromSpec(source);
  }
  return emptyForms.stdio();
}

function isKind(value: string): value is ServerKind {
  return kinds.some((kind) => kind === value);
}

export function ServerEditor({ target, profiles, usedBy, existingNames, onCreated }: Props) {
  const [name, setName] = useState("");
  const {
    draft: form,
    setDraft: setForm,
    dirty: formDirty,
    stale,
    reload,
  } = useSyncedDraft({
    source: sourceOf(target),
    toDraft: (source: ServerSpec) => formOf(target, source),
    matches: (draft: ServerForm, source: ServerSpec) => sameSpec(specFromForm(draft), source),
    same: sameSpec,
  });
  const [testProfile, setTestProfile] = useState(usedBy[0] ?? profiles[0] ?? NO_PROFILE);
  const save = useConfigEdit();
  const test = useServerTest();

  const spec = specFromForm(form);
  const specProblems = formProblems(form);
  const problems = [...specProblems];
  const newName = name.trim();
  let nameProblem: string | undefined = undefined;
  if (target.kind === "new") {
    nameProblem = serverNameProblem(newName);
  }
  if (target.kind === "new" && nameProblem === undefined && existingNames.includes(newName)) {
    nameProblem = `Já existe um servidor chamado ${newName}.`;
  }
  if (nameProblem !== undefined) {
    problems.unshift(nameProblem);
  }
  const nameHint = hintFor(newName, nameProblem);
  const dirty = formDirty || (target.kind === "new" && newName !== "");
  useUnsavedGuard(dirty);
  const saveable = problems.length === 0 && (target.kind === "new" || formDirty) && !save.isPending;
  const { reset: resetTest } = test;
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    resetTest();
  }, [specKey, resetTest]);

  async function submit() {
    if (target.kind === "existing") {
      await withFeedback(save.mutateAsync({ op: "upsertServer", name: target.name, spec }), "Servidor salvo.");
      return;
    }
    const saved = await withFeedback(save.mutateAsync({ op: "upsertServer", name: newName, spec }), "Servidor criado.");
    if (saved !== undefined) {
      onCreated(newName);
    }
  }

  function runTest() {
    if (testProfile === NO_PROFILE) {
      test.mutate({ spec });
      return;
    }
    test.mutate({ spec, profile: testProfile });
  }

  return (
    <form
      onChange={() => save.reset()}
      onSubmit={(event) => {
        event.preventDefault();
        if (saveable) {
          void submit();
        }
      }}
    >
      <Card className="overflow-visible">
        {target.kind === "existing" && <ExistingHeader name={target.name} kind={form.kind} usedBy={usedBy} />}
        {target.kind === "new" && (
          <CardHeader>
            <CardTitle className="text-lg">Novo servidor</CardTitle>
            <CardDescription>Preencha a conexão, teste e salve.</CardDescription>
          </CardHeader>
        )}
        <CardContent className="flex flex-col gap-6">
          {stale && (
            <StaleNotice message="Este servidor foi salvo em outro lugar enquanto você editava. Recarregar troca suas edições pela versão salva." onReload={reload} />
          )}
          <FieldSet>
            <FieldLegend>Conexão</FieldLegend>
            <FieldGroup>
              {target.kind === "new" && (
                <Field data-invalid={nameHint !== undefined}>
                  <FieldLabel htmlFor="server-name">Nome</FieldLabel>
                  <Input
                    id="server-name"
                    className="font-mono"
                    value={name}
                    autoFocus
                    placeholder="meu-servidor"
                    aria-invalid={nameHint !== undefined}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <FieldError>{nameHint}</FieldError>
                </Field>
              )}
              <Field>
                <FieldLabel id="server-kind-label">Transporte</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  aria-labelledby="server-kind-label"
                  value={form.kind}
                  onValueChange={(value) => {
                    if (isKind(value) && value !== form.kind) {
                      setForm(emptyForms[value]());
                    }
                  }}
                >
                  {kinds.map((kind) => (
                    <ToggleGroupItem key={kind} value={kind} className="px-3">
                      <span className="font-mono">{kindLabels[kind].name}</span>
                      <span className="text-muted-foreground">· {kindLabels[kind].hint}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <ConnectionFields form={form} onChange={setForm} />
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>{variablesTitles[form.kind]}</FieldLegend>
            <FieldDescription>
              Use <code className="font-mono">{"${NOME}"}</code> para ler um valor dos segredos do perfil.
            </FieldDescription>
            <VariablesFields form={form} onChange={setForm} />
          </FieldSet>

          {form.kind === "stdio" && (
            <FieldSet>
              <FieldLegend>Avançado</FieldLegend>
              <AdvancedFields form={form} onChange={setForm} />
            </FieldSet>
          )}

          {(test.isPending || test.error !== null || test.data !== undefined) && (
            <FieldSet aria-live="polite">
              <FieldLegend>Teste de conexão</FieldLegend>
              {test.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  Conectando…
                </p>
              )}
              {test.error !== null && <FieldError>{test.error.message}</FieldError>}
              {!test.isPending && test.data !== undefined && <TestResultView result={test.data} />}
            </FieldSet>
          )}

          {save.error !== null && <FieldError className="whitespace-pre-wrap">{save.error.message}</FieldError>}
        </CardContent>

        <ActionBar status={<BarStatus problems={problems} dirty={dirty} isNew={target.kind === "new"} />}>
          <TestControls
            profiles={profiles}
            profile={testProfile}
            onProfileChange={setTestProfile}
            disabled={specProblems.length > 0 || test.isPending}
            onRun={runTest}
          />
          <Button type="submit" disabled={!saveable}>
            {save.isPending && <Spinner />}
            {!save.isPending && <SaveIcon />}
            Salvar
          </Button>
        </ActionBar>
      </Card>
    </form>
  );
}

function BarStatus({ problems, dirty, isNew }: { problems: string[]; dirty: boolean; isNew: boolean }) {
  if (problems.length > 0) {
    return <span className="text-destructive">{problems[0]}</span>;
  }
  if (isNew) {
    return <span className="text-muted-foreground">Novo servidor, ainda não salvo</span>;
  }
  return <DirtyIndicator dirty={dirty} />;
}

type HeaderProps = { name: string; kind: ServerKind; usedBy: string[] };

function ExistingHeader({ name, kind, usedBy }: HeaderProps) {
  const remove = useConfigEdit(() => void navigate({ screen: "servers" }, { confirmed: true }));
  const rename = useConfigEdit<RenameServer>(
    (edit) => void navigate({ screen: "servers", server: edit.to }, { confirmed: true }),
  );
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <span className="font-mono">{name}</span>
        <Badge variant="outline">{kind}</Badge>
      </CardTitle>
      <CardDescription>
        {usedBy.length === 0 && "Nenhum perfil usa este servidor."}
        {usedBy.length > 0 && "Usado por "}
        {usedBy.map((profile, index) => (
          <span key={profile}>
            {index > 0 && ", "}
            <a className="text-foreground underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile })}>
              {profile}
            </a>
          </span>
        ))}
      </CardDescription>
      <CardAction className="flex flex-wrap gap-2">
        <RenameControl
          current={name}
          validate={serverNameProblem}
          disabled={rename.isPending}
          onRename={async (to) => {
            if (await confirmLeave()) {
              await withFeedback(rename.mutateAsync({ op: "renameServer", from: name, to }), `Renomeado para ${to}.`);
            }
          }}
        />
        <ConfirmAction
          label={
            <>
              <Trash2Icon />
              Remover
            </>
          }
          title={`Remover ${name}?`}
          description="O servidor sai de todos os perfis que o usam, junto com as tools ocultas dele."
          confirmLabel="Remover"
          disabled={remove.isPending}
          onConfirm={async () => {
            if (await confirmLeave()) {
              await withFeedback(remove.mutateAsync({ op: "removeServer", name }), `${name} removido.`);
            }
          }}
        />
      </CardAction>
    </CardHeader>
  );
}
