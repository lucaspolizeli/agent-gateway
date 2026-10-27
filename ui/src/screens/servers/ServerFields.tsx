import { KeyValueEditor } from "../../components/KeyValueEditor.tsx";
import type { ServerForm, StdioForm } from "../../domain/serverForm.ts";

type Props = { form: ServerForm; onChange: (form: ServerForm) => void };

export function ConnectionFields({ form, onChange }: Props) {
  if (form.kind === "http") {
    return (
      <label className="field">
        <span className="field-label">URL</span>
        <input
          className="mono"
          value={form.url}
          placeholder="https://mcp.example.com/mcp"
          onChange={(event) => onChange({ ...form, url: event.target.value })}
        />
      </label>
    );
  }
  return (
    <>
      <label className="field">
        <span className="field-label">Comando</span>
        <input
          className="mono"
          value={form.command}
          placeholder="npx"
          onChange={(event) => onChange({ ...form, command: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">Argumentos, um por linha</span>
        <textarea
          className="mono"
          rows={Math.max(2, form.args.split("\n").length)}
          value={form.args}
          placeholder={"-y\n@upstash/context7-mcp"}
          onChange={(event) => onChange({ ...form, args: event.target.value })}
        />
      </label>
    </>
  );
}

export function VariablesFields({ form, onChange }: Props) {
  if (form.kind === "http") {
    return (
      <KeyValueEditor
        rows={form.headers}
        keyPlaceholder="Authorization"
        valuePlaceholder="Bearer ${TOKEN}"
        onChange={(headers) => onChange({ ...form, headers })}
      />
    );
  }
  return (
    <KeyValueEditor
      rows={form.env}
      keyPlaceholder="NOME"
      valuePlaceholder="valor ou ${SEGREDO}"
      onChange={(env) => onChange({ ...form, env })}
    />
  );
}

export function AdvancedFields({ form, onChange }: { form: StdioForm; onChange: (form: StdioForm) => void }) {
  return (
    <label className="field">
      <span className="field-label">Diretório de trabalho (opcional)</span>
      <input
        className="mono"
        value={form.cwd}
        placeholder="/caminho/absoluto"
        onChange={(event) => onChange({ ...form, cwd: event.target.value })}
      />
    </label>
  );
}
