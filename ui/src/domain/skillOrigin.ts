import type { SkillOrigin } from "../contract.ts";

export type OriginKind = SkillOrigin["kind"];

export const originKinds: OriginKind[] = ["hub", "managed", "unmanaged"];

export const originLabels: Record<OriginKind, string> = { hub: "hub", managed: "gerenciada", unmanaged: "solta" };

export const originHints: Record<OriginKind, string> = {
  hub: "Mora num conjunto do hub e é editada aqui.",
  managed: "Instalada e atualizada pelo CLI skills. Somente leitura: o hub só garante que todo CLI a enxerga.",
  unmanaged: "Pasta real que nada gerencia. Importe para o hub para editar e versionar.",
};

/** The set, source or folder that says where exactly the skill comes from. */
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
