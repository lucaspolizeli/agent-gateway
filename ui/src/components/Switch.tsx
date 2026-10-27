type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onText: string;
  offText: string;
  disabled?: boolean;
};

/** `aria-disabled` instead of `disabled`: a disabled button drops focus, which breaks Space on the next tool. */
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
      aria-disabled={disabled === true}
      onClick={() => {
        if (disabled !== true) {
          onChange(!checked);
        }
      }}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">{text}</span>
    </button>
  );
}
