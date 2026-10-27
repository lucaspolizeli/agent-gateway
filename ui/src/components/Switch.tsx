type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onText: string;
  offText: string;
  disabled?: boolean;
};

export function Switch({ checked, onChange, label, onText, offText, disabled }: Props) {
  let text = offText;
  if (checked) {
    text = onText;
  }
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">{text}</span>
    </button>
  );
}
