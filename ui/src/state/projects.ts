import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import { queryKeys } from "./keys.ts";

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
}

function useProjectsMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useInstallProject() {
  return useProjectsMutation(api.installProject);
}

export function useUninstallProject() {
  return useProjectsMutation(api.uninstallProject);
}

export function useSyncAll() {
  return useProjectsMutation(() => api.syncAll());
}
