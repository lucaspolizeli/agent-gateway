import { newRow, type KeyValueRow } from "../domain/keyValueRows.ts";
import { PlusIcon } from "./Icons.tsx";

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
  return (
    <div className="kv">
      {rows.map((row) => (
        <div className="kv-row" key={row.id}>
          <input
            className="mono"
            value={row.key}
            aria-label="Chave"
            placeholder={keyPlaceholder}
            onChange={(event) => update(row.id, { key: event.target.value })}
          />
          <input
            className="mono"
            value={row.value}
            aria-label={`Valor de ${row.key}`}
            placeholder={valuePlaceholder}
            onChange={(event) => update(row.id, { value: event.target.value })}
          />
          <button
            type="button"
            className="icon ghost"
            title="Remover linha"
            aria-label="Remover linha"
            onClick={() => onChange(rows.filter((other) => other.id !== row.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="small ghost add-row" onClick={() => onChange([...rows, newRow()])}>
        <PlusIcon />
        Adicionar linha
      </button>
    </div>
  );
}
