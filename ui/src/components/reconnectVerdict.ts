import type { ProfileStatus } from "../contract.ts";
import { reconnectOutcome } from "../domain/health.ts";
import type { Verdict } from "./feedback.ts";

export type ReconnectVars = { profile: string; server: string };

/** Reconnect answers with the whole profile status, so success means this upstream is `ready`. */
export function reconnectVerdict(status: ProfileStatus, vars: ReconnectVars): Verdict {
  const { server } = vars;
  const outcome = reconnectOutcome(status, server);
  switch (outcome.kind) {
    case "ready":
      return { tone: "ok", message: `${server} reconnected.` };
    case "connecting":
      return { tone: "warn", message: `${server} is still connecting.` };
    case "failed":
      return { tone: "error", message: `${server} still fails.`, description: outcome.error };
    case "missing":
      return { tone: "warn", message: `${server} is no longer in this profile.` };
  }
}
