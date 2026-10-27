import { useState } from "react";

type Options<TSource, TDraft> = {
  /** What the server holds now. */
  source: TSource;
  toDraft: (source: TSource) => TDraft;
  /** Whether a draft would save as nothing new over this source. */
  matches: (draft: TDraft, source: TSource) => boolean;
  /** Whether two server values are the same as far as the form is concerned. */
  same: (a: TSource, b: TSource) => boolean;
};

/**
 * A form draft that follows the server. A clean draft takes over every outside change; a dirty draft is kept
 * and `stale` says the server moved underneath it. A change that is just this draft landing (our own save) is
 * absorbed without a notice.
 */
export function useSyncedDraft<TSource, TDraft>({ source, toDraft, matches, same }: Options<TSource, TDraft>) {
  const [state, setState] = useState(() => ({ baseline: source, draft: toDraft(source) }));
  if (!same(source, state.baseline)) {
    if (matches(state.draft, state.baseline)) {
      setState({ baseline: source, draft: toDraft(source) });
    } else if (matches(state.draft, source)) {
      setState({ baseline: source, draft: state.draft });
    }
  }
  return {
    draft: state.draft,
    setDraft: (draft: TDraft) => setState((previous) => ({ ...previous, draft })),
    dirty: !matches(state.draft, source),
    stale: !same(source, state.baseline),
    /** Drops the draft for the server's version. */
    reload: () => setState({ baseline: source, draft: toDraft(source) }),
  };
}
