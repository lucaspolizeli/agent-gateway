/**
 * Wire contract between `agw serve`'s admin API (`/api/*`) and the web UI (`/ui`).
 * Types only: the UI imports this file directly, so it must not import runtime code.
 *
 * Every request carries the `x-agw-token` header with the admin token. The pages never contain it: `agw ui`
 * opens `/ui/#t=<token>` (read from `<home>/state/admin-token`), and the UI keeps it in `sessionStorage` and
 * removes it from the URL. Errors use `ApiError` with a 4xx/5xx status.
 */

// ---------- config ----------

export type StdioServerSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
};

export type HttpServerSpec = {
  url: string;
  headers: Record<string, string>;
};

export type ServerSpec = StdioServerSpec | HttpServerSpec;

export type ProfileSpec = {
  extends: string[];
  servers: string[];
  skills: string[];
  /** Qualified tool names (`<server>__<tool>`) this profile hides. Inherited by child profiles. */
  hiddenTools: string[];
};

export type GatewayConfig = {
  servers: Record<string, ServerSpec>;
  profiles: Record<string, ProfileSpec>;
};

/** Every change the UI makes to `gateway.json`. Applied by a pure function, validated, then written atomically. */
export type ConfigEdit =
  | { op: "upsertServer"; name: string; spec: ServerSpec }
  /** Also removes the server from every profile and drops its hidden tools. */
  | { op: "removeServer"; name: string }
  | { op: "renameServer"; from: string; to: string }
  | { op: "upsertProfile"; name: string; profile: ProfileSpec }
  /** Rejected while another profile extends it or a project is installed with it. */
  | { op: "removeProfile"; name: string }
  | { op: "setToolHidden"; profile: string; tool: string; hidden: boolean };

// GET  /api/config                         -> GatewayConfig
// POST /api/config/edits  body ConfigEdit  -> GatewayConfig (after the edit)

// ---------- profiles and live status ----------

export type UpstreamState =
  | { server: string; state: "connecting" }
  | { server: string; state: "ready"; toolCount: number }
  | { server: string; state: "failed"; error: string };

export type ToolInfo = {
  /** Qualified name as clients see it. */
  name: string;
  server: string;
  description?: string;
  /** Hidden by this profile or an ancestor. */
  hidden: boolean;
  /** The profile in the chain that hides it, when hidden. */
  hiddenBy?: string;
};

export type ResolvedProfileView = {
  name: string;
  /** Ancestors first, the profile itself last. */
  chain: string[];
  /** Server name -> the profile in the chain that brings it in. */
  servers: Record<string, string>;
  skillSets: string[];
  /** `${VAR}` references used by this profile's servers that no secrets file or env provides. */
  missingSecrets: string[];
};

export type ProfileStatus = {
  profile: ResolvedProfileView;
  /** False until a client or the UI has started this profile's gateway. */
  running: boolean;
  upstreams: UpstreamState[];
  tools: ToolInfo[];
};

// GET  /api/profiles                                   -> ResolvedProfileView[]
// GET  /api/profiles/:name/status?start=1              -> ProfileStatus   (start=1 starts the gateway if needed)
// POST /api/profiles/:name/servers/:server/reconnect   -> ProfileStatus

// ---------- testing a server before saving ----------

export type ServerTestRequest = { spec: ServerSpec; /** Secrets of this profile chain fill `${VAR}`. */ profile?: string };
export type ServerTestResult =
  | { ok: true; tools: Array<{ name: string; description?: string }>; durationMs: number }
  | { ok: false; error: string; durationMs: number };

// POST /api/servers/test  body ServerTestRequest -> ServerTestResult

// ---------- secrets (write-only: values never leave the server) ----------

export type SecretsView = {
  profile: string;
  /** Keys present in `secrets/<profile>.env`. */
  keys: string[];
};

// GET    /api/secrets                       -> SecretsView[]   (one per profile)
// PUT    /api/secrets/:profile/:key  body { value: string } -> SecretsView
// DELETE /api/secrets/:profile/:key         -> SecretsView

// ---------- skills ----------

export type SkillSummary = {
  name: string;
  set: string;
  description: string;
};

export type SkillSet = {
  name: string;
  /** "global" is linked at user level; every other set is linked into projects through profiles. */
  scope: "user" | "project";
  skills: SkillSummary[];
  /** Profiles that list this set directly. */
  usedBy: string[];
};

export type SkillDocument = SkillSummary & {
  /** Full SKILL.md, frontmatter included. */
  content: string;
  /** Other files in the skill folder, relative paths. */
  files: string[];
};

/** A real folder in a user-level skill dir that the hub does not own yet. */
export type ImportableSkill = { name: string; path: string; description: string };

// GET    /api/skills                                   -> SkillSet[]
// POST   /api/skills/sets          body { name }       -> SkillSet[]
// GET    /api/skills/:set/:name                        -> SkillDocument
// PUT    /api/skills/:set/:name    body { content }    -> SkillDocument   (creates the skill when missing)
// POST   /api/skills/:set/:name/move  body { toSet }   -> SkillSet[]
// DELETE /api/skills/:set/:name                        -> SkillSet[]
// GET    /api/skills/importable                        -> ImportableSkill[]
// POST   /api/skills/import        body { path, toSet } -> SkillSet[]   (moves the folder into the hub, then re-links)

// ---------- projects ----------

export type Transport = "stdio" | "http";

export type ClientResult = { client: "claude" | "codex" | "grok"; ok: boolean; detail: string };

export type ProjectView = {
  dir: string;
  profile: string;
  transport: Transport;
  exists: boolean;
};

export type ProjectApplyResult = {
  dir: string;
  clients: ClientResult[];
  skills: Array<{ target: string; linked: string[]; removed: string[]; skipped: string[] }>;
};

// GET    /api/projects                                                 -> ProjectView[]
// POST   /api/projects   body { dir, profile, transport }              -> ProjectApplyResult
// DELETE /api/projects   body { dir }                                  -> ProjectApplyResult
// POST   /api/sync                                                     -> SyncResult

/** Every installed project lands in exactly one bucket, so nothing is skipped silently. */
export type SyncResult = {
  applied: ProjectApplyResult[];
  /** Installed folders that no longer exist. */
  missing: string[];
  /** Installed folders refused because they resolve to user-level config (for example $HOME). */
  unsafe: string[];
  /** Projects that could not be applied at all, such as a profile removed from the config. */
  failed: Array<{ dir: string; error: string }>;
};

// ---------- errors ----------

export type ApiError = { error: string };
