import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function realTarget(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

export type WriteOptions = {
  /** Mode of a new file, and of an existing one when `keepExistingMode` is false. */
  mode?: number;
  /** An existing file keeps the mode the user gave it. False forces `mode` onto it, for files that hold secrets. */
  keepExistingMode?: boolean;
};

/**
 * Readers see the old file or the new one, never a half-written one. A symlinked `path` keeps
 * pointing at its target.
 */
export function writeFileAtomic(path: string, content: string, { mode: defaultMode = 0o600, keepExistingMode = true }: WriteOptions = {}) {
  const existing = realTarget(path);
  const target = existing ?? path;
  let mode = defaultMode;
  if (existing !== undefined && keepExistingMode) {
    mode = statSync(existing).mode & 0o7777;
  }
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, content, { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, target);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
