import type { ProfileStatus } from "../contract.ts";
import { reconnectOutcome } from "../domain/health.ts";
import type { Verdict } from "./MutationStatus.tsx";

export type ReconnectVars = { profile: string; server: string };

/** Reconnect answers with the whole profile status, so success means this upstream is `ready`. */
export function reconnectVerdict(status: ProfileStatus, vars: ReconnectVars | undefined): Verdict {
  return judge(status, vars, true);
}

/** For rows that already print the upstream's error, so the verdict does not repeat it. */
export function reconnectRowVerdict(status: ProfileStatus, vars: ReconnectVars | undefined): Verdict {
  return judge(status, vars, false);
}

function judge(status: ProfileStatus, vars: ReconnectVars | undefined, withError: boolean): Verdict {
  const server = vars?.server ?? "";
  const outcome = reconnectOutcome(status, server);
  switch (outcome.kind) {
    case "ready":
      return { tone: "ok", message: `${server} reconectado.` };
    case "connecting":
      return { tone: "warn", message: `${server} ainda está conectando.` };
    case "failed":
      if (!withError) {
        return { tone: "error", message: `${server} continua com falha.` };
      }
      return { tone: "error", message: `${server}: ${outcome.error}` };
    case "missing":
      return { tone: "warn", message: `${server} não está mais neste perfil.` };
  }
}
