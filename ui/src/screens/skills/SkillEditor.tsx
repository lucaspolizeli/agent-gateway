import { useState, type KeyboardEvent } from "react";
import type { SkillDocument } from "../../contract.ts";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
import { ChevronIcon } from "../../components/Icons.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { StaleNotice } from "../../components/StaleNotice.tsx";
import { hrefFor, navigate } from "../../router.ts";
import { useDeleteSkill, useMoveSkill, useSaveSkill, useSkill } from "../../state/skills.ts";
import { useSyncedDraft } from "../../state/syncedDraft.ts";
import { confirmLeave, useUnsavedGuard } from "../../state/unsaved.ts";

type Props = { set: string; name: string; setNames: string[] };

export function SkillEditor({ set, name, setNames }: Props) {
  const skill = useSkill(set, name);
  return (
    <QueryState query={skill}>
      {(doc) => <LoadedEditor key={`${doc.set}/${doc.name}`} doc={doc} setNames={setNames} />}
    </QueryState>
  );
}

const isMac = navigator.platform.toLowerCase().includes("mac");
let saveShortcut = "Ctrl+S";
if (isMac) {
  saveShortcut = "⌘S";
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s";
}

function LoadedEditor({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const {
    draft: content,
    setDraft: setContent,
    dirty,
    stale,
    reload,
  } = useSyncedDraft({
    source: doc.content,
    toDraft: (source: string) => source,
    matches: (draft: string, source: string) => draft === source,
    same: (a: string, b: string) => a === b,
  });
  useUnsavedGuard(dirty);
  const save = useSaveSkill();

  function submit() {
    if (dirty && !save.isPending) {
      save.mutate({ set: doc.set, name: doc.name, content });
    }
  }

  return (
    <form
      className="detail skill-editor"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <header className="detail-header editor-toolbar">
        <div className="detail-title">
          <nav className="breadcrumb" aria-label="Local da skill">
            <a href={hrefFor({ screen: "skills", set: doc.set })}>{doc.set}</a>
            <ChevronIcon />
            <span aria-current="page">SKILL.md</span>
          </nav>
          <h2>{doc.name}</h2>
        </div>
        <MoveControl doc={doc} setNames={setNames} />
        <DeleteControl doc={doc} />
      </header>
      {stale && <StaleNotice message="A skill mudou fora daqui. Recarregar?" onReload={reload} />}
      <textarea
        className="mono skill-textarea"
        aria-label={`Conteúdo de ${doc.name}/SKILL.md`}
        spellCheck={false}
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <ActionBar
        className="editor-footer"
        messages={
          <>
            <DirtyIndicator dirty={dirty} />
            <MutationStatus mutation={save} />
            <span className="muted small files-line">
              {doc.files.length === 0 && "Sem outros arquivos"}
              {doc.files.length > 0 && (
                <>
                  Outros arquivos: <span className="mono">{doc.files.join(", ")}</span>
                </>
              )}
            </span>
          </>
        }
      >
        {dirty && (
          <button type="button" onClick={reload}>
            Descartar
          </button>
        )}
        <button type="submit" className="primary" disabled={!dirty || save.isPending}>
          Salvar
          <kbd className="kbd">{saveShortcut}</kbd>
        </button>
      </ActionBar>
    </form>
  );
}

function MoveControl({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const targets = setNames.filter((set) => set !== doc.set);
  const [toSet, setToSet] = useState(targets[0] ?? "");
  const move = useMoveSkill((vars) => navigate({ screen: "skills", set: vars.toSet, skill: vars.name }, { confirmed: true }));
  if (targets.length === 0) {
    return null;
  }
  return (
    <span className="row">
      <MutationStatus mutation={move} success="Movida." />
      <span className="muted small">Mover para</span>
      <select value={toSet} aria-label="Mover para o conjunto" onChange={(event) => setToSet(event.target.value)}>
        {targets.map((set) => (
          <option key={set} value={set}>
            {set}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={toSet === "" || move.isPending}
        onClick={() => {
          if (confirmLeave()) {
            move.mutate({ set: doc.set, name: doc.name, toSet });
          }
        }}
      >
        Mover
      </button>
    </span>
  );
}

function DeleteControl({ doc }: { doc: SkillDocument }) {
  const remove = useDeleteSkill((vars) => navigate({ screen: "skills", set: vars.set }, { confirmed: true }));
  return (
    <>
      <ConfirmButton
        label="Excluir"
        question={`Excluir ${doc.name} e todos os arquivos?`}
        disabled={remove.isPending}
        onConfirm={() => {
          if (confirmLeave()) {
            remove.mutate({ set: doc.set, name: doc.name });
          }
        }}
      />
      <MutationStatus mutation={remove} success="Excluída." />
    </>
  );
}
