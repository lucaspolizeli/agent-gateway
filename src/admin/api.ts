import { existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { loadConfig, ServerSchema, slug, writeConfig } from "../config.ts";
import { describeIssues, errorMessage, HTTP_STATUS, UserError } from "../errors.ts";
import type { GatewayPool } from "../pool.ts";
import { installedProfiles, installProject, listProjects, relinkSkills, syncAll, uninstallProject, unsafeProjectDir } from "../project.ts";
import { runSkillsDoctor } from "../skills-doctor.ts";
import { listUserSkills, SKILL_NAME } from "../user-skills.ts";
import type { ApiError, ProjectApplyResult, ProjectView, SyncResult } from "./contract.ts";
import { applyEdit, ConfigEditSchema } from "./edits.ts";
import { profileStatus, profileView, testServer } from "./profiles.ts";
import { deleteSecret, listSecrets, SECRET_KEY, setSecret } from "./secrets.ts";
import {
  createSet,
  deleteSkill,
  importSkill,
  listImportable,
  listSkillSets,
  moveSkill,
  readSkill,
  writeSkill,
} from "./skills.ts";
import { TOKEN_HEADER, tokenMatches } from "./token.ts";

export type AdminContext = { home: string; port: number; pool: GatewayPool; token: string };

type Method = "GET" | "POST" | "PUT" | "DELETE";
type Input<P, B> = { params: P; body: B; query: URLSearchParams };
type Route = {
  method: Method;
  segments: string[];
  handle: (raw: { params: Record<string, string>; body: unknown; query: URLSearchParams }) => unknown;
};

const MAX_BODY_BYTES = 1024 * 1024;

const noParams = z.object({});
const noBody = z.unknown();
const skillName = z.string().regex(SKILL_NAME, "use letters, digits, '.', '_' and '-', and do not start with '.'");
const skillParams = z.object({ set: slug, name: skillName });
const profileParam = z.object({ name: slug });
const secretParams = z.object({ profile: slug, key: z.string().regex(SECRET_KEY, "use letters, digits and '_', and do not start with a digit") });
const existingDirectory = z
  .string()
  .refine(isAbsolute, "must be an absolute path")
  .refine((dir) => existsSync(dir) && statSync(dir).isDirectory(), "must be an existing folder");
const directory = existingDirectory.superRefine((dir, ctx) => {
  const problem = unsafeProjectDir(dir);
  if (problem !== undefined) {
    ctx.addIssue({ code: "custom", message: problem });
  }
});

function route<P, B>(
  method: Method,
  path: string,
  schemas: { params: z.ZodType<P>; body: z.ZodType<B> },
  handle: (input: Input<P, B>) => unknown,
): Route {
  return {
    method,
    segments: path.split("/").filter(Boolean),
    handle: (raw) => handle({ params: schemas.params.parse(raw.params), body: schemas.body.parse(raw.body), query: raw.query }),
  };
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | undefined {
  if (pattern.length !== actual.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (const [index, segment] of pattern.entries()) {
    const value = actual[index]!;
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = value;
    } else if (segment !== value) {
      return undefined;
    }
  }
  return params;
}

/** Field names as the UI calls them; a name not listed is shown as its path. */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  set: "Skill set",
  toSet: "Target skill set",
  profile: "Profile",
  key: "Key",
  value: "Value",
  dir: "Folder",
  path: "Path",
  transport: "Transport",
  content: "Content",
  server: "Server",
  from: "Source",
  to: "Target",
};

function toApplyResult(report: ProjectApplyResult): ProjectApplyResult {
  return { dir: report.dir, clients: report.clients, skills: report.skills };
}

function requireProfile(home: string, name: string) {
  if (!(name in loadConfig(home).profiles)) {
    throw new UserError("notFound", `No profile named "${name}"`);
  }
}

function routes({ home, port, pool }: AdminContext): Route[] {
  const config = () => loadConfig(home);
  const skillSets = () => listSkillSets(home, config());

  return [
    route("GET", "/api/config", { params: noParams, body: noBody }, () => config()),

    route("POST", "/api/config/edits", { params: noParams, body: ConfigEditSchema }, ({ body }) => {
      const next = applyEdit(config(), body, installedProfiles(home));
      writeConfig(home, next);
      pool.reload(next).catch((error: unknown) => process.stderr.write(`[agent-gateway] reload: ${errorMessage(error)}\n`));
      return next;
    }),

    route("GET", "/api/profiles", { params: noParams, body: noBody }, () => {
      const current = config();
      return Object.keys(current.profiles).map((name) => profileView(home, current, name));
    }),

    route("GET", "/api/profiles/:name/status", { params: profileParam, body: noBody }, async ({ params, query }) => {
      const current = config();
      let gateway = pool.running(params.name);
      if (!gateway && query.get("start") === "1") {
        gateway = await pool.start(params.name);
      }
      return profileStatus(home, current, params.name, gateway);
    }),

    route(
      "POST",
      "/api/profiles/:name/servers/:server/reconnect",
      { params: z.object({ name: slug, server: slug }), body: noBody },
      async ({ params }) => {
        const gateway = pool.running(params.name);
        if (!gateway) {
          throw new UserError("conflict", `Profile "${params.name}" is not running; start it first`);
        }
        await gateway.reconnect(params.server);
        return profileStatus(home, config(), params.name, gateway);
      },
    ),

    route(
      "POST",
      "/api/servers/test",
      { params: noParams, body: z.object({ spec: ServerSchema, profile: slug.optional() }).strict() },
      ({ body }) => testServer(home, config(), body.spec, body.profile),
    ),

    route("GET", "/api/secrets", { params: noParams, body: noBody }, () => listSecrets(home, Object.keys(config().profiles))),

    route(
      "PUT",
      "/api/secrets/:profile/:key",
      { params: secretParams, body: z.object({ value: z.string() }).strict() },
      ({ params, body }) => {
        requireProfile(home, params.profile);
        return setSecret(home, params.profile, params.key, body.value);
      },
    ),

    route("DELETE", "/api/secrets/:profile/:key", { params: secretParams, body: noBody }, ({ params }) => {
      requireProfile(home, params.profile);
      return deleteSecret(home, params.profile, params.key);
    }),

    route("GET", "/api/skills", { params: noParams, body: noBody }, () => skillSets()),

    route("POST", "/api/skills/sets", { params: noParams, body: z.object({ name: slug }).strict() }, ({ body }) => {
      createSet(home, body.name);
      return skillSets();
    }),

    route("GET", "/api/skills/importable", { params: noParams, body: noBody }, () => listImportable()),

    route("GET", "/api/skills/user", { params: noParams, body: noBody }, () =>
      listUserSkills(home).map(({ name, description, origin }) => ({ name, description, origin })),
    ),

    route(
      "POST",
      "/api/skills/doctor",
      { params: noParams, body: z.object({ dir: existingDirectory.optional() }).strict().optional() },
      ({ body }) => runSkillsDoctor(home, body?.dir),
    ),

    route(
      "POST",
      "/api/skills/import",
      { params: noParams, body: z.object({ path: z.string(), toSet: slug }).strict() },
      async ({ body }) => {
        importSkill(home, body.path, body.toSet);
        await relinkSkills(home, [body.toSet]);
        return skillSets();
      },
    ),

    route("GET", "/api/skills/:set/:name", { params: skillParams, body: noBody }, ({ params }) =>
      readSkill(home, params.set, params.name),
    ),

    route(
      "PUT",
      "/api/skills/:set/:name",
      { params: skillParams, body: z.object({ content: z.string() }).strict() },
      async ({ params, body }) => {
        if (writeSkill(home, params.set, params.name, body.content)) {
          await relinkSkills(home, [params.set]);
        }
        return readSkill(home, params.set, params.name);
      },
    ),

    route(
      "POST",
      "/api/skills/:set/:name/move",
      { params: skillParams, body: z.object({ toSet: slug }).strict() },
      async ({ params, body }) => {
        moveSkill(home, params.set, params.name, body.toSet);
        await relinkSkills(home, [params.set, body.toSet]);
        return skillSets();
      },
    ),

    route("DELETE", "/api/skills/:set/:name", { params: skillParams, body: noBody }, async ({ params }) => {
      deleteSkill(home, params.set, params.name);
      await relinkSkills(home, [params.set]);
      return skillSets();
    }),

    route("GET", "/api/projects", { params: noParams, body: noBody }, () =>
      Object.entries(listProjects(home)).map(
        ([dir, binding]): ProjectView => ({ dir, profile: binding.profile, transport: binding.transport, exists: existsSync(dir) }),
      ),
    ),

    route(
      "POST",
      "/api/projects",
      {
        params: noParams,
        body: z.object({ dir: directory, profile: slug, transport: z.enum(["stdio", "http"]) }).strict(),
      },
      async ({ body }) => toApplyResult(await installProject(home, body.dir, { profile: body.profile, transport: body.transport }, port)),
    ),

    route("DELETE", "/api/projects", { params: noParams, body: z.object({ dir: z.string() }).strict() }, async ({ body }) => {
      const dir = resolve(body.dir);
      if (!(dir in listProjects(home))) {
        throw new UserError("notFound", `${dir} is not an installed project`);
      }
      return toApplyResult(await uninstallProject(home, dir));
    }),

    route("POST", "/api/sync", { params: noParams, body: noBody }, async (): Promise<SyncResult> => {
      const { applied, missing, unsafe, failed } = await syncAll(home, port);
      return { applied: applied.map(toApplyResult), missing, unsafe, failed };
    }),
  ];
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new UserError("invalid", "Request body is larger than 1 MB");
    }
    chunks.push(chunk as Buffer);
  }
  if (size === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    // The parser's message quotes the body, which may hold a secret value.
    throw new UserError("invalid", "Request body is not valid JSON");
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, message: string) {
  const body: ApiError = { error: message };
  send(res, status, body);
}

function decodeSegments(pathname: string): string[] | undefined {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
}

export function createAdminApi(context: AdminContext) {
  const table = routes(context);
  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!tokenMatches(context.token, req.headers[TOKEN_HEADER])) {
      sendError(res, 401, `Missing or wrong ${TOKEN_HEADER} header`);
      return;
    }
    const segments = decodeSegments(url.pathname);
    if (!segments) {
      sendError(res, 400, "Malformed path");
      return;
    }
    const matches = table.flatMap((entry) => {
      const params = matchSegments(entry.segments, segments);
      if (!params) {
        return [];
      }
      return [{ entry, params }];
    });
    if (matches.length === 0) {
      sendError(res, 404, `No API route ${url.pathname}`);
      return;
    }
    const match = matches.find(({ entry }) => entry.method === req.method);
    if (!match) {
      sendError(res, 405, `${req.method} is not allowed on ${url.pathname}`);
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await match.entry.handle({ params: match.params, body, query: url.searchParams }));
    } catch (error) {
      if (error instanceof UserError) {
        sendError(res, HTTP_STATUS[error.kind], error.message);
      } else if (error instanceof z.ZodError) {
        sendError(res, 400, describeIssues(error, FIELD_LABELS));
      } else {
        process.stderr.write(`[agent-gateway] ${req.method} ${url.pathname}: ${errorMessage(error)}\n`);
        sendError(res, 500, errorMessage(error));
      }
    }
  };
}
