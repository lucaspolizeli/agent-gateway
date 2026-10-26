import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Readers see the old file or the new one, never a half-written one. */
export function writeFileAtomic(path: string, content: string, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, content, { mode });
    renameSync(tmp, path);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
