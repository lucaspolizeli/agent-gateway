import { focusFirstField } from "./focusFirstField.ts";

export function StaleNotice({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div className="stale-notice" role="status">
      <span>{message}</span>
      <button
        type="button"
        className="small"
        onClick={(event) => {
          const form = event.currentTarget.form;
          onReload();
          focusFirstField(form);
        }}
      >
        Recarregar
      </button>
    </div>
  );
}
