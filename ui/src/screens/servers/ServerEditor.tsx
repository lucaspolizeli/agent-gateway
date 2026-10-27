import { useState } from "react";
import type { ConfigEdit, ServerSpec } from "../../contract.ts";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { Badge } from "../../components/Badge.tsx";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
import { FieldHint } from "../../components/FieldHint.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { RenameControl } from "../../components/RenameControl.tsx";
import {
  emptyForms,
  formFromSpec,
  formProblems,
  specFromForm,
  type ServerForm,
  type ServerKind,
} from "../../domain/serverForm.ts";
import { hintFor, serverNameProblem } from "../../domain/validation.ts";
import { hrefFor, navigate } from "../../router.ts";
import { useConfigEdit, useServerTest } from "../../state/config.ts";
import { AdvancedFields, ConnectionFields, VariablesFields } from "./ServerFields.tsx";
import { TestControls, TestResultView } from "./ServerTestPanel.tsx";

type RenameServer = Extract<ConfigEdit, { op: "renameServer" }>;

export type EditorTarget = { kind: "new" } | { kind: "existing"; name: string; spec: ServerSpec };

type Props = {
  target: EditorTarget;
  profiles: string[];
  usedBy: string[];
  existingNames: string[];
  onCreated: (name: string) => void;
};

const kindLabels: Record<ServerKind, string> = { stdio: "stdio · processo local", http: "http · remoto" };
const variablesTitles: Record<ServerKind, string> = { stdio: "Ambiente", http: "Headers" };

function initialForm(target: EditorTarget): ServerForm {
  if (target.kind === "existing") {
    return formFromSpec(target.spec);
  }
  return emptyForms.stdio();
}

export function ServerEditor({ target, profiles, usedBy, existingNames, onCreated }: Props) {
  const [name, setName] = useState("");
  const [form, setForm] = useState(() => initialForm(target));
  const [testProfile, setTestProfile] = useState(usedBy[0] ?? profiles[0] ?? "");
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
  let dirty = true;
  if (target.kind === "existing") {
    dirty = JSON.stringify(spec) !== JSON.stringify(target.spec);
  }

  function submit() {
    if (target.kind === "existing") {
      save.mutate({ op: "upsertServer", name: target.name, spec });
      return;
    }
    save.mutate({ op: "upsertServer", name: newName, spec }, { onSuccess: () => onCreated(newName) });
  }

  function runTest() {
    if (testProfile === "") {
      test.mutate({ spec });
      return;
    }
    test.mutate({ spec, profile: testProfile });
  }

  return (
    <form
      className="detail"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {target.kind === "existing" && <ExistingHeader name={target.name} kind={form.kind} usedBy={usedBy} />}
      {target.kind === "new" && (
        <header className="detail-header">
          <div className="detail-title">
            <h2>Novo servidor</h2>
            <span className="muted small">Preencha a conexão, teste e salve.</span>
          </div>
        </header>
      )}

      <section className="section">
        <h3 className="section-title">Conexão</h3>
        {target.kind === "new" && (
          <label className="field">
            <span className="field-label">Nome</span>
            <input
              className="mono"
              value={name}
              autoFocus
              placeholder="meu-servidor"
              aria-invalid={nameHint !== undefined}
              aria-describedby={nameHint && "server-name-hint"}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldHint id="server-name-hint" message={nameHint} />
          </label>
        )}
        <div className="segmented" role="radiogroup" aria-label="Transporte">
          {(Object.keys(kindLabels) as ServerKind[]).map((kind) => (
            <label key={kind} className="segment">
              <input
                type="radio"
                name="server-kind"
                checked={form.kind === kind}
                onChange={() => setForm(emptyForms[kind]())}
              />
              {kindLabels[kind]}
            </label>
          ))}
        </div>
        <ConnectionFields form={form} onChange={setForm} />
      </section>

      <section className="section">
        <h3 className="section-title">{variablesTitles[form.kind]}</h3>
        <p className="section-hint">
          Use <code>{"${NOME}"}</code> para ler um valor dos segredos do perfil.
        </p>
        <VariablesFields form={form} onChange={setForm} />
      </section>

      {form.kind === "stdio" && (
        <section className="section">
          <h3 className="section-title">Avançado</h3>
          <AdvancedFields form={form} onChange={setForm} />
        </section>
      )}

      {(test.isPending || test.error !== null || test.data !== undefined) && (
        <section className="section test-section" aria-live="polite">
          <h3 className="section-title">Teste de conexão</h3>
          {test.isPending && <span className="status-line pending">Conectando…</span>}
          {test.error !== null && <div className="error-box">{test.error.message}</div>}
          {!test.isPending && test.data !== undefined && <TestResultView result={test.data} />}
        </section>
      )}

      <ActionBar>
        <BarStatus problems={problems} dirty={dirty} isNew={target.kind === "new"} />
        <MutationStatus mutation={save} />
        <span className="spacer" />
        <TestControls
          profiles={profiles}
          profile={testProfile}
          onProfileChange={setTestProfile}
          disabled={specProblems.length > 0 || test.isPending}
          onRun={runTest}
        />
        <span className="action-bar-divider" />
        <button type="submit" className="primary" disabled={problems.length > 0 || !dirty || save.isPending}>
          Salvar
        </button>
      </ActionBar>
    </form>
  );
}

function BarStatus({ problems, dirty, isNew }: { problems: string[]; dirty: boolean; isNew: boolean }) {
  if (problems.length > 0) {
    return <span className="bar-problem">{problems[0]}</span>;
  }
  if (isNew) {
    return <span className="dirty-indicator">novo servidor, ainda não salvo</span>;
  }
  return <DirtyIndicator dirty={dirty} />;
}

type HeaderProps = { name: string; kind: ServerKind; usedBy: string[] };

function ExistingHeader({ name, kind, usedBy }: HeaderProps) {
  const remove = useConfigEdit(() => navigate({ screen: "servers" }));
  const rename = useConfigEdit<RenameServer>((edit) => navigate({ screen: "servers", server: edit.to }));
  return (
    <header className="detail-header">
      <div className="detail-title">
        <h2>
          <span className="mono">{name}</span>
          <Badge tone="neutral">{kind}</Badge>
        </h2>
        <span className="muted small used-by">
          {usedBy.length === 0 && "Nenhum perfil usa este servidor."}
          {usedBy.length > 0 && "Usado por "}
          {usedBy.map((profile, index) => (
            <span key={profile}>
              {index > 0 && ", "}
              <a href={hrefFor({ screen: "profiles", profile })}>{profile}</a>
            </span>
          ))}
        </span>
      </div>
      <MutationStatus mutation={rename} success="Renomeado." />
      <MutationStatus mutation={remove} success="Removido." />
      <RenameControl
        current={name}
        validate={serverNameProblem}
        disabled={rename.isPending}
        onRename={(to) => rename.mutate({ op: "renameServer", from: name, to })}
      />
      <ConfirmButton
        label="Remover"
        question={`Remover ${name} de todos os perfis?`}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate({ op: "removeServer", name })}
      />
    </header>
  );
}
