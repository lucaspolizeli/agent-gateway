import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import type * as Contract from "./admin/contract.ts";
import { errorMessage, UserError } from "./errors.ts";
import { writeFileAtomic } from "./fsutil.ts";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slug = z.string().regex(SLUG, "use lowercase letters, digits and single hyphens");

/** Joins upstream server and item names: `github__create_issue`. Server slugs never contain `_`. */
export const SEPARATOR = "__";

const SECRET_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

const StdioServerSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    cwd: z.string().optional(),
  })
  .strict();

const HttpServerSchema = z
  .object({
    url: z.url(),
    headers: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export const ServerSchema = z.union([StdioServerSchema, HttpServerSchema]);

export const ProfileSchema = z
  .object({
    extends: z.array(slug).default([]),
    servers: z.array(slug).default([]),
    skills: z.array(slug).default([]),
    hiddenTools: z.array(z.string()).default([]),
  })
  .strict();

const ConfigSchema = z
  .object({
    servers: z.record(slug, ServerSchema),
    profiles: z.record(slug, ProfileSchema),
  })
  .strict();

export type StdioServerSpec = z.infer<typeof StdioServerSchema>;
export type HttpServerSpec = z.infer<typeof HttpServerSchema>;
export type ServerSpec = z.infer<typeof ServerSchema>;
export type ProfileSpec = z.infer<typeof ProfileSchema>;
export type Config = z.infer<typeof ConfigSchema>;

type Assignable<To, From extends To> = From;
export type ConfigMatchesContract = [
  Assignable<Contract.GatewayConfig, Config>,
  Assignable<Contract.ServerSpec, ServerSpec>,
  Assignable<Contract.ProfileSpec, ProfileSpec>,
];

export type ResolvedProfile = {
  name: string;
  /** Ancestors first, the profile itself last. */
  chain: string[];
  servers: Map<string, ServerSpec>;
  skillSets: string[];
  /** Qualified tool name -> the profile in the chain that hides it. */
  hiddenTools: Map<string, string>;
};

export function isStdio(spec: ServerSpec): spec is StdioServerSpec {
  return "command" in spec;
}

export function configPath(home: string): string {
  return join(home, "gateway.json");
}

export function parseConfig(raw: unknown): Config {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UserError("invalid", z.prettifyError(parsed.error));
  }
  const config = parsed.data;
  if ("gateway" in config.servers) {
    throw new UserError("invalid", `Server name "gateway" is reserved for the gateway's own tools`);
  }
  for (const [name, profile] of Object.entries(config.profiles)) {
    for (const server of profile.servers) {
      if (!(server in config.servers)) {
        throw new UserError("invalid", `Profile "${name}" uses unknown server "${server}"`);
      }
    }
    for (const parent of profile.extends) {
      if (!(parent in config.profiles)) {
        throw new UserError("invalid", `Profile "${name}" extends unknown profile "${parent}"`);
      }
    }
    for (const tool of profile.hiddenTools) {
      const at = tool.indexOf(SEPARATOR);
      if (at <= 0 || !(tool.slice(0, at) in config.servers)) {
        throw new UserError("invalid", `Profile "${name}" hides "${tool}", which is not a <server>${SEPARATOR}<tool> name of a known server`);
      }
    }
  }
  for (const name of Object.keys(config.profiles)) {
    resolveProfile(config, name);
  }
  return config;
}

/** The parser's own message can quote the text around the error, which may be a secret value. */
function describeJsonError(error: unknown): string {
  const at = /\(line (\d+) column (\d+)\)/.exec(errorMessage(error));
  if (at) {
    return `not valid JSON at line ${at[1]}, column ${at[2]}`;
  }
  return "not valid JSON";
}

export function loadConfig(home: string): Config {
  const path = configPath(home);
  if (!existsSync(path)) {
    throw new UserError("notFound", `No config at ${path}. Copy gateway.example.json to gateway.json.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UserError("invalid", `Invalid ${path}: ${describeJsonError(error)}`);
  }
  try {
    return parseConfig(raw);
  } catch (error) {
    if (error instanceof UserError) {
      throw new UserError(error.kind, `Invalid ${path}:\n${error.message}`);
    }
    throw error;
  }
}

export function writeConfig(home: string, config: Config) {
  writeFileAtomic(configPath(home), JSON.stringify(config, null, 2) + "\n");
}

export function resolveProfile(config: Config, name: string): ResolvedProfile {
  const chain: string[] = [];
  const visit = (current: string, path: string[]) => {
    if (path.includes(current)) {
      throw new UserError("invalid", `Profile cycle: ${[...path, current].join(" -> ")}`);
    }
    const profile = config.profiles[current];
    if (!profile) {
      throw new UserError("notFound", `Unknown profile "${current}". Known: ${Object.keys(config.profiles).join(", ")}`);
    }
    for (const parent of profile.extends) {
      visit(parent, [...path, current]);
    }
    if (!chain.includes(current)) {
      chain.push(current);
    }
  };
  visit(name, []);

  const servers = new Map<string, ServerSpec>();
  const skillSets: string[] = [];
  const hiddenTools = new Map<string, string>();
  for (const member of chain) {
    const profile = config.profiles[member]!;
    for (const server of profile.servers) {
      servers.set(server, config.servers[server]!);
    }
    for (const set of profile.skills) {
      if (!skillSets.includes(set)) {
        skillSets.push(set);
      }
    }
    for (const tool of profile.hiddenTools) {
      if (!hiddenTools.has(tool)) {
        hiddenTools.set(tool, member);
      }
    }
  }
  return { name, chain, servers, skillSets, hiddenTools };
}

export function secretsPath(home: string, profile: string): string {
  return join(home, "secrets", `${profile}.env`);
}

/**
 * Secrets for a profile: `secrets/<member>.env` for every profile in the chain,
 * later members overriding earlier ones. The process environment is the fallback in `interpolate`.
 */
export function loadSecrets(home: string, profile: ResolvedProfile): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const member of profile.chain) {
    const path = secretsPath(home, member);
    if (existsSync(path)) {
      Object.assign(secrets, parseEnv(readFileSync(path, "utf8")));
    }
  }
  return secrets;
}

function lookup(key: string, secrets: Record<string, string>): string | undefined {
  return secrets[key] ?? process.env[key];
}

export function interpolate(value: string, secrets: Record<string, string>): string {
  return value.replace(SECRET_REF, (_, key: string) => {
    const found = lookup(key, secrets);
    if (found === undefined) {
      throw new Error(`Missing secret \${${key}}`);
    }
    return found;
  });
}

function interpolateRecord(record: Record<string, string>, secrets: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, interpolate(v, secrets)]));
}

export function interpolateSpec(spec: ServerSpec, secrets: Record<string, string>): ServerSpec {
  if (isStdio(spec)) {
    return {
      ...spec,
      command: interpolate(spec.command, secrets),
      args: spec.args.map((arg) => interpolate(arg, secrets)),
      env: interpolateRecord(spec.env, secrets),
    };
  }
  return { url: interpolate(spec.url, secrets), headers: interpolateRecord(spec.headers, secrets) };
}

function secretRefs(spec: ServerSpec): string[] {
  let values: string[];
  if (isStdio(spec)) {
    values = [spec.command, ...spec.args, ...Object.values(spec.env)];
  } else {
    values = [spec.url, ...Object.values(spec.headers)];
  }
  return values.flatMap((value) => [...value.matchAll(SECRET_REF)].map((match) => match[1]!));
}

/** The values `spec` takes from secrets or the environment, for redacting them from messages. */
export function usedSecretValues(spec: ServerSpec, secrets: Record<string, string>): string[] {
  return secretRefs(spec).flatMap((key) => {
    const value = lookup(key, secrets);
    if (value === undefined) {
      return [];
    }
    return [value];
  });
}

/** `${VAR}` names the profile's servers use that neither its secrets files nor the environment provide. */
export function missingSecrets(home: string, profile: ResolvedProfile): string[] {
  const secrets = loadSecrets(home, profile);
  const missing = new Set<string>();
  for (const spec of profile.servers.values()) {
    for (const key of secretRefs(spec)) {
      if (lookup(key, secrets) === undefined) {
        missing.add(key);
      }
    }
  }
  return [...missing].sort();
}
