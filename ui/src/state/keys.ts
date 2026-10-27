export const queryKeys = {
  config: ["config"],
  profiles: ["profiles"],
  statusAll: ["status"],
  status: (profile: string) => ["status", profile],
  secrets: ["secrets"],
  skillSets: ["skills"],
  skill: (set: string, name: string) => ["skill", set, name],
  importable: ["importable"],
  userSkills: ["skills-user"],
  projects: ["projects"],
} as const;
