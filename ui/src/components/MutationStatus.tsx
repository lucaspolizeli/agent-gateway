import { useEffect, useRef, type ReactNode } from "react";

/** How long a plain success stays on screen. Errors and warnings stay until the user edits or retries. */
const SUCCESS_VISIBLE_MS = 5000;

/** Feedback clears when the user edits inside the form (or the nearest marked region) the status sits in. */
const SCOPE = "form, [data-feedback-scope]";

export type Verdict = { tone: "ok" | "warn" | "error"; message: ReactNode };

type MutationLike<TData, TVars> = {
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  data: TData | undefined;
  variables: TVars | undefined;
  reset: () => void;
};

type Props<TData, TVars> = {
  mutation: MutationLike<TData, TVars>;
  success?: ReactNode;
  /** Reads the response when a request that succeeded can still have partly failed. */
  verdict?: (data: TData, variables: TVars | undefined) => Verdict;
};

function settle<TData, TVars>(
  mutation: MutationLike<TData, TVars>,
  success: ReactNode,
  verdict: Props<TData, TVars>["verdict"],
): Verdict | undefined {
  if (mutation.error !== null) {
    return { tone: "error", message: mutation.error.message };
  }
  if (!mutation.isSuccess) {
    return undefined;
  }
  if (verdict !== undefined && mutation.data !== undefined) {
    return verdict(mutation.data, mutation.variables);
  }
  return { tone: "ok", message: success };
}

function isEdit(type: string, target: Element): boolean {
  if (type !== "click") {
    return true;
  }
  const control = target.closest("button");
  return control !== null && control.type !== "submit";
}

/**
 * The one rule for mutation feedback, so no screen has to remember it: a success fades after a few
 * seconds, and any feedback goes away on the next edit or button press in its form.
 */
export function MutationStatus<TData, TVars>({ mutation, success = "Salvo.", verdict }: Props<TData, TVars>) {
  const region = useRef<HTMLSpanElement>(null);
  const settled = settle(mutation, success, verdict);
  const showing = settled !== undefined;
  const fades = settled?.tone === "ok";
  const { reset } = mutation;

  useEffect(() => {
    if (!fades) {
      return;
    }
    const timer = setTimeout(reset, SUCCESS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [fades, reset]);

  useEffect(() => {
    const anchor = region.current;
    if (!showing || anchor === null) {
      return;
    }
    const scope = anchor.closest(SCOPE) ?? anchor.parentElement;
    function onEdit(event: Event) {
      if (event.target instanceof Element && scope?.contains(event.target) && isEdit(event.type, event.target)) {
        reset();
      }
    }
    const events = ["input", "change", "click"];
    for (const name of events) {
      document.addEventListener(name, onEdit, true);
    }
    return () => {
      for (const name of events) {
        document.removeEventListener(name, onEdit, true);
      }
    };
  }, [showing, reset]);

  let line: ReactNode = null;
  if (mutation.isPending) {
    line = <span className="status-line pending">Enviando…</span>;
  }
  if (!mutation.isPending && settled !== undefined) {
    line = <span className={`status-line ${settled.tone}`}>{settled.message}</span>;
  }
  return (
    <span ref={region} className="status-region" role="status" aria-live="polite" aria-atomic="true">
      {line}
    </span>
  );
}
