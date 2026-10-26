import type { HttpServerSpec, ServerSpec, StdioServerSpec } from "../contract.ts";
import { duplicateKeys, newRow, recordFromRows, rowsFromRecord, type KeyValueRow } from "./keyValueRows.ts";

export type ServerKind = "stdio" | "http";

export type StdioForm = {
  kind: "stdio";
  command: string;
  /** One argument per line, so arguments may contain spaces. */
  args: string;
  env: KeyValueRow[];
  cwd: string;
};

export type HttpForm = {
  kind: "http";
  url: string;
  headers: KeyValueRow[];
};

export type ServerForm = StdioForm | HttpForm;

export function serverKind(spec: ServerSpec): ServerKind {
  if ("url" in spec) {
    return "http";
  }
  return "stdio";
}

export const emptyForms: Record<ServerKind, () => ServerForm> = {
  stdio: () => ({ kind: "stdio", command: "", args: "", env: [newRow()], cwd: "" }),
  http: () => ({ kind: "http", url: "", headers: [newRow()] }),
};

export function formFromSpec(spec: ServerSpec): ServerForm {
  if ("url" in spec) {
    return { kind: "http", url: spec.url, headers: rowsFromRecord(spec.headers) };
  }
  return {
    kind: "stdio",
    command: spec.command,
    args: spec.args.join("\n"),
    env: rowsFromRecord(spec.env),
    cwd: spec.cwd ?? "",
  };
}

function stdioSpec(form: StdioForm): StdioServerSpec {
  const spec: StdioServerSpec = {
    command: form.command.trim(),
    args: form.args.split("\n").filter((arg) => arg.trim() !== ""),
    env: recordFromRows(form.env),
  };
  const cwd = form.cwd.trim();
  if (cwd !== "") {
    spec.cwd = cwd;
  }
  return spec;
}

function httpSpec(form: HttpForm): HttpServerSpec {
  return { url: form.url.trim(), headers: recordFromRows(form.headers) };
}

export function specFromForm(form: ServerForm): ServerSpec {
  if (form.kind === "http") {
    return httpSpec(form);
  }
  return stdioSpec(form);
}

/** Problems that would make the server unusable; the API still has the final say. */
export function formProblems(form: ServerForm): string[] {
  if (form.kind === "http") {
    const problems: string[] = [];
    if (!URL.canParse(form.url.trim())) {
      problems.push("URL inválida.");
    }
    for (const key of duplicateKeys(form.headers)) {
      problems.push(`Header duplicado: ${key}`);
    }
    return problems;
  }
  const problems: string[] = [];
  if (form.command.trim() === "") {
    problems.push("Informe o comando.");
  }
  for (const key of duplicateKeys(form.env)) {
    problems.push(`Variável duplicada: ${key}`);
  }
  return problems;
}

export function serverSummary(spec: ServerSpec): string {
  if ("url" in spec) {
    return spec.url;
  }
  return [spec.command, ...spec.args].join(" ");
}
