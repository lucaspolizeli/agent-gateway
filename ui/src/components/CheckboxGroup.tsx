import { toggled } from "../domain/profiles.ts";

type Props = {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  empty: string;
};

export function CheckboxGroup({ legend, options, selected, onChange, empty }: Props) {
  return (
    <fieldset className="checkbox-group">
      <legend>{legend}</legend>
      {options.length === 0 && <span className="muted small">{empty}</span>}
      {options.map((option) => (
        <label key={option} className="check">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(event) => onChange(toggled(selected, option, event.target.checked))}
          />
          <span className="mono">{option}</span>
        </label>
      ))}
    </fieldset>
  );
}
