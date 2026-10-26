import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../fsutil.ts";

export const TOKEN_HEADER = "x-agw-token";

const TOKEN_FORMAT = /^[0-9a-f]{64}$/;

/** Also read by the UI's Vite dev server, so the token stays the same across restarts. */
export function adminTokenPath(home: string): string {
  return join(home, "state", "admin-token");
}

/** The token `agw serve` uses, or undefined when it has not written a valid one yet. */
export function readAdminToken(home: string): string | undefined {
  const path = adminTokenPath(home);
  if (!existsSync(path)) {
    return undefined;
  }
  const current = readFileSync(path, "utf8").trim();
  if (TOKEN_FORMAT.test(current)) {
    return current;
  }
  return undefined;
}

/** Anything but 64 hex characters (an empty or hand-edited file) is replaced, never served. */
export function ensureAdminToken(home: string): string {
  const path = adminTokenPath(home);
  const current = readAdminToken(home);
  if (current !== undefined) {
    return current;
  }
  rmSync(path, { force: true });
  const token = randomBytes(32).toString("hex");
  writeFileAtomic(path, `${token}\n`, 0o600);
  return token;
}

export function tokenMatches(expected: string, given: string | string[] | undefined): boolean {
  if (typeof given !== "string" || expected === "") {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
