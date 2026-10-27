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
        <FieldLabel htmlFor="server-command">Command</FieldLabel>
        <Input
          id="server-command"
          className="font-mono"
          value={form.command}
          placeholder="npx"
          onChange={(event) => onChange({ ...form, command: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="server-args">Arguments</FieldLabel>
        <Textarea
          id="server-args"
          className="min-h-16 font-mono"
          rows={Math.max(2, form.args.split("\n").length)}
          value={form.args}
          placeholder={"-y\n@upstash/context7-mcp"}
          onChange={(event) => onChange({ ...form, args: event.target.value })}
        />
        <FieldDescription>One argument per line, so an argument can contain spaces.</FieldDescription>
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
      keyPlaceholder="NAME"
      valuePlaceholder="value or ${SECRET}"
      onChange={(env) => onChange({ ...form, env })}
    />
  );
}

export function AdvancedFields({ form, onChange }: { form: StdioForm; onChange: (form: StdioForm) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor="server-cwd">Working folder (optional)</FieldLabel>
      <Input
        id="server-cwd"
        className="font-mono"
        value={form.cwd}
        placeholder="/absolute/path"
        onChange={(event) => onChange({ ...form, cwd: event.target.value })}
      />
    </Field>
  );
}
