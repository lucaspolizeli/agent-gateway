import { CircleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

type QueryLike<T> = {
  data: T | undefined;
  error: Error | null;
  isPending: boolean;
};

type Props<T> = { query: QueryLike<T>; children: (data: T) => ReactNode; loading?: ReactNode };

/** Renders loading and error states so screens only deal with data. */
export function QueryState<T>({ query, children, loading }: Props<T>) {
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
  if (loading !== undefined) {
    return loading;
  }
  return <LoadingRows />;
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, title = "Não foi possível carregar" }: { message: string; title?: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap">{message}</AlertDescription>
    </Alert>
  );
}
