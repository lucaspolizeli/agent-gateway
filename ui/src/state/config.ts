import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { ConfigEdit, ResolvedProfileView } from "../contract.ts";
import { queryKeys } from "./keys.ts";
import { STATUS_POLL_MS } from "./profiles.ts";

/** Polled so edits made to `gateway.json` outside the UI reach the open forms. */
export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.getConfig, refetchInterval: STATUS_POLL_MS });
}

/**
 * Every config edit can change resolved profiles and what each running gateway exposes.
 * `onDone` lives on the hook, not on `mutate`, because writing the new config can unmount
 * the caller (a removed server's editor), and React Query drops `mutate` callbacks on unmount.
 */
export function useConfigEdit<TEdit extends ConfigEdit = ConfigEdit>(onDone?: (edit: TEdit) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (edit: TEdit) => api.editConfig(edit),
    onSuccess: async (config, edit) => {
      client.setQueryData(queryKeys.config, config);
      if (edit.op === "removeProfile") {
        // Dropped before the refetch below, which would otherwise ask the API for a profile that is gone.
        client.setQueryData<ResolvedProfileView[]>(queryKeys.profiles, (views) =>
          views?.filter((view) => view.name !== edit.name),
        );
        client.removeQueries({ queryKey: queryKeys.status(edit.name) });
      }
      onDone?.(edit);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.profiles }),
        client.invalidateQueries({ queryKey: queryKeys.statusAll }),
        client.invalidateQueries({ queryKey: queryKeys.secrets }),
        client.invalidateQueries({ queryKey: queryKeys.skillSets }),
      ]);
    },
  });
}

export function useServerTest() {
  return useMutation({ mutationFn: api.testServer });
}
