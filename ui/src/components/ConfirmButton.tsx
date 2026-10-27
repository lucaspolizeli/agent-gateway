import { useState } from "react";
import { useInlinePrompt } from "./useInlinePrompt.ts";

type Props = {
  label: string;
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
};

/** Inline two-step confirmation instead of `window.confirm`, which blocks the page. */
export function ConfirmButton({ label, question, onConfirm, disabled }: Props) {
  const [asking, setAsking] = useState(false);
  const { trigger, entryRef } = useInlinePrompt(asking);
  return (
    <>
      <span className="visually-hidden" role="status">
        {asking && question}
      </span>
      {!asking && (
        <button ref={trigger} type="button" className="danger" disabled={disabled} onClick={() => setAsking(true)}>
          {label}
        </button>
      )}
      {asking && (
        <span
          className="confirm"
          role="group"
          aria-label={question}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setAsking(false);
            }
          }}
        >
          <span aria-hidden="true">{question}</span>
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
          <button ref={entryRef} type="button" onClick={() => setAsking(false)}>
            Cancelar
          </button>
        </span>
      )}
    </>
  );
}
