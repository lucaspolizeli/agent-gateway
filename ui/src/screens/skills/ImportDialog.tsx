import { DownloadIcon, PackageOpenIcon } from "lucide-react";
import { useState } from "react";
import type { ImportableSkill, SkillSet } from "../../contract.ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { withFeedback, type Verdict } from "../../components/feedback.ts";
import { QueryState } from "../../components/QueryState.tsx";
import { navigate } from "../../router.ts";
import { useImportableSkills, useImportSkill } from "../../state/skills.ts";

const DEFAULT_IMPORT_SET = "global";

export function defaultImportTarget(sets: SkillSet[], preferred?: string): string {
  if (preferred !== undefined && sets.some((set) => set.name === preferred)) {
    return preferred;
  }
  if (sets.some((set) => set.name === DEFAULT_IMPORT_SET)) {
    return DEFAULT_IMPORT_SET;
  }
  return sets[0]?.name ?? "";
}

/** The imported skill leaves every list, so the toast carries the way to it. */
export function importedVerdict(name: string, toSet: string): Verdict {
  return {
    tone: "ok",
    message: `${name} imported into ${toSet}.`,
    action: { label: "Open", onClick: () => void navigate({ screen: "skills", view: "hub", set: toSet, skill: name }) },
  };
}

type Props = { open: boolean; sets: SkillSet[]; toSet?: string; onClose: () => void };

export function ImportDialog({ open, sets, toSet, onClose }: Props) {
  const importable = useImportableSkills();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import skills</DialogTitle>
          <DialogDescription>
            Real folders in your user-level skill folders that the hub does not manage yet. Import moves the folder into the
            chosen skill set and links it again.
          </DialogDescription>
        </DialogHeader>
        <QueryState query={importable}>
          {(skills) => {
            if (skills.length === 0) {
              return (
                <Empty className="border p-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageOpenIcon />
                    </EmptyMedia>
                    <EmptyTitle>Nothing to import</EmptyTitle>
                    <EmptyDescription>Every user-level skill is already in the hub or managed by the skills CLI.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              );
            }
            return (
              <ScrollArea className="max-h-[60svh] [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
                <ItemGroup className="gap-2 pr-3">
                  {skills.map((skill) => (
                    <ImportRow key={skill.path} skill={skill} sets={sets} preferred={toSet} />
                  ))}
                </ItemGroup>
              </ScrollArea>
            );
          }}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

type RowProps = { skill: ImportableSkill; sets: SkillSet[]; preferred?: string };

function ImportRow({ skill, sets, preferred }: RowProps) {
  const [target, setTarget] = useState(() => defaultImportTarget(sets, preferred));
  const run = useImportSkill();
  return (
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle>{skill.name}</ItemTitle>
        <ItemDescription className="line-clamp-1">{skill.description}</ItemDescription>
        <ItemDescription className="truncate font-mono text-xs" title={skill.path}>
          {skill.path}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger size="sm" className="w-36" aria-label={`Target skill set for ${skill.name}`}>
            <SelectValue placeholder="Skill set" />
          </SelectTrigger>
          <SelectContent>
            {sets.map((set) => (
              <SelectItem key={set.name} value={set.name}>
                {set.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={target === "" || run.isPending}
          onClick={() =>
            void withFeedback(run.mutateAsync({ name: skill.name, path: skill.path, toSet: target }), () =>
              importedVerdict(skill.name, target),
            )
          }
        >
          {run.isPending && <Spinner />}
          {!run.isPending && <DownloadIcon />}
          Import
        </Button>
      </ItemActions>
    </Item>
  );
}
