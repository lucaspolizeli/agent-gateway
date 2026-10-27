import type { SkillSet } from "../contract.ts";
import { Badge } from "../components/Badge.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { hrefFor } from "../router.ts";
import { useSkillSets } from "../state/skills.ts";
import { NewSetForm, NewSkillForm } from "./skills/CreateForms.tsx";
import { ImportPanel } from "./skills/ImportPanel.tsx";
import { SkillEditor } from "./skills/SkillEditor.tsx";

const scopeLabels: Record<SkillSet["scope"], string> = { user: "usuário", project: "projetos" };

type Props = { set?: string; skill?: string };

export function SkillsScreen({ set, skill }: Props) {
  const sets = useSkillSets();
  return (
    <section>
      <header className="screen-header">
        <h1>Skills</h1>
      </header>
      <QueryState query={sets}>
        {(data) => (
          <>
            <div className="toolbar">
              <NewSetForm sets={data} />
              <NewSkillForm key={set} sets={data} defaultSet={set} />
            </div>
            <div className="split">
              <div className="stack">
                {data.map((skillSet) => (
                  <SetCard key={skillSet.name} skillSet={skillSet} selectedSet={set} selectedSkill={skill} />
                ))}
                <ImportPanel sets={data} />
              </div>
              <EditorPane set={set} skill={skill} setNames={data.map((candidate) => candidate.name)} />
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}

type SetCardProps = { skillSet: SkillSet; selectedSet?: string; selectedSkill?: string };

function SetCard({ skillSet, selectedSet, selectedSkill }: SetCardProps) {
  return (
    <article className="card" aria-current={skillSet.name === selectedSet && selectedSkill === undefined}>
      <header className="card-header">
        <span className="card-title mono">{skillSet.name}</span>
        <Badge tone="accent">escopo: {scopeLabels[skillSet.scope]}</Badge>
      </header>
      <div className="muted small">
        Usado por: {skillSet.usedBy.join(", ")}
        {skillSet.usedBy.length === 0 && "nenhum perfil"}
      </div>
      <ul className="skill-list">
        {skillSet.skills.length === 0 && <li className="muted small">Sem skills.</li>}
        {skillSet.skills.map((summary) => (
          <li key={summary.name}>
            <a
              className="list-item"
              aria-current={skillSet.name === selectedSet && summary.name === selectedSkill}
              href={hrefFor({ screen: "skills", set: skillSet.name, skill: summary.name })}
            >
              <span className="mono">{summary.name}</span>
              <div className="muted small truncate">{summary.description}</div>
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function EditorPane({ set, skill, setNames }: { set?: string; skill?: string; setNames: string[] }) {
  if (set === undefined || skill === undefined) {
    return <div className="placeholder muted">Selecione uma skill para editar.</div>;
  }
  return <SkillEditor key={`${set}/${skill}`} set={set} name={skill} setNames={setNames} />;
}
