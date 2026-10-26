import type { ReactNode } from "react";

type QueryLike<T> = {
  data: T | undefined;
  error: Error | null;
  isPending: boolean;
};

/** Renders loading and error states so screens only deal with data. */
export function QueryState<T>({ query, children }: { query: QueryLike<T>; children: (data: T) => ReactNode }) {
  if (query.data !== undefined) {
    return (
      <>
        {query.error !== null && <ErrorBox message={query.error.message} />}
        {children(query.data)}
      </>
    );
  }
  if (query.error !== null) {
    return <ErrorBox message={query.error.message} />;
  }
  return <p className="muted">Carregando…</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      {message}
    </div>
  );
}
