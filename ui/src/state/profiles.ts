import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { ProfileStatus } from "../contract.ts";
import { queryKeys } from "./keys.ts";

export const STATUS_POLL_MS = 3000;

/** Polled with the statuses: `missingSecrets` changes whenever a secrets file or `gateway.json` does. */
export function useProfiles() {
  return useQuery({ queryKey: queryKeys.profiles, queryFn: api.listProfiles, refetchInterval: STATUS_POLL_MS });
}

/** Polls while the tab is visible: React Query pauses intervals for hidden documents. */
export function statusQuery(profile: string) {
  return {
    queryKey: queryKeys.status(profile),
    queryFn: () => api.getProfileStatus(profile, false),
    refetchInterval: STATUS_POLL_MS,
  };
}

export function useProfileStatus(profile: string) {
  return useQuery(statusQuery(profile));
}

function useStatusMutation<TVars>(run: (vars: TVars) => Promise<ProfileStatus>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (status) => {
      client.setQueryData(queryKeys.status(status.profile.name), status);
    },
  });
}

export function useStartProfile() {
  return useStatusMutation((profile: string) => api.getProfileStatus(profile, true));
}

export function useReconnectServer() {
  return useStatusMutation((vars: { profile: string; server: string }) =>
    api.reconnectServer(vars.profile, vars.server),
  );
}
