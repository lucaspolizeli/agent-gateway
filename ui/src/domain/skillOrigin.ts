import type { SkillOrigin } from "../contract.ts";

export type OriginKind = SkillOrigin["kind"];

export const originKinds: OriginKind[] = ["hub", "managed", "unmanaged"];

export const originLabels: Record<OriginKind, string> = { hub: "hub", managed: "managed", unmanaged: "unmanaged" };

export const originHints: Record<OriginKind, string> = {
  hub: "Lives in a hub skill set and is edited here.",
  managed: "Installed and updated by the skills CLI. Read-only here: the hub only makes sure every CLI sees it.",
  unmanaged: "A real folder that nothing manages. Import it into the hub to edit and version it.",
};

export function originDetail(origin: SkillOrigin): string {
  switch (origin.kind) {
    case "hub":
      return origin.set;
    case "managed":
      return origin.source;
    case "unmanaged":
      return origin.path;
  }
}
