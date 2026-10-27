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
    return `Enter the ${subject} name.`;
  }
  if (!SLUG.test(value)) {
    return "Use lowercase letters, digits and single hyphens, with no hyphen at the start or end (for example, my-name).";
  }
  return undefined;
}

export function serverNameProblem(value: string): string | undefined {
  const problem = slugProblem(value, "server");
  if (problem !== undefined) {
    return problem;
  }
  if (value === RESERVED_SERVER_NAME) {
    return `"${RESERVED_SERVER_NAME}" is reserved for the gateway's own tools. Choose another name.`;
  }
  return undefined;
}

export function profileNameProblem(value: string): string | undefined {
  return slugProblem(value, "profile");
}

export function skillSetNameProblem(value: string): string | undefined {
  return slugProblem(value, "skill set");
}

export function skillNameProblem(value: string): string | undefined {
  if (value === "") {
    return "Enter the skill name.";
  }
  if (!SKILL_NAME.test(value)) {
    return "Use letters, digits, ., _ and -, starting with a letter or digit.";
  }
  return undefined;
}

export function skillDescriptionProblem(value: string): string | undefined {
  if (value === "") {
    return "Enter a description. SKILL.md requires one.";
  }
  return undefined;
}

export function secretKeyProblem(value: string): string | undefined {
  if (value === "") {
    return "Enter the secret key.";
  }
  if (!SECRET_KEY.test(value)) {
    return "Use letters, digits and _, and do not start with a digit (for example, GITHUB_TOKEN).";
  }
  return undefined;
}

export function projectDirProblem(value: string): string | undefined {
  if (value === "") {
    return "Enter the repository folder.";
  }
  if (!value.startsWith("/")) {
    return "Use an absolute path that starts with /.";
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
