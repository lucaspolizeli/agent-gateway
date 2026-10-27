export function StaleNotice({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div className="stale-notice" role="status">
      <span>{message}</span>
      <button type="button" className="small" onClick={onReload}>
        Recarregar
      </button>
    </div>
  );
}
