/** A validation hint under a field. The field points at it with `aria-describedby={hintId}` while it shows. */
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
