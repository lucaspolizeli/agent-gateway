/**
 * Client-side mirrors of the rules in `src/config.ts` (slug), `src/admin/skills.ts` (SKILL_NAME),
 * `src/admin/secrets.ts` (SECRET_KEY) and `src/admin/api.ts` (absolute project dir). Each function takes the
 * trimmed value and returns the problem to show, or `undefined` when the value is acceptable.
 * The API stays the authority; these only stop requests it would reject.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SECRET_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const RESERVED_SERVER_NAME = "gateway";

export function slugProblem(value: string, subject: string): string | undefined {
  if (value === "") {
    return `Informe o nome ${subject}.`;
  }
  if (!SLUG.test(value)) {
    return "Use letras minúsculas, dígitos e hifens simples, sem hífen no início ou no fim (ex.: meu-nome).";
  }
  return undefined;
}

export function serverNameProblem(value: string): string | undefined {
  const problem = slugProblem(value, "do servidor");
  if (problem !== undefined) {
    return problem;
  }
  if (value === RESERVED_SERVER_NAME) {
    return `"${RESERVED_SERVER_NAME}" é reservado para as tools do próprio gateway.`;
  }
  return undefined;
}

export function profileNameProblem(value: string): string | undefined {
  return slugProblem(value, "do perfil");
}

export function skillSetNameProblem(value: string): string | undefined {
  return slugProblem(value, "do conjunto");
}

export function skillNameProblem(value: string): string | undefined {
  if (value === "") {
    return "Informe o nome da skill.";
  }
  if (!SKILL_NAME.test(value)) {
    return "Use letras, dígitos, ponto, _ e -, começando por letra ou dígito.";
  }
  return undefined;
}

export function skillDescriptionProblem(value: string): string | undefined {
  if (value === "") {
    return "Informe a descrição: o SKILL.md exige uma.";
  }
  return undefined;
}

export function secretKeyProblem(value: string): string | undefined {
  if (value === "") {
    return "Informe a chave do segredo.";
  }
  if (!SECRET_KEY.test(value)) {
    return "Use letras, dígitos e _, sem começar por dígito (ex.: GITHUB_TOKEN).";
  }
  return undefined;
}

export function projectDirProblem(value: string): string | undefined {
  if (value === "") {
    return "Informe o diretório do repositório.";
  }
  if (!value.startsWith("/")) {
    return "Use um caminho absoluto, começando por /.";
  }
  return undefined;
}

/** A hint for a field the user has started filling in; an empty field keeps its submit disabled without nagging. */
export function hintFor(value: string, problem: string | undefined): string | undefined {
  if (value === "") {
    return undefined;
  }
  return problem;
}
