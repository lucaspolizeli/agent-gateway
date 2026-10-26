import type {
  ApiError,
  ConfigEdit,
  GatewayConfig,
  ImportableSkill,
  ProfileStatus,
  ProjectApplyResult,
  ProjectView,
  ResolvedProfileView,
  SecretsView,
  ServerTestRequest,
  ServerTestResult,
  SkillDocument,
  SkillSet,
  Transport,
} from "../contract.ts";
import { adminToken } from "./token.ts";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

const UNREACHABLE_HINT = "API do agw indisponível. O `agw serve` está rodando?";

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && typeof (value as ApiError).error === "string";
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (isApiError(parsed)) {
      return new ApiRequestError(response.status, parsed.error);
    }
  } catch {
    // Not JSON: the dev proxy or something other than agw answered.
  }
  if (response.status >= 500) {
    return new ApiRequestError(response.status, `${UNREACHABLE_HINT} (HTTP ${response.status})`);
  }
  return new ApiRequestError(response.status, `HTTP ${response.status} ${response.statusText}`.trim());
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = adminToken();
  if (token === undefined) {
    throw new ApiRequestError(0, "Token de admin ausente. Abra pelo comando `agw ui`.");
  }
  const headers: Record<string, string> = { "x-agw-token": token };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiRequestError(0, UNREACHABLE_HINT);
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as T;
}

const seg = encodeURIComponent;

// ---------- config ----------

export const getConfig = () => request<GatewayConfig>("GET", "/config");

export const editConfig = (edit: ConfigEdit) => request<GatewayConfig>("POST", "/config/edits", edit);

// ---------- profiles and live status ----------

export const listProfiles = () => request<ResolvedProfileView[]>("GET", "/profiles");

export function getProfileStatus(profile: string, start: boolean) {
  let query = "";
  if (start) {
    query = "?start=1";
  }
  return request<ProfileStatus>("GET", `/profiles/${seg(profile)}/status${query}`);
}

export const reconnectServer = (profile: string, server: string) =>
  request<ProfileStatus>("POST", `/profiles/${seg(profile)}/servers/${seg(server)}/reconnect`);

// ---------- servers ----------

export const testServer = (body: ServerTestRequest) => request<ServerTestResult>("POST", "/servers/test", body);

// ---------- secrets ----------

export const listSecrets = () => request<SecretsView[]>("GET", "/secrets");

export const setSecret = (profile: string, key: string, value: string) =>
  request<SecretsView>("PUT", `/secrets/${seg(profile)}/${seg(key)}`, { value });

export const deleteSecret = (profile: string, key: string) =>
  request<SecretsView>("DELETE", `/secrets/${seg(profile)}/${seg(key)}`);

// ---------- skills ----------

export const listSkillSets = () => request<SkillSet[]>("GET", "/skills");

export const createSkillSet = (name: string) => request<SkillSet[]>("POST", "/skills/sets", { name });

export const getSkill = (set: string, name: string) =>
  request<SkillDocument>("GET", `/skills/${seg(set)}/${seg(name)}`);

export const saveSkill = (set: string, name: string, content: string) =>
  request<SkillDocument>("PUT", `/skills/${seg(set)}/${seg(name)}`, { content });

export const moveSkill = (set: string, name: string, toSet: string) =>
  request<SkillSet[]>("POST", `/skills/${seg(set)}/${seg(name)}/move`, { toSet });

export const deleteSkill = (set: string, name: string) =>
  request<SkillSet[]>("DELETE", `/skills/${seg(set)}/${seg(name)}`);

export const listImportableSkills = () => request<ImportableSkill[]>("GET", "/skills/importable");

export const importSkill = (path: string, toSet: string) =>
  request<SkillSet[]>("POST", "/skills/import", { path, toSet });

// ---------- projects ----------

export const listProjects = () => request<ProjectView[]>("GET", "/projects");

export const installProject = (body: { dir: string; profile: string; transport: Transport }) =>
  request<ProjectApplyResult>("POST", "/projects", body);

export const uninstallProject = (dir: string) => request<ProjectApplyResult>("DELETE", "/projects", { dir });

export const syncAll = () => request<ProjectApplyResult[]>("POST", "/sync");
