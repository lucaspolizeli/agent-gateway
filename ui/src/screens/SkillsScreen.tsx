import type { SkillSet } from "../contract.ts";
import { Badge } from "../components/Badge.tsx";
import { CountBadge } from "../components/CountBadge.tsx";
import { PlusIcon } from "../components/Icons.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Popover } from "../components/Popover.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { hrefFor } from "../router.ts";
import { useImportableSkills, useSkillSets } from "../state/skills.ts";
import { NewSetForm, NewSkillForm } from "./skills/CreateForms.tsx";
import { ImportPanel } from "./skills/ImportPanel.tsx";
import { SkillEditor } from "./skills/SkillEditor.tsx";

const scopeLabels: Record<SkillSet["scope"], string> = { user: "usuário", project: "projetos" };

type Props = { set?: string; skill?: string };

export function SkillsScreen({ set, skill }: Props) {
  const sets = useSkillSets();
  const importable = useImportableSkills();
  const data = sets.data ?? [];
  return (
    <section className="skills-page">
      <PageHeader
        title="Skills"
        description="Conjuntos de SKILL.md: o global vai para o usuário, os outros entram nos projetos pelos perfis."
        actions={
          <>
            <Popover
              title="Importar skills"
              wide
              label={
                <>
                  Importar
                  <CountBadge count={importable.data?.length ?? 0} tone="accent" label="skills para importar" />
                </>
              }
            >
              {(close) => <ImportPanel sets={data} onNavigate={close} />}
            </Popover>
            <Popover title="Novo conjunto" label="Novo conjunto">
              {(close) => <NewSetForm sets={data} onDone={close} />}
            </Popover>
            <Popover
              title="Nova skill"
              triggerClassName="primary"
              label={
                <>
                  <PlusIcon />
                  Nova skill
                </>
              }
            >
              {(close) => <NewSkillForm sets={data} defaultSet={set} onDone={close} />}
            </Popover>
          </>
        }
      />
      <QueryState query={sets}>
        {(loaded) => (
          <div className="split skills-split">
            <nav className="master skill-tree" aria-label="Skills">
              {loaded.length === 0 && <p className="empty">Nenhum conjunto.</p>}
              {loaded.map((skillSet) => (
                <SetGroup key={skillSet.name} skillSet={skillSet} selectedSet={set} selectedSkill={skill} />
              ))}
            </nav>
            <EditorPane set={set} skill={skill} setNames={loaded.map((candidate) => candidate.name)} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

type SetGroupProps = { skillSet: SkillSet; selectedSet?: string; selectedSkill?: string };

function SetGroup({ skillSet, selectedSet, selectedSkill }: SetGroupProps) {
  return (
    <div className="set-group">
      <div className="set-header">
        <span className="set-name">{skillSet.name}</span>
        <Badge tone="neutral">{scopeLabels[skillSet.scope]}</Badge>
        <span className="spacer" />
        <span className="count count-neutral">{skillSet.skills.length}</span>
      </div>
      <div className="set-used-by">
        {skillSet.usedBy.length === 0 && "Nenhum perfil usa"}
        {skillSet.usedBy.length > 0 && `Usado por ${skillSet.usedBy.join(", ")}`}
      </div>
      <ul className="set-skills">
        {skillSet.skills.length === 0 && <li className="muted small set-empty">Sem skills.</li>}
        {skillSet.skills.map((summary) => (
          <li key={summary.name}>
            <a
              className="skill-item"
              aria-current={skillSet.name === selectedSet && summary.name === selectedSkill && "page"}
              href={hrefFor({ screen: "skills", set: skillSet.name, skill: summary.name })}
            >
              <span className="skill-item-name">{summary.name}</span>
              <span className="skill-item-description truncate">{summary.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditorPane({ set, skill, setNames }: { set?: string; skill?: string; setNames: string[] }) {
  if (set === undefined || skill === undefined) {
    return <div className="placeholder">Selecione uma skill para editar.</div>;
  }
  return <SkillEditor key={`${set}/${skill}`} set={set} name={skill} setNames={setNames} />;
}
