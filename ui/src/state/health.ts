import { useQueries } from "@tanstack/react-query";
import type { ProfileStatus } from "../contract.ts";
import { healthSummary, type HealthSummary } from "../domain/health.ts";
import { useProfiles, statusQuery } from "./profiles.ts";

export type GatewayHealth = {
  summary: HealthSummary;
  statuses: Map<string, ProfileStatus>;
  isPending: boolean;
};

/** Every profile's live status, shared with `useProfileStatus` through the same query keys. */
export function useGatewayHealth(): GatewayHealth {
  const profiles = useProfiles();
  const views = profiles.data ?? [];
  const results = useQueries({ queries: views.map((view) => statusQuery(view.name)) });
  const statuses = new Map<string, ProfileStatus>();
  for (const result of results) {
    if (result.data !== undefined) {
      statuses.set(result.data.profile.name, result.data);
    }
  }
  return {
    summary: healthSummary(views, [...statuses.values()]),
    statuses,
    isPending: profiles.isPending,
  };
}
