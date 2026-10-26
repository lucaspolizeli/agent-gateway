import { useState } from "react";
import type { ImportableSkill, SkillSet } from "../../contract.ts";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { useImportableSkills, useImportSkill } from "../../state/skills.ts";

const DEFAULT_IMPORT_SET = "global";

export function ImportPanel({ sets }: { sets: SkillSet[] }) {
  const importable = useImportableSkills();
  return (
    <section className="panel">
      <h3>Importar</h3>
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
    </section>
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
      <div>
        <span className="mono">{skill.name}</span> <span className="muted small">{skill.description}</span>
        <div className="muted small mono">{skill.path}</div>
      </div>
      <div className="row">
        <span className="muted small">para</span>
        <select value={toSet} onChange={(event) => setToSet(event.target.value)}>
          {sets.map((set) => (
            <option key={set.name} value={set.name}>
              {set.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={toSet === "" || run.isPending}
          onClick={() => run.mutate({ path: skill.path, toSet })}
        >
          Importar
        </button>
        <MutationStatus mutation={run} success="Importada." />
      </div>
    </li>
  );
}
