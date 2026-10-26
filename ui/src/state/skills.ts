import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client.ts";
import type { SkillSet } from "../contract.ts";
import { queryKeys } from "./keys.ts";

export function useSkillSets() {
  return useQuery({ queryKey: queryKeys.skillSets, queryFn: api.listSkillSets });
}

export function useSkill(set: string, name: string) {
  return useQuery({ queryKey: queryKeys.skill(set, name), queryFn: () => api.getSkill(set, name) });
}

export function useImportableSkills() {
  return useQuery({ queryKey: queryKeys.importable, queryFn: api.listImportableSkills });
}

/** `onDone` lives on the hook because moving or deleting a skill unmounts the editor that asked for it. */
function useSetsMutation<TVars>(run: (vars: TVars) => Promise<SkillSet[]>, onDone?: (vars: TVars) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (sets, vars) => {
      client.setQueryData(queryKeys.skillSets, sets);
      onDone?.(vars);
      await client.invalidateQueries({ queryKey: queryKeys.importable });
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
  return useSetsMutation((vars: { path: string; toSet: string }) => api.importSkill(vars.path, vars.toSet));
}

export function useSaveSkill() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { set: string; name: string; content: string }) =>
      api.saveSkill(vars.set, vars.name, vars.content),
    onSuccess: async (doc) => {
      client.setQueryData(queryKeys.skill(doc.set, doc.name), doc);
      await client.invalidateQueries({ queryKey: queryKeys.skillSets });
    },
  });
}
