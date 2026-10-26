import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { SecretsView } from "../contract.ts";
import { queryKeys } from "./keys.ts";

export function useSecrets() {
  return useQuery({ queryKey: queryKeys.secrets, queryFn: api.listSecrets });
}

function replaceView(views: SecretsView[] | undefined, next: SecretsView): SecretsView[] {
  const others = (views ?? []).filter((view) => view.profile !== next.profile);
  return [...others, next];
}

/** Secrets fill `${VAR}` references, so they change `missingSecrets` and upstream connections. */
function useSecretMutation<TVars>(run: (vars: TVars) => Promise<SecretsView>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (view) => {
      client.setQueryData<SecretsView[]>(queryKeys.secrets, (views) => replaceView(views, view));
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.profiles }),
        client.invalidateQueries({ queryKey: queryKeys.statusAll }),
      ]);
    },
  });
}

export function useSetSecret() {
  return useSecretMutation((vars: { profile: string; key: string; value: string }) =>
    api.setSecret(vars.profile, vars.key, vars.value),
  );
}

export function useDeleteSecret() {
  return useSecretMutation((vars: { profile: string; key: string }) => api.deleteSecret(vars.profile, vars.key));
}
