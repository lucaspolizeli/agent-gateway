import type { ProfileSpec, ToolInfo } from "../contract.ts";

export const emptyProfile: ProfileSpec = { extends: [], servers: [], skills: [], hiddenTools: [] };

export function toggled(list: string[], item: string, on: boolean): string[] {
  const without = list.filter((entry) => entry !== item);
  if (on) {
    return [...without, item];
  }
  return without;
}

export function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

export function sameProfileSpec(a: ProfileSpec, b: ProfileSpec): boolean {
  return sameMembers(a.extends, b.extends) && sameMembers(a.servers, b.servers) && sameMembers(a.skills, b.skills);
}

/** Every profile that has `name` in its ancestry; offering those as parents would create a cycle. */
export function descendantsOf(name: string, profiles: Record<string, ProfileSpec>): Set<string> {
  const descendants = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [candidate, spec] of Object.entries(profiles)) {
      if (descendants.has(candidate)) {
        continue;
      }
      if (spec.extends.some((parent) => parent === name || descendants.has(parent))) {
        descendants.add(candidate);
        grew = true;
      }
    }
  }
  return descendants;
}

export type ToolVisibility =
  { kind: "visible" } | { kind: "hiddenHere" } | { kind: "hiddenByAncestor"; profile: string };

export function toolVisibility(tool: ToolInfo, profile: string): ToolVisibility {
  if (!tool.hidden) {
    return { kind: "visible" };
  }
  if (tool.hiddenBy !== undefined && tool.hiddenBy !== profile) {
    return { kind: "hiddenByAncestor", profile: tool.hiddenBy };
  }
  return { kind: "hiddenHere" };
}

export function groupByServer(tools: ToolInfo[]): Array<[string, ToolInfo[]]> {
  const groups = new Map<string, ToolInfo[]>();
  for (const tool of tools) {
    const group = groups.get(tool.server) ?? [];
    group.push(tool);
    groups.set(tool.server, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
