import { DownloadIcon, FolderPlusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { navigate, skillsViews, type Route, type SkillsView } from "../router.ts";
import { useImportableSkills, useSkillSets } from "../state/skills.ts";
import { NewSetDialog, NewSkillDialog } from "./skills/CreateForms.tsx";
import { DoctorView } from "./skills/DoctorView.tsx";
import { HubView } from "./skills/HubView.tsx";
import { ImportDialog } from "./skills/ImportDialog.tsx";
import { UserSkillsView } from "./skills/UserSkillsView.tsx";

export const skillsViewLabels: Record<SkillsView, string> = { hub: "Hub", todas: "Todas", diagnostico: "Diagnóstico" };

const descriptions: Record<SkillsView, string> = {
  hub: "Conjuntos de SKILL.md: o global vai para o usuário, os outros entram nos projetos pelos perfis.",
  todas: "Toda skill que os CLIs enxergam no nível do usuário, e de onde cada uma vem.",
  diagnostico: "Pergunta a Claude, Codex e Grok quais skills eles realmente descobrem.",
};

export type SkillsDialog = { kind: "skill"; set?: string } | { kind: "set" } | { kind: "import"; toSet?: string };

function startingSet(dialog: SkillsDialog | undefined): string | undefined {
  switch (dialog?.kind) {
    case "skill":
      return dialog.set;
    case "import":
      return dialog.toSet;
    case "set":
    case undefined:
      return undefined;
  }
}

type SkillsRoute = Extract<Route, { screen: "skills" }>;

function isView(value: string): value is SkillsView {
  return skillsViews.some((view) => view === value);
}

export function SkillsScreen({ route }: { route: SkillsRoute }) {
  const sets = useSkillSets();
  const importable = useImportableSkills();
  const [dialog, setDialog] = useState<SkillsDialog | undefined>(undefined);
  const data = sets.data ?? [];
  let selectedSet: string | undefined = undefined;
  let selectedSkill: string | undefined = undefined;
  if (route.view === "hub") {
    selectedSet = route.set;
    selectedSkill = route.skill;
  }
  const importCount = importable.data?.length ?? 0;
  const close = () => setDialog(undefined);
  return (
    <>
      <PageHeader
        title="Skills"
        description={descriptions[route.view]}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setDialog({ kind: "import" })}>
              <DownloadIcon />
              Importar
              {importCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 tabular-nums" aria-label={`${importCount} para importar`}>
                  {importCount}
                </Badge>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDialog({ kind: "set" })}>
              <FolderPlusIcon />
              Novo conjunto
            </Button>
            <Button type="button" onClick={() => setDialog({ kind: "skill", set: selectedSet })}>
              <PlusIcon />
              Nova skill
            </Button>
          </>
        }
      />
      <Tabs
        value={route.view}
        onValueChange={(next) => {
          if (isView(next)) {
            void navigate({ screen: "skills", view: next });
          }
        }}
      >
        <TabsList>
          {skillsViews.map((view) => (
            <TabsTrigger key={view} value={view} className="px-3">
              {skillsViewLabels[view]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="hub" className="pt-2">
          <QueryState query={sets}>
            {(loaded) => (
              <HubView sets={loaded} selectedSet={selectedSet} selectedSkill={selectedSkill} onDialog={setDialog} />
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="todas" className="pt-2">
          <UserSkillsView sets={data} />
        </TabsContent>
        <TabsContent value="diagnostico" className="pt-2">
          <DoctorView />
        </TabsContent>
      </Tabs>
      <NewSkillDialog
        key={`skill:${startingSet(dialog)}`}
        open={dialog?.kind === "skill"}
        sets={data}
        defaultSet={startingSet(dialog) ?? selectedSet}
        onClose={close}
      />
      <NewSetDialog open={dialog?.kind === "set"} sets={data} onClose={close} />
      <ImportDialog
        key={`import:${startingSet(dialog)}`}
        open={dialog?.kind === "import"}
        sets={data}
        toSet={startingSet(dialog)}
        onClose={close}
      />
    </>
  );
}
