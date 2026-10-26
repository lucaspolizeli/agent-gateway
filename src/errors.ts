export type UserErrorKind = "invalid" | "notFound" | "conflict";

/** A failure caused by the request or the config, with a message meant for the person who made it. */
export class UserError extends Error {
  readonly kind: UserErrorKind;

  constructor(kind: UserErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
