import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KeyValueEditor } from "../../components/KeyValueEditor.tsx";
import type { ServerForm, StdioForm } from "../../domain/serverForm.ts";

type Props = { form: ServerForm; onChange: (form: ServerForm) => void };

export function ConnectionFields({ form, onChange }: Props) {
  if (form.kind === "http") {
    return (
      <Field>
        <FieldLabel htmlFor="server-url">URL</FieldLabel>
        <Input
          id="server-url"
          className="font-mono"
          value={form.url}
          placeholder="https://mcp.example.com/mcp"
          onChange={(event) => onChange({ ...form, url: event.target.value })}
        />
      </Field>
    );
  }
  return (
    <>
      <Field>
        <FieldLabel htmlFor="server-command">Comando</FieldLabel>
        <Input
          id="server-command"
          className="font-mono"
          value={form.command}
          placeholder="npx"
          onChange={(event) => onChange({ ...form, command: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="server-args">Argumentos</FieldLabel>
        <Textarea
          id="server-args"
          className="min-h-16 font-mono"
          rows={Math.max(2, form.args.split("\n").length)}
          value={form.args}
          placeholder={"-y\n@upstash/context7-mcp"}
          onChange={(event) => onChange({ ...form, args: event.target.value })}
        />
        <FieldDescription>Um argumento por linha, então um argumento pode ter espaços.</FieldDescription>
      </Field>
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
    <Field>
      <FieldLabel htmlFor="server-cwd">Diretório de trabalho (opcional)</FieldLabel>
      <Input
        id="server-cwd"
        className="font-mono"
        value={form.cwd}
        placeholder="/caminho/absoluto"
        onChange={(event) => onChange({ ...form, cwd: event.target.value })}
      />
    </Field>
  );
}
