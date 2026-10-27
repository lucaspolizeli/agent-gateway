import { useState } from "react";
import type { SkillSet } from "../../contract.ts";
import { FieldHint } from "../../components/FieldHint.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { skillTemplate } from "../../domain/skillTemplate.ts";
import { hintFor, skillDescriptionProblem, skillNameProblem, skillSetNameProblem } from "../../domain/validation.ts";
import { navigate } from "../../router.ts";
import { confirmLeave } from "../../state/unsaved.ts";
import { useCreateSkillSet, useSaveSkill } from "../../state/skills.ts";

export function NewSetForm({ sets, onDone }: { sets: SkillSet[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateSkillSet();
  const trimmed = name.trim();
  let problem = skillSetNameProblem(trimmed);
  if (problem === undefined && sets.some((set) => set.name === trimmed)) {
    problem = "Já existe um conjunto com esse nome.";
  }
  const hint = hintFor(trimmed, problem);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(trimmed, { onSuccess: onDone });
      }}
    >
      <label className="field">
        <span className="field-label">Nome do conjunto</span>
        <input
          autoFocus
          placeholder="nova-empresa"
          value={name}
          aria-invalid={hint !== undefined}
          aria-describedby={hint && "set-name-hint"}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <FieldHint id="set-name-hint" message={hint} />
      <MutationStatus mutation={create} success="Conjunto criado." />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={problem !== undefined || create.isPending}>
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
  const trimmedDescription = description.trim();
  const taken = sets.find((candidate) => candidate.name === set)?.skills.some((skill) => skill.name === trimmed);
  let nameProblem = skillNameProblem(trimmed);
  if (nameProblem === undefined && taken === true) {
    nameProblem = "Já existe neste conjunto.";
  }
  const descriptionProblem = skillDescriptionProblem(trimmedDescription);
  const nameHint = hintFor(trimmed, nameProblem);
  const descriptionHint = hintFor(trimmed, descriptionProblem);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmLeave()) {
          return;
        }
        create.mutate(
          { set, name: trimmed, content: skillTemplate(trimmed, trimmedDescription) },
          {
            onSuccess: () => {
              onDone();
              navigate({ screen: "skills", set, skill: trimmed }, { confirmed: true });
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
          <input
            autoFocus
            placeholder="nome-da-skill"
            value={name}
            aria-invalid={nameHint !== undefined}
            aria-describedby={nameHint && "skill-name-hint"}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldHint id="skill-name-hint" message={nameHint} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Descrição</span>
        <input
          placeholder="Quando usar esta skill"
          value={description}
          aria-invalid={descriptionHint !== undefined}
          aria-describedby={descriptionHint && "skill-description-hint"}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldHint id="skill-description-hint" message={descriptionHint} />
      </label>
      <MutationStatus mutation={create} success="Skill criada." />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={set === "" || nameProblem !== undefined || descriptionProblem !== undefined || create.isPending}>
          Criar skill
        </button>
      </div>
    </form>
  );
}
