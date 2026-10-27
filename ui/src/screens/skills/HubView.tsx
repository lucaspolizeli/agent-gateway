import { BookOpenIcon, DownloadIcon, FolderPlusIcon, PlusIcon } from "lucide-react";
import { Fragment } from "react";
import type { SkillSet } from "../../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { DetailPlaceholder, ListLink, ListPane, SplitView } from "../../components/SplitView.tsx";
import { hrefFor } from "../../router.ts";
import type { SkillsDialog } from "../SkillsScreen.tsx";
import { SkillEditor } from "./SkillEditor.tsx";

const scopeLabels: Record<SkillSet["scope"], string> = { user: "usuário", project: "projetos" };

type Props = {
  sets: SkillSet[];
  selectedSet?: string;
  selectedSkill?: string;
  onDialog: (dialog: SkillsDialog) => void;
};

export function HubView({ sets, selectedSet, selectedSkill, onDialog }: Props) {
  return (
    <SplitView
      list={
        <ListPane label="Skills do hub">
          {sets.length === 0 && (
            <DetailPlaceholder
              className="min-h-0 border-0 p-4"
              icon={<FolderPlusIcon />}
              title="Nenhum conjunto"
              description="Crie um conjunto para guardar skills."
              action={
                <Button type="button" size="sm" onClick={() => onDialog({ kind: "set" })}>
                  <FolderPlusIcon />
                  Novo conjunto
                </Button>
              }
            />
          )}
          {sets.map((skillSet, index) => (
            <Fragment key={skillSet.name}>
              {index > 0 && <Separator className="my-1" />}
              <SetGroup skillSet={skillSet} selectedSet={selectedSet} selectedSkill={selectedSkill} onDialog={onDialog} />
            </Fragment>
          ))}
        </ListPane>
      }
      detail={<EditorPane set={selectedSet} skill={selectedSkill} sets={sets} onDialog={onDialog} />}
    />
  );
}

type SetGroupProps = Omit<Props, "sets"> & { skillSet: SkillSet };

function SetGroup({ skillSet, selectedSet, selectedSkill, onDialog }: SetGroupProps) {
  let usedBy = "Nenhum perfil usa";
  if (skillSet.usedBy.length > 0) {
    usedBy = `Usado por ${skillSet.usedBy.join(", ")}`;
  }
  return (
    <section aria-label={`Conjunto ${skillSet.name}`} className="flex flex-col gap-1">
      <header className="flex flex-col gap-0.5 px-2.5 pt-1.5">
        <span className="flex items-center gap-2">
          <a
            className="text-sm font-semibold underline-offset-4 hover:underline"
            href={hrefFor({ screen: "skills", view: "hub", set: skillSet.name })}
          >
            {skillSet.name}
          </a>
          <Badge variant="outline">{scopeLabels[skillSet.scope]}</Badge>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">{skillSet.skills.length}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">{usedBy}</span>
      </header>
      {skillSet.skills.length === 0 && (
        <Empty className="flex-row flex-wrap justify-between gap-2 rounded-md border border-dashed px-2.5 py-1.5">
          <EmptyDescription className="text-xs">Sem skills</EmptyDescription>
          <EmptyContent className="ml-auto w-auto flex-row gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => onDialog({ kind: "skill", set: skillSet.name })}>
              <PlusIcon />
              Nova skill
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => onDialog({ kind: "import", toSet: skillSet.name })}
            >
              <DownloadIcon />
              Importar
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {skillSet.skills.map((summary) => (
        <ListLink
          key={summary.name}
          href={hrefFor({ screen: "skills", view: "hub", set: skillSet.name, skill: summary.name })}
          current={skillSet.name === selectedSet && summary.name === selectedSkill}
        >
          <span className="truncate text-sm font-medium">{summary.name}</span>
          <span className="truncate text-xs text-muted-foreground">{summary.description}</span>
        </ListLink>
      ))}
    </section>
  );
}

type PaneProps = { set?: string; skill?: string; sets: SkillSet[]; onDialog: (dialog: SkillsDialog) => void };

function EditorPane({ set, skill, sets, onDialog }: PaneProps) {
  if (set === undefined || skill === undefined) {
    return (
      <DetailPlaceholder
        icon={<BookOpenIcon />}
        title="Selecione uma skill"
        description="Escolha uma skill na lista para editar o SKILL.md, mover para outro conjunto ou excluir."
        action={
          <Button type="button" variant="outline" onClick={() => onDialog({ kind: "skill", set })}>
            <PlusIcon />
            Nova skill
          </Button>
        }
      />
    );
  }
  return <SkillEditor key={`${set}/${skill}`} set={set} name={skill} setNames={sets.map((candidate) => candidate.name)} />;
}
