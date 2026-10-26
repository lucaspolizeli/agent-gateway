import { useState } from "react";

type Props = {
  current: string;
  onRename: (to: string) => void;
  disabled?: boolean;
};

export function RenameControl({ current, onRename, disabled }: Props) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  if (draft === undefined) {
    return (
      <button type="button" disabled={disabled} onClick={() => setDraft(current)}>
        Renomear
      </button>
    );
  }
  const to = draft.trim();
  const valid = to !== "" && to !== current;
  return (
    <span className="confirm">
      <input className="mono" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} />
      <span>
        Renomear <b>{current}</b> para <b>{to}</b>?
      </span>
      <button
        type="button"
        className="primary"
        disabled={!valid}
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
