export function FieldHint({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return (
    <span id={id} className="field-hint">
      {message}
    </span>
  );
}
