import { useState } from "react";
import type { SkillSet } from "../../contract.ts";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { skillTemplate } from "../../domain/skillTemplate.ts";
import { navigate } from "../../router.ts";
import { useCreateSkillSet, useSaveSkill } from "../../state/skills.ts";

export function NewSetForm({ sets }: { sets: SkillSet[] }) {
  const [name, setName] = useState("");
  const create = useCreateSkillSet();
  const trimmed = name.trim();
  const taken = sets.some((set) => set.name === trimmed);
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(trimmed, { onSuccess: () => setName("") });
      }}
    >
      <input
        className="mono"
        placeholder="novo-conjunto"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={trimmed === "" || taken || create.isPending}>
        Criar conjunto
      </button>
      {taken && <span className="muted small">Já existe.</span>}
      <MutationStatus mutation={create} success="Conjunto criado." />
    </form>
  );
}

export function NewSkillForm({ sets, defaultSet }: { sets: SkillSet[]; defaultSet?: string }) {
  const [set, setSet] = useState(defaultSet ?? sets[0]?.name ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useSaveSkill();
  const trimmed = name.trim();
  const taken = sets.find((candidate) => candidate.name === set)?.skills.some((skill) => skill.name === trimmed);
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { set, name: trimmed, content: skillTemplate(trimmed, description.trim()) },
          { onSuccess: () => navigate({ screen: "skills", set, skill: trimmed }) },
        );
      }}
    >
      <select value={set} onChange={(event) => setSet(event.target.value)}>
        {sets.map((candidate) => (
          <option key={candidate.name} value={candidate.name}>
            {candidate.name}
          </option>
        ))}
      </select>
      <input
        className="mono"
        placeholder="nome-da-skill"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className="grow"
        placeholder="descrição: quando usar esta skill"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <button type="submit" disabled={set === "" || trimmed === "" || taken === true || create.isPending}>
        Criar skill
      </button>
      {taken === true && <span className="muted small">Já existe neste conjunto.</span>}
      <MutationStatus mutation={create} success="Skill criada." />
    </form>
  );
}
