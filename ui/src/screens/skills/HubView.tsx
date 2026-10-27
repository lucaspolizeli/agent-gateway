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

const scopeLabels: Record<SkillSet["scope"], string> = { user: "user", project: "projects" };

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
        <ListPane label="Hub skills">
          {sets.length === 0 && (
            <DetailPlaceholder
              className="min-h-0 border-0 p-4"
              icon={<FolderPlusIcon />}
              title="No skill sets yet"
              description="Create a skill set to hold skills."
              action={
                <Button type="button" size="sm" onClick={() => onDialog({ kind: "set" })}>
                  <FolderPlusIcon />
                  New skill set
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
  let usedBy = "No profile uses it";
  if (skillSet.usedBy.length > 0) {
    usedBy = `Used by ${skillSet.usedBy.join(", ")}`;
  }
  return (
    <section aria-label={`Skill set ${skillSet.name}`} className="flex flex-col gap-1">
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
          <EmptyDescription className="text-xs">No skills yet</EmptyDescription>
          <EmptyContent className="ml-auto w-auto flex-row gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => onDialog({ kind: "skill", set: skillSet.name })}>
              <PlusIcon />
              New skill
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => onDialog({ kind: "import", toSet: skillSet.name })}
            >
              <DownloadIcon />
              Import
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
          <span className="block truncate text-sm font-medium">{summary.name}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground" title={summary.description}>
            {summary.description}
          </span>
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
        title="Select a skill"
        description="Choose a skill from the list to edit its SKILL.md, move it to another skill set or delete it."
        action={
          <Button type="button" variant="outline" onClick={() => onDialog({ kind: "skill", set })}>
            <PlusIcon />
            New skill
          </Button>
        }
      />
    );
  }
  return <SkillEditor key={`${set}/${skill}`} set={set} name={skill} setNames={sets.map((candidate) => candidate.name)} />;
}
