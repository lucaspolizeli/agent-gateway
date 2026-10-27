import { ArrowRightLeftIcon, SaveIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { SkillDocument } from "../../contract.ts";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ActionBar, DirtyIndicator } from "../../components/ActionBar.tsx";
import { ConfirmAction } from "../../components/ConfirmAction.tsx";
import { withFeedback } from "../../components/feedback.ts";
import { focusFirstField } from "../../components/focusFirstField.ts";
import { QueryState } from "../../components/QueryState.tsx";
import { StaleNotice } from "../../components/StaleNotice.tsx";
import { hrefFor, navigate } from "../../router.ts";
import { useDeleteSkill, useMoveSkill, useSaveSkill, useSkill } from "../../state/skills.ts";
import { useSyncedDraft } from "../../state/syncedDraft.ts";
import { confirmLeave, useUnsavedGuard } from "../../state/unsaved.ts";

type Props = { set: string; name: string; setNames: string[] };

export function SkillEditor({ set, name, setNames }: Props) {
  const skill = useSkill(set, name);
  return (
    <QueryState query={skill}>
      {(doc) => <LoadedEditor key={`${doc.set}/${doc.name}`} doc={doc} setNames={setNames} />}
    </QueryState>
  );
}

const isMac = navigator.platform.toLowerCase().includes("mac");
let saveShortcut = "Ctrl+S";
if (isMac) {
  saveShortcut = "⌘S";
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s";
}

function LoadedEditor({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const {
    draft: content,
    setDraft: setContent,
    dirty,
    stale,
    reload,
  } = useSyncedDraft({
    source: doc.content,
    toDraft: (source: string) => source,
    matches: (draft: string, source: string) => draft === source,
    same: (a: string, b: string) => a === b,
  });
  useUnsavedGuard(dirty);
  const save = useSaveSkill();

  function submit() {
    if (dirty && !save.isPending) {
      void withFeedback(save.mutateAsync({ set: doc.set, name: doc.name, content }), "SKILL.md salvo.");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <Card className="overflow-visible">
        <CardHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href={hrefFor({ screen: "skills", view: "hub", set: doc.set })}>{doc.set}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>SKILL.md</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <CardTitle className="text-lg">{doc.name}</CardTitle>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <MoveControl doc={doc} setNames={setNames} />
            <DeleteControl doc={doc} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stale && <StaleNotice message="O SKILL.md foi salvo em outro lugar enquanto você editava. Recarregar troca suas edições pela versão salva." onReload={reload} />}
          <Textarea
            className="min-h-[max(55svh,22rem)] resize-y font-mono text-[13px] leading-relaxed"
            aria-label={`Conteúdo de ${doc.name}/SKILL.md`}
            spellCheck={false}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              save.reset();
            }}
          />
          {save.error !== null && <FieldError className="whitespace-pre-wrap">{save.error.message}</FieldError>}
          <p className="text-xs text-muted-foreground">
            {doc.files.length === 0 && "Sem outros arquivos na pasta."}
            {doc.files.length > 0 && (
              <>
                Outros arquivos: <span className="font-mono">{doc.files.join(", ")}</span>
              </>
            )}
          </p>
        </CardContent>
        <ActionBar status={<DirtyIndicator dirty={dirty} />}>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={(event) => {
                const form = event.currentTarget.form;
                reload();
                save.reset();
                focusFirstField(form);
              }}
            >
              <Undo2Icon />
              Descartar
            </Button>
          )}
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending && <Spinner />}
            {!save.isPending && <SaveIcon />}
            Salvar
            <Kbd className="bg-primary-foreground/15 text-primary-foreground">{saveShortcut}</Kbd>
          </Button>
        </ActionBar>
      </Card>
    </form>
  );
}

function MoveControl({ doc, setNames }: { doc: SkillDocument; setNames: string[] }) {
  const targets = setNames.filter((set) => set !== doc.set);
  const [toSet, setToSet] = useState(targets[0] ?? "");
  const move = useMoveSkill(
    (vars) => void navigate({ screen: "skills", view: "hub", set: vars.toSet, skill: vars.name }, { confirmed: true }),
  );
  if (targets.length === 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-1">
      <Select value={toSet} onValueChange={setToSet}>
        <SelectTrigger className="w-36" aria-label="Mover para o conjunto">
          <SelectValue placeholder="Conjunto" />
        </SelectTrigger>
        <SelectContent>
          {targets.map((set) => (
            <SelectItem key={set} value={set}>
              {set}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        disabled={toSet === "" || move.isPending}
        onClick={async () => {
          if (await confirmLeave()) {
            await withFeedback(move.mutateAsync({ set: doc.set, name: doc.name, toSet }), `${doc.name} movida para ${toSet}.`);
          }
        }}
      >
        {move.isPending && <Spinner />}
        {!move.isPending && <ArrowRightLeftIcon />}
        Mover
      </Button>
    </div>
  );
}

function DeleteControl({ doc }: { doc: SkillDocument }) {
  const remove = useDeleteSkill((vars) => void navigate({ screen: "skills", view: "hub", set: vars.set }, { confirmed: true }));
  return (
    <ConfirmAction
      label={
        <>
          <Trash2Icon />
          Excluir
        </>
      }
      title={`Excluir ${doc.name}?`}
      description="Apaga a pasta da skill com todos os arquivos. Não dá para desfazer."
      confirmLabel="Excluir"
      disabled={remove.isPending}
      onConfirm={async () => {
        if (await confirmLeave()) {
          await withFeedback(remove.mutateAsync({ set: doc.set, name: doc.name }), `${doc.name} excluída.`);
        }
      }}
    />
  );
}
