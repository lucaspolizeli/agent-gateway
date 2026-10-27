import { PlusIcon, XIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newRow, type KeyValueRow } from "../domain/keyValueRows.ts";

type Props = {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
};

export function KeyValueEditor({ rows, onChange, keyPlaceholder, valuePlaceholder }: Props) {
  function update(id: number, patch: Partial<KeyValueRow>) {
    onChange(
      rows.map((row) => {
        if (row.id !== id) {
          return row;
        }
        return { ...row, ...patch };
      }),
    );
  }
  function remove(event: MouseEvent<HTMLButtonElement>, id: number) {
    const row = event.currentTarget.closest("[data-kv-row]");
    const next = row?.nextElementSibling ?? row?.previousElementSibling;
    onChange(rows.filter((other) => other.id !== id));
    if (next instanceof HTMLElement) {
      (next.querySelector("input") ?? next).focus();
    }
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} data-kv-row className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
          <Input
            className="font-mono"
            value={row.key}
            aria-label="Key"
            placeholder={keyPlaceholder}
            onChange={(event) => update(row.id, { key: event.target.value })}
          />
          <Input
            className="font-mono"
            value={row.value}
            aria-label={`Value of ${row.key}`}
            placeholder={valuePlaceholder}
            onChange={(event) => update(row.id, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Remove row"
            aria-label="Remove row"
            onClick={(event) => remove(event, row.id)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newRow()])}>
        <PlusIcon />
        Add row
      </Button>
    </div>
  );
}
