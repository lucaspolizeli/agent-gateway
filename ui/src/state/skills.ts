import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { SkillSet } from "../contract.ts";
import { queryKeys } from "./keys.ts";
import { STATUS_POLL_MS } from "./profiles.ts";

export function useSkillSets() {
  return useQuery({ queryKey: queryKeys.skillSets, queryFn: api.listSkillSets });
}

/** Polled so a SKILL.md edited on disk reaches the open editor. */
export function useSkill(set: string, name: string) {
  return useQuery({
    queryKey: queryKeys.skill(set, name),
    queryFn: () => api.getSkill(set, name),
    refetchInterval: STATUS_POLL_MS,
  });
}

export function useImportableSkills() {
  return useQuery({ queryKey: queryKeys.importable, queryFn: api.listImportableSkills });
}

export function useUserSkills() {
  return useQuery({ queryKey: queryKeys.userSkills, queryFn: api.listUserSkills });
}

/** A mutation, not a query: each run asks every CLI again and takes seconds, so it only runs on request. */
export function useSkillsDoctor() {
  return useMutation({ mutationFn: (dir: string | undefined) => api.runSkillsDoctor(dir) });
}

/** Whatever changes the hub changes what the user level sees and what is left to import. */
function invalidateUserLevel(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.importable }),
    client.invalidateQueries({ queryKey: queryKeys.userSkills }),
  ]);
}

/** `onDone` lives on the hook because moving or deleting a skill unmounts the editor that asked for it. */
function useSetsMutation<TVars>(run: (vars: TVars) => Promise<SkillSet[]>, onDone?: (vars: TVars) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (sets, vars) => {
      client.setQueryData(queryKeys.skillSets, sets);
      onDone?.(vars);
      await invalidateUserLevel(client);
    },
  });
}

export function useCreateSkillSet() {
  return useSetsMutation((name: string) => api.createSkillSet(name));
}

type MoveVars = { set: string; name: string; toSet: string };
type SkillRef = { set: string; name: string };

export function useMoveSkill(onDone?: (vars: MoveVars) => void) {
  return useSetsMutation((vars: MoveVars) => api.moveSkill(vars.set, vars.name, vars.toSet), onDone);
}

export function useDeleteSkill(onDone?: (vars: SkillRef) => void) {
  return useSetsMutation((vars: SkillRef) => api.deleteSkill(vars.set, vars.name), onDone);
}

export function useImportSkill() {
  return useSetsMutation((vars: { name: string; path: string; toSet: string }) => api.importSkill(vars.path, vars.toSet));
}

export function useSaveSkill() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { set: string; name: string; content: string }) =>
      api.saveSkill(vars.set, vars.name, vars.content),
    onSuccess: async (doc) => {
      client.setQueryData(queryKeys.skill(doc.set, doc.name), doc);
      await Promise.all([client.invalidateQueries({ queryKey: queryKeys.skillSets }), invalidateUserLevel(client)]);
    },
  });
}
