type MutationLike = {
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
};

export function MutationStatus({ mutation, success = "Salvo." }: { mutation: MutationLike; success?: string }) {
  if (mutation.isPending) {
    return <span className="status-line pending">Enviando…</span>;
  }
  if (mutation.error !== null) {
    return (
      <span className="status-line error" role="alert">
        {mutation.error.message}
      </span>
    );
  }
  if (mutation.isSuccess) {
    return <span className="status-line ok">{success}</span>;
  }
  return null;
}
