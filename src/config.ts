import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG, "use lowercase letters, digits and single hyphens");

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

const ProfileSchema = z
  .object({
    extends: z.array(slug).default([]),
    servers: z.array(slug).default([]),
    skills: z.array(slug).default([]),
    hiddenTools: z.array(z.string()).default([]),
  })
  .strict();

const ConfigSchema = z
  .object({
    servers: z.record(slug, z.union([StdioServerSchema, HttpServerSchema])),
    profiles: z.record(slug, ProfileSchema),
  })
  .strict();

export type StdioServerSpec = z.infer<typeof StdioServerSchema>;
export type HttpServerSpec = z.infer<typeof HttpServerSchema>;
export type ServerSpec = StdioServerSpec | HttpServerSpec;
export type Config = z.infer<typeof ConfigSchema>;

export type ResolvedProfile = {
  name: string;
  /** Ancestors first, the profile itself last. */
  chain: string[];
  servers: Map<string, ServerSpec>;
  skillSets: string[];
};

export function isStdio(spec: ServerSpec): spec is StdioServerSpec {
  return "command" in spec;
}

export function loadConfig(home: string): Config {
  const path = join(home, "gateway.json");
  if (!existsSync(path)) {
    throw new Error(`No config at ${path}. Copy gateway.example.json to gateway.json.`);
  }
  const parsed = ConfigSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${z.prettifyError(parsed.error)}`);
  }
  const config = parsed.data;
  if ("gateway" in config.servers) {
    throw new Error(`Server name "gateway" is reserved for the gateway's own tools`);
  }
  for (const [name, profile] of Object.entries(config.profiles)) {
    for (const server of profile.servers) {
      if (!(server in config.servers)) {
        throw new Error(`Profile "${name}" uses unknown server "${server}"`);
      }
    }
    for (const parent of profile.extends) {
      if (!(parent in config.profiles)) {
        throw new Error(`Profile "${name}" extends unknown profile "${parent}"`);
      }
    }
  }
  return config;
}

export function resolveProfile(config: Config, name: string): ResolvedProfile {
  const chain: string[] = [];
  const visit = (current: string, path: string[]) => {
    if (path.includes(current)) {
      throw new Error(`Profile cycle: ${[...path, current].join(" -> ")}`);
    }
    const profile = config.profiles[current];
    if (!profile) {
      throw new Error(`Unknown profile "${current}". Known: ${Object.keys(config.profiles).join(", ")}`);
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
  }
  return { name, chain, servers, skillSets };
}

/**
 * Secrets for a profile: `secrets/<member>.env` for every profile in the chain,
 * later members overriding earlier ones, then the process environment as fallback.
 */
export function loadSecrets(home: string, profile: ResolvedProfile): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const member of profile.chain) {
    const path = join(home, "secrets", `${member}.env`);
    if (existsSync(path)) {
      Object.assign(secrets, parseEnv(readFileSync(path, "utf8")));
    }
  }
  return secrets;
}

export function interpolate(value: string, secrets: Record<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => {
    const found = secrets[key] ?? process.env[key];
    if (found === undefined) {
      throw new Error(`Missing secret \${${key}}`);
    }
    return found;
  });
}

export function interpolateRecord(
  record: Record<string, string>,
  secrets: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, interpolate(v, secrets)]));
}
