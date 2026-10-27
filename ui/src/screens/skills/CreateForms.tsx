import { useState } from "react";
import type { SkillSet } from "../../contract.ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { withFeedback } from "../../components/feedback.ts";
import { skillTemplate } from "../../domain/skillTemplate.ts";
import { hintFor, skillDescriptionProblem, skillNameProblem, skillSetNameProblem } from "../../domain/validation.ts";
import { navigate } from "../../router.ts";
import { useCreateSkillSet, useSaveSkill } from "../../state/skills.ts";
import { confirmLeave } from "../../state/unsaved.ts";

type SetProps = { open: boolean; sets: SkillSet[]; onClose: () => void };

export function NewSetDialog({ open, sets, onClose }: SetProps) {
  const [name, setName] = useState("");
  const create = useCreateSkillSet();
  const trimmed = name.trim();
  let problem = skillSetNameProblem(trimmed);
  if (problem === undefined && sets.some((set) => set.name === trimmed)) {
    problem = "Já existe um conjunto com esse nome.";
  }
  const hint = hintFor(trimmed, problem);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setName("");
          create.reset();
        }
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (problem !== undefined) {
              return;
            }
            const created = await withFeedback(create.mutateAsync(trimmed), `Conjunto ${trimmed} criado.`);
            if (created !== undefined) {
              setName("");
              onClose();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Novo conjunto</DialogTitle>
            <DialogDescription>Um conjunto agrupa skills. Os perfis escolhem quais conjuntos levam aos projetos.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={hint !== undefined || create.error !== null}>
            <FieldLabel htmlFor="new-set-name">Nome do conjunto</FieldLabel>
            <Input
              id="new-set-name"
              autoFocus
              placeholder="nova-empresa"
              value={name}
              aria-invalid={hint !== undefined}
              onChange={(event) => {
                setName(event.target.value);
                create.reset();
              }}
            />
            <FieldError>{hint ?? create.error?.message}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={problem !== undefined || create.isPending}>
              {create.isPending && <Spinner />}
              Criar conjunto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SkillProps = { open: boolean; sets: SkillSet[]; defaultSet?: string; onClose: () => void };

function firstSet(sets: SkillSet[], preferred: string | undefined): string {
  if (preferred !== undefined && sets.some((set) => set.name === preferred)) {
    return preferred;
  }
  return sets[0]?.name ?? "";
}

export function NewSkillDialog({ open, sets, defaultSet, onClose }: SkillProps) {
  const [chosenSet, setChosenSet] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useSaveSkill();
  const set = chosenSet ?? firstSet(sets, defaultSet);
  const trimmed = name.trim();
  const trimmedDescription = description.trim();
  const taken = sets.find((candidate) => candidate.name === set)?.skills.some((skill) => skill.name === trimmed);
  let nameProblem = skillNameProblem(trimmed);
  if (nameProblem === undefined && taken === true) {
    nameProblem = "Já existe neste conjunto.";
  }
  const descriptionProblem = skillDescriptionProblem(trimmedDescription);
  const nameHint = hintFor(trimmed, nameProblem);
  const descriptionHint = hintFor(trimmed, descriptionProblem);
  const blocked = set === "" || nameProblem !== undefined || descriptionProblem !== undefined || create.isPending;
  function reset() {
    setChosenSet(undefined);
    setName("");
    setDescription("");
    create.reset();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onChange={() => create.reset()}
          onSubmit={async (event) => {
            event.preventDefault();
            if (blocked || !(await confirmLeave())) {
              return;
            }
            const created = await withFeedback(
              create.mutateAsync({ set, name: trimmed, content: skillTemplate(trimmed, trimmedDescription) }),
              `Skill ${trimmed} criada em ${set}.`,
            );
            if (created !== undefined) {
              onClose();
              reset();
              void navigate({ screen: "skills", view: "hub", set, skill: trimmed }, { confirmed: true });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Nova skill</DialogTitle>
            <DialogDescription>Cria o SKILL.md com nome e descrição. O resto você edita depois.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-skill-set">Conjunto</FieldLabel>
                <Select value={set} onValueChange={setChosenSet}>
                  <SelectTrigger id="new-skill-set" className="w-full">
                    <SelectValue placeholder="Escolha um conjunto" />
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((candidate) => (
                      <SelectItem key={candidate.name} value={candidate.name}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={nameHint !== undefined}>
                <FieldLabel htmlFor="new-skill-name">Nome</FieldLabel>
                <Input
                  id="new-skill-name"
                  autoFocus
                  placeholder="nome-da-skill"
                  value={name}
                  aria-invalid={nameHint !== undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                <FieldError>{nameHint}</FieldError>
              </Field>
            </div>
            <Field data-invalid={descriptionHint !== undefined}>
              <FieldLabel htmlFor="new-skill-description">Descrição</FieldLabel>
              <Input
                id="new-skill-description"
                placeholder="Quando usar esta skill"
                value={description}
                aria-invalid={descriptionHint !== undefined}
                onChange={(event) => setDescription(event.target.value)}
              />
              <FieldError>{descriptionHint}</FieldError>
            </Field>
            {create.error !== null && <FieldError>{create.error.message}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={blocked}>
              {create.isPending && <Spinner />}
              Criar skill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
