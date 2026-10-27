import { toggled } from "../domain/profiles.ts";

type Props = {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  empty: string;
  mono?: boolean;
};

export function CheckboxGroup({ legend, options, selected, onChange, empty, mono }: Props) {
  let optionClass = "";
  if (mono === true) {
    optionClass = "mono";
  }
  return (
    <fieldset className="checkbox-group">
      <legend>
        {legend}
        <span className="checkbox-count">
          {selected.length}/{options.length}
        </span>
      </legend>
      {options.length === 0 && <span className="muted small">{empty}</span>}
      {options.map((option) => (
        <label key={option} className="check">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(event) => onChange(toggled(selected, option, event.target.checked))}
          />
          <span className={optionClass}>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}
