import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { cn } from "@/lib/utils";
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
  const id = useId();
  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend variant="label" className="mb-0 flex w-full items-center justify-between">
        {legend}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {selected.length}/{options.length}
        </span>
      </FieldLegend>
      {options.length === 0 && <FieldDescription>{empty}</FieldDescription>}
      {options.length > 0 && (
        <FieldGroup className="gap-2">
          {options.map((option) => (
            <Field key={option} orientation="horizontal" className="gap-2">
              <Checkbox
                id={`${id}-${option}`}
                checked={selected.includes(option)}
                onCheckedChange={(checked) => onChange(toggled(selected, option, checked === true))}
              />
              <FieldLabel htmlFor={`${id}-${option}`} className={cn("font-normal", mono === true && "font-mono text-xs")}>
                {option}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      )}
    </FieldSet>
  );
}
