import { KeyValueEditor } from "../../components/KeyValueEditor.tsx";
import type { HttpForm, StdioForm } from "../../domain/serverForm.ts";

export function StdioFields({ form, onChange }: { form: StdioForm; onChange: (form: StdioForm) => void }) {
  return (
    <>
      <label className="field">
        <span>Comando</span>
        <input
          className="mono"
          value={form.command}
          placeholder="npx"
          onChange={(event) => onChange({ ...form, command: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Argumentos (um por linha)</span>
        <textarea
          className="mono"
          rows={Math.max(3, form.args.split("\n").length + 1)}
          value={form.args}
          placeholder={"-y\n@upstash/context7-mcp"}
          onChange={(event) => onChange({ ...form, args: event.target.value })}
        />
      </label>
      <div className="field">
        <span>Variáveis de ambiente</span>
        <KeyValueEditor
          rows={form.env}
          keyPlaceholder="NOME"
          valuePlaceholder="valor ou ${SEGREDO}"
          onChange={(env) => onChange({ ...form, env })}
        />
      </div>
      <label className="field">
        <span>Diretório de trabalho (opcional)</span>
        <input
          className="mono"
          value={form.cwd}
          placeholder="/caminho/absoluto"
          onChange={(event) => onChange({ ...form, cwd: event.target.value })}
        />
      </label>
    </>
  );
}

export function HttpFields({ form, onChange }: { form: HttpForm; onChange: (form: HttpForm) => void }) {
  return (
    <>
      <label className="field">
        <span>URL</span>
        <input
          className="mono"
          value={form.url}
          placeholder="https://mcp.example.com/mcp"
          onChange={(event) => onChange({ ...form, url: event.target.value })}
        />
      </label>
      <div className="field">
        <span>Headers</span>
        <KeyValueEditor
          rows={form.headers}
          keyPlaceholder="Authorization"
          valuePlaceholder="Bearer ${TOKEN}"
          onChange={(headers) => onChange({ ...form, headers })}
        />
      </div>
    </>
  );
}
