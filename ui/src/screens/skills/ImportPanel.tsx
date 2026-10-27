import { useState } from "react";
import type { ImportableSkill, SkillSet } from "../../contract.ts";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { useImportableSkills, useImportSkill } from "../../state/skills.ts";

const DEFAULT_IMPORT_SET = "global";

export function ImportPanel({ sets }: { sets: SkillSet[] }) {
  const importable = useImportableSkills();
  return (
    <div className="import-panel">
      <p className="muted small">Pastas reais nos diretórios de skills do usuário que o hub ainda não gerencia.</p>
      <QueryState query={importable}>
        {(skills) => (
          <ul className="import-list">
            {skills.length === 0 && <li className="muted">Nada para importar.</li>}
            {skills.map((skill) => (
              <ImportRow key={skill.path} skill={skill} sets={sets} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function defaultTarget(sets: SkillSet[]): string {
  if (sets.some((set) => set.name === DEFAULT_IMPORT_SET)) {
    return DEFAULT_IMPORT_SET;
  }
  return sets[0]?.name ?? "";
}

function ImportRow({ skill, sets }: { skill: ImportableSkill; sets: SkillSet[] }) {
  const [toSet, setToSet] = useState(() => defaultTarget(sets));
  const run = useImportSkill();
  return (
    <li className="import-row">
      <div className="import-info">
        <div className="row">
          <b>{skill.name}</b>
          <span className="muted truncate">{skill.description}</span>
        </div>
        <div className="muted small mono truncate" title={skill.path}>
          {skill.path}
        </div>
        <MutationStatus mutation={run} success="Importada." />
      </div>
      <select value={toSet} aria-label={`Conjunto de destino de ${skill.name}`} onChange={(event) => setToSet(event.target.value)}>
        {sets.map((set) => (
          <option key={set.name} value={set.name}>
            {set.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={toSet === "" || run.isPending} onClick={() => run.mutate({ path: skill.path, toSet })}>
        Importar
      </button>
    </li>
  );
}
