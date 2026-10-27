import { useState } from "react";
import { hintFor } from "../domain/validation.ts";
import { FieldHint } from "./FieldHint.tsx";

type Props = {
  current: string;
  onRename: (to: string) => void;
  validate: (to: string) => string | undefined;
  disabled?: boolean;
};

export function RenameControl({ current, onRename, validate, disabled }: Props) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  if (draft === undefined) {
    return (
      <button type="button" disabled={disabled} onClick={() => setDraft(current)}>
        Renomear
      </button>
    );
  }
  const to = draft.trim();
  const formatProblem = validate(to);
  const hint = hintFor(to, formatProblem);
  const unchanged = to === current;
  return (
    <span className="confirm">
      <input
        className="mono"
        value={draft}
        autoFocus
        aria-label="Novo nome"
        aria-invalid={hint !== undefined}
        aria-describedby={hint && "rename-hint"}
        onChange={(event) => setDraft(event.target.value)}
      />
      <FieldHint id="rename-hint" message={hint} />
      <span>
        Renomear <b>{current}</b> para <b>{to}</b>?
      </span>
      <button
        type="button"
        className="primary"
        disabled={formatProblem !== undefined || unchanged}
        onClick={() => {
          setDraft(undefined);
          onRename(to);
        }}
      >
        Confirmar
      </button>
      <button type="button" onClick={() => setDraft(undefined)}>
        Cancelar
      </button>
    </span>
  );
}
