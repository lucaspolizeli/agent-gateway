import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const TOKEN_HEADER = "x-agw-token";

/** Also read by the UI's Vite dev server, so the token stays the same across restarts. */
export function adminTokenPath(home: string): string {
  return join(home, "state", "admin-token");
}

export function ensureAdminToken(home: string): string {
  const path = adminTokenPath(home);
  if (!existsSync(path)) {
    mkdirSync(join(home, "state"), { recursive: true });
    try {
      writeFileSync(path, `${randomBytes(32).toString("hex")}\n`, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
  return readFileSync(path, "utf8").trim();
}

export function tokenMatches(expected: string, given: string | string[] | undefined): boolean {
  if (typeof given !== "string") {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
