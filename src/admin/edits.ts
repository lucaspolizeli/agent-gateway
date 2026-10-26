import { z } from "zod";
import { type Config, parseConfig, ProfileSchema, SEPARATOR, ServerSchema, slug } from "../config.ts";
import { UserError } from "../errors.ts";
import type { ConfigEdit } from "./contract.ts";

export const ConfigEditSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsertServer"), name: slug, spec: ServerSchema }).strict(),
  z.object({ op: z.literal("removeServer"), name: slug }).strict(),
  z.object({ op: z.literal("renameServer"), from: slug, to: slug }).strict(),
  z.object({ op: z.literal("upsertProfile"), name: slug, profile: ProfileSchema }).strict(),
  z.object({ op: z.literal("removeProfile"), name: slug }).strict(),
  z.object({ op: z.literal("setToolHidden"), profile: slug, tool: z.string().min(1), hidden: z.boolean() }).strict(),
]);

type Assignable<To, From extends To> = From;
export type EditSchemaMatchesContract = Assignable<ConfigEdit, z.infer<typeof ConfigEditSchema>>;

type EditOf<Op extends ConfigEdit["op"]> = Extract<ConfigEdit, { op: Op }>;
type Apply<Op extends ConfigEdit["op"]> = (config: Config, edit: EditOf<Op>, installedProfiles: ReadonlySet<string>) => void;

function requireServer(config: Config, name: string) {
  if (!(name in config.servers)) {
    throw new UserError("notFound", `No server named "${name}"`);
  }
}

function requireProfile(config: Config, name: string) {
  if (!(name in config.profiles)) {
    throw new UserError("notFound", `No profile named "${name}"`);
  }
}

function belongsTo(server: string) {
  return (tool: string) => tool.startsWith(`${server}${SEPARATOR}`);
}

/** Each op mutates its own copy of the config; `applyEdit` validates the result. */
const ops: { [Op in ConfigEdit["op"]]: Apply<Op> } = {
  upsertServer(config, { name, spec }) {
    config.servers[name] = structuredClone(spec);
  },

  removeServer(config, { name }) {
    requireServer(config, name);
    delete config.servers[name];
    for (const profile of Object.values(config.profiles)) {
      profile.servers = profile.servers.filter((server) => server !== name);
      profile.hiddenTools = profile.hiddenTools.filter((tool) => !belongsTo(name)(tool));
    }
  },

  renameServer(config, { from, to }) {
    requireServer(config, from);
    if (from === to) {
      return;
    }
    if (to in config.servers) {
      throw new UserError("conflict", `A server named "${to}" already exists`);
    }
    config.servers = Object.fromEntries(
      Object.entries(config.servers).map(([name, spec]) => {
        if (name === from) {
          return [to, spec];
        }
        return [name, spec];
      }),
    );
    for (const profile of Object.values(config.profiles)) {
      profile.servers = profile.servers.map((server) => {
        if (server === from) {
          return to;
        }
        return server;
      });
      profile.hiddenTools = profile.hiddenTools.map((tool) => {
        if (belongsTo(from)(tool)) {
          return `${to}${tool.slice(from.length)}`;
        }
        return tool;
      });
    }
  },

  upsertProfile(config, { name, profile }) {
    config.profiles[name] = structuredClone(profile);
  },

  removeProfile(config, { name }, installedProfiles) {
    requireProfile(config, name);
    const children = Object.entries(config.profiles)
      .filter(([, profile]) => profile.extends.includes(name))
      .map(([child]) => child);
    if (children.length > 0) {
      throw new UserError("conflict", `Profile "${name}" is extended by ${children.join(", ")}`);
    }
    if (installedProfiles.has(name)) {
      throw new UserError("conflict", `Profile "${name}" is installed in a project; uninstall it there first`);
    }
    delete config.profiles[name];
  },

  setToolHidden(config, { profile, tool, hidden }) {
    requireProfile(config, profile);
    const target = config.profiles[profile]!;
    const others = target.hiddenTools.filter((name) => name !== tool);
    if (hidden) {
      target.hiddenTools = [...others, tool];
    } else {
      target.hiddenTools = others;
    }
  },
};

/** The config after `edit`, validated like a config read from disk. Throws a `UserError` the UI can show as is. */
export function applyEdit(config: Config, edit: ConfigEdit, installedProfiles: ReadonlySet<string>): Config {
  const next = structuredClone(config);
  const apply = ops[edit.op] as Apply<ConfigEdit["op"]>;
  apply(next, edit, installedProfiles);
  return parseConfig(next);
}
