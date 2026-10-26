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

/**
 * Readers see the old file or the new one, never a half-written one. A symlinked `path` keeps
 * pointing at its target, and an existing file keeps its mode; `defaultMode` applies to a new file.
 */
export function writeFileAtomic(path: string, content: string, defaultMode = 0o600) {
  const existing = realTarget(path);
  const target = existing ?? path;
  let mode = defaultMode;
  if (existing !== undefined) {
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
