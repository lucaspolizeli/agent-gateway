import { useState } from "react";
import type { ConfigEdit, ServerSpec } from "../../contract.ts";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
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
import { navigate } from "../../router.ts";
import { useConfigEdit } from "../../state/config.ts";
import { HttpFields, StdioFields } from "./ServerFields.tsx";
import { ServerTestPanel } from "./ServerTestPanel.tsx";

type RenameServer = Extract<ConfigEdit, { op: "renameServer" }>;

export type EditorTarget = { kind: "new" } | { kind: "existing"; name: string; spec: ServerSpec };

type Props = {
  target: EditorTarget;
  profiles: string[];
  usedBy: string[];
  existingNames: string[];
  onCreated: (name: string) => void;
};

const kindLabels: Record<ServerKind, string> = { stdio: "stdio (processo local)", http: "http (remoto)" };

function initialForm(target: EditorTarget): ServerForm {
  if (target.kind === "existing") {
    return formFromSpec(target.spec);
  }
  return emptyForms.stdio();
}

export function ServerEditor({ target, profiles, usedBy, existingNames, onCreated }: Props) {
  const [name, setName] = useState("");
  const [form, setForm] = useState(() => initialForm(target));
  const save = useConfigEdit();
  const remove = useConfigEdit(() => navigate({ screen: "servers" }));
  const rename = useConfigEdit<RenameServer>((edit) => navigate({ screen: "servers", server: edit.to }));

  const spec = specFromForm(form);
  const problems = formProblems(form);
  const newName = name.trim();
  if (target.kind === "new" && newName === "") {
    problems.push("Informe o nome.");
  }
  if (target.kind === "new" && existingNames.includes(newName)) {
    problems.push(`Já existe um servidor chamado ${newName}.`);
  }
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

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="editor-header">
        {target.kind === "new" && (
          <label className="field grow">
            <span>Nome</span>
            <input
              className="mono"
              value={name}
              autoFocus
              placeholder="meu-servidor"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        {target.kind === "existing" && (
          <>
            <h2 className="mono">{target.name}</h2>
            <span className="spacer" />
            <RenameControl
              current={target.name}
              disabled={rename.isPending}
              onRename={(to) => rename.mutate({ op: "renameServer", from: target.name, to })}
            />
            <ConfirmButton
              label="Remover"
              question={`Remover ${target.name} de todos os perfis?`}
              disabled={remove.isPending}
              onConfirm={() => remove.mutate({ op: "removeServer", name: target.name })}
            />
          </>
        )}
      </header>
      <MutationStatus mutation={rename} success="Renomeado." />
      <MutationStatus mutation={remove} success="Removido." />
      {target.kind === "existing" && (
        <div className="muted small">
          Usado por: {usedBy.join(", ")}
          {usedBy.length === 0 && "nenhum perfil"}
        </div>
      )}

      <div className="segmented" role="radiogroup" aria-label="Tipo">
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

      {form.kind === "stdio" && <StdioFields form={form} onChange={setForm} />}
      {form.kind === "http" && <HttpFields form={form} onChange={setForm} />}

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="row">
        <button type="submit" className="primary" disabled={problems.length > 0 || !dirty || save.isPending}>
          Salvar
        </button>
        <MutationStatus mutation={save} />
      </div>

      <ServerTestPanel spec={spec} profiles={profiles} disabled={formProblems(form).length > 0} />
    </form>
  );
}
