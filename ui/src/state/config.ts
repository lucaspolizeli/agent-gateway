import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { ConfigEdit } from "../contract.ts";
import { queryKeys } from "./keys.ts";

export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.getConfig });
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
