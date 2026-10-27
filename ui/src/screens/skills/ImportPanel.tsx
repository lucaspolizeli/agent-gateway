import { useState } from "react";
import type { ImportableSkill, SkillSet } from "../../contract.ts";
import { MutationStatus, type Verdict } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { hrefFor } from "../../router.ts";
import { useImportableSkills, useImportSkill } from "../../state/skills.ts";

const DEFAULT_IMPORT_SET = "global";

type ImportVars = { name: string; path: string; toSet: string };

export function ImportPanel({ sets, onNavigate }: { sets: SkillSet[]; onNavigate: () => void }) {
  const importable = useImportableSkills();
  const run = useImportSkill();

  // The imported row leaves the list, so the outcome has to live above the rows.
  function imported(_: unknown, vars: ImportVars | undefined): Verdict {
    if (vars === undefined) {
      return { tone: "ok", message: "Importada." };
    }
    return {
      tone: "ok",
      message: (
        <>
          Importada:{" "}
          <a href={hrefFor({ screen: "skills", set: vars.toSet, skill: vars.name })} onClick={onNavigate}>
            {vars.name}
          </a>{" "}
          em {vars.toSet}.
        </>
      ),
    };
  }

  return (
    <div className="import-panel">
      <p className="muted small">Pastas reais nos diretórios de skills do usuário que o hub ainda não gerencia.</p>
      <MutationStatus mutation={run} verdict={imported} />
      <QueryState query={importable}>
        {(skills) => (
          <ul className="import-list">
            {skills.length === 0 && <li className="muted">Nada para importar.</li>}
            {skills.map((skill) => (
              <ImportRow
                key={skill.path}
                skill={skill}
                sets={sets}
                busy={run.isPending}
                onImport={(toSet) => run.mutate({ name: skill.name, path: skill.path, toSet })}
              />
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

type RowProps = { skill: ImportableSkill; sets: SkillSet[]; busy: boolean; onImport: (toSet: string) => void };

function ImportRow({ skill, sets, busy, onImport }: RowProps) {
  const [toSet, setToSet] = useState(() => defaultTarget(sets));
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
      </div>
      <select value={toSet} aria-label={`Conjunto de destino de ${skill.name}`} onChange={(event) => setToSet(event.target.value)}>
        {sets.map((set) => (
          <option key={set.name} value={set.name}>
            {set.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={toSet === "" || busy} onClick={() => onImport(toSet)}>
        Importar
      </button>
    </li>
  );
}
