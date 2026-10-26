import { useState } from "react";
import type { SkillDocument } from "../../contract.ts";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { navigate } from "../../router.ts";
import { useDeleteSkill, useMoveSkill, useSaveSkill, useSkill } from "../../state/skills.ts";

type Props = { set: string; name: string; setNames: string[] };

export function SkillEditor({ set, name, setNames }: Props) {
  const skill = useSkill(set, name);
  return (
    <QueryState query={skill}>
      {(doc) => <LoadedEditor key={`${doc.set}/${doc.name}`} doc={doc} setNames={setNames} />}
    </QueryState>
  );
}

function LoadedEditor({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const [content, setContent] = useState(doc.content);
  const save = useSaveSkill();
  const dirty = content !== doc.content;

  return (
    <div className="editor">
      <header className="editor-header">
        <h2 className="mono">
          <span className="muted">{doc.set}/</span>
          {doc.name}
        </h2>
        <span className="spacer" />
        <MoveControl doc={doc} setNames={setNames} />
        <DeleteControl doc={doc} />
      </header>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ set: doc.set, name: doc.name, content });
        }}
      >
        <label className="field">
          <span>SKILL.md</span>
          <textarea
            className="mono code"
            spellCheck={false}
            rows={28}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <div className="row">
          <button type="submit" className="primary" disabled={!dirty || save.isPending}>
            Salvar
          </button>
          {dirty && (
            <button type="button" onClick={() => setContent(doc.content)}>
              Descartar
            </button>
          )}
          <MutationStatus mutation={save} />
        </div>
      </form>
      <section className="panel">
        <h3>Outros arquivos</h3>
        {doc.files.length === 0 && <p className="muted small">Nenhum.</p>}
        <ul className="file-list">
          {doc.files.map((file) => (
            <li key={file} className="mono">
              {file}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MoveControl({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const targets = setNames.filter((set) => set !== doc.set);
  const [toSet, setToSet] = useState(targets[0] ?? "");
  const move = useMoveSkill((vars) => navigate({ screen: "skills", set: vars.toSet, skill: vars.name }));
  if (targets.length === 0) {
    return null;
  }
  return (
    <span className="row">
      <select value={toSet} onChange={(event) => setToSet(event.target.value)}>
        {targets.map((set) => (
          <option key={set} value={set}>
            {set}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={toSet === "" || move.isPending}
        onClick={() => move.mutate({ set: doc.set, name: doc.name, toSet })}
      >
        Mover
      </button>
      <MutationStatus mutation={move} success="Movida." />
    </span>
  );
}

function DeleteControl({ doc }: { doc: SkillDocument }) {
  const remove = useDeleteSkill((vars) => navigate({ screen: "skills", set: vars.set }));
  return (
    <>
      <ConfirmButton
        label="Excluir"
        question={`Excluir ${doc.set}/${doc.name} e todos os arquivos?`}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate({ set: doc.set, name: doc.name })}
      />
      <MutationStatus mutation={remove} success="Excluída." />
    </>
  );
}
