import { useState } from "react";

type Props = {
  label: string;
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
};

/** Inline two-step confirmation instead of `window.confirm`, which blocks the page. */
export function ConfirmButton({ label, question, onConfirm, disabled }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="danger" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <span>{question}</span>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Sim
      </button>
      <button type="button" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}
