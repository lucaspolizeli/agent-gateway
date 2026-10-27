import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { secretsPath } from "../config.ts";
import { UserError } from "../errors.ts";
import { writeFileAtomic } from "../fsutil.ts";
import type { SecretsView } from "./contract.ts";

export const SECRET_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function read(home: string, profile: string): Record<string, string> {
  const path = secretsPath(home, profile);
  const secrets: Record<string, string> = {};
  if (existsSync(path)) {
    Object.assign(secrets, parseEnv(readFileSync(path, "utf8")));
  }
  return secrets;
}

/**
 * One `KEY=value` line that `util.parseEnv` reads back as exactly `value`. Single quotes and
 * backticks are taken literally; each candidate is checked against the parser itself.
 */
export function formatEnvLine(key: string, value: string): string {
  if (value.includes("\r")) {
    throw new UserError("invalid", `Cannot save ${key}: carriage returns (CR, \\r) are not supported. Remove them from the value.`);
  }
  for (const quote of ["'", "`", '"']) {
    const line = `${key}=${quote}${value}${quote}`;
    if (!value.includes(quote) && parseEnv(line)[key] === value) {
      return line;
    }
  }
  throw new UserError("invalid", `Cannot save ${key}: the value contains ', " and \` together. Remove one kind of quote.`);
}

function write(home: string, profile: string, secrets: Record<string, string>) {
  const lines = Object.entries(secrets).map(([key, value]) => formatEnvLine(key, value));
  writeFileAtomic(secretsPath(home, profile), lines.map((line) => `${line}\n`).join(""), { mode: 0o600, keepExistingMode: false });
}

function view(home: string, profile: string): SecretsView {
  return { profile, keys: Object.keys(read(home, profile)) };
}

export function listSecrets(home: string, profiles: string[]): SecretsView[] {
  return profiles.map((profile) => view(home, profile));
}

/** Rewrites the whole file, so comments in a hand-edited secrets file do not survive a change from the UI. */
export function setSecret(home: string, profile: string, key: string, value: string): SecretsView {
  write(home, profile, { ...read(home, profile), [key]: value });
  return view(home, profile);
}

export function deleteSecret(home: string, profile: string, key: string): SecretsView {
  const secrets = read(home, profile);
  if (!(key in secrets)) {
    throw new UserError("notFound", `Profile "${profile}" has no secret ${key}`);
  }
  delete secrets[key];
  write(home, profile, secrets);
  return view(home, profile);
}
