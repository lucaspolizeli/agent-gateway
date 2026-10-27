import { useState } from "react";
import type { SkillSet } from "../../contract.ts";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { skillTemplate } from "../../domain/skillTemplate.ts";
import { navigate } from "../../router.ts";
import { useCreateSkillSet, useSaveSkill } from "../../state/skills.ts";

export function NewSetForm({ sets, onDone }: { sets: SkillSet[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateSkillSet();
  const trimmed = name.trim();
  const taken = sets.some((set) => set.name === trimmed);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(trimmed, { onSuccess: onDone });
      }}
    >
      <label className="field">
        <span className="field-label">Nome do conjunto</span>
        <input autoFocus placeholder="nova-empresa" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {taken && <span className="status-line error">Já existe um conjunto com esse nome.</span>}
      <MutationStatus mutation={create} success="Conjunto criado." />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={trimmed === "" || taken || create.isPending}>
          Criar conjunto
        </button>
      </div>
    </form>
  );
}

type NewSkillProps = { sets: SkillSet[]; defaultSet?: string; onDone: () => void };

export function NewSkillForm({ sets, defaultSet, onDone }: NewSkillProps) {
  const [set, setSet] = useState(defaultSet ?? sets[0]?.name ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useSaveSkill();
  const trimmed = name.trim();
  const taken = sets.find((candidate) => candidate.name === set)?.skills.some((skill) => skill.name === trimmed);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { set, name: trimmed, content: skillTemplate(trimmed, description.trim()) },
          {
            onSuccess: () => {
              onDone();
              navigate({ screen: "skills", set, skill: trimmed });
            },
          },
        );
      }}
    >
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Conjunto</span>
          <select value={set} onChange={(event) => setSet(event.target.value)}>
            {sets.map((candidate) => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Nome</span>
          <input autoFocus placeholder="nome-da-skill" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Descrição</span>
        <input
          placeholder="Quando usar esta skill"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {taken === true && <span className="status-line error">Já existe neste conjunto.</span>}
      <MutationStatus mutation={create} success="Skill criada." />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={set === "" || trimmed === "" || taken === true || create.isPending}>
          Criar skill
        </button>
      </div>
    </form>
  );
}
