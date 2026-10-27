import type { z } from "zod";

export type UserErrorKind = "invalid" | "notFound" | "conflict";

/** A failure caused by the request or the config, with a message meant for the person who made it. */
export class UserError extends Error {
  readonly kind: UserErrorKind;

  constructor(kind: UserErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** HTTP status for each kind, shared by the admin API and the MCP surface. */
export const HTTP_STATUS: Record<UserErrorKind, number> = { invalid: 400, notFound: 404, conflict: 409 };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** One line per rejected field, `Field: reason`, without the decorations of zod's own report. */
export function describeIssues(error: z.ZodError, labels: Record<string, string> = {}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String);
      if (path.length === 0) {
        return issue.message;
      }
      let label = path.join(".");
      if (path.length === 1) {
        label = labels[label] ?? label;
      }
      return `${label}: ${issue.message}`;
    })
    .join("\n");
}
