import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hintFor } from "../domain/validation.ts";

type Props = {
  current: string;
  onRename: (to: string) => void;
  validate: (to: string) => string | undefined;
  disabled?: boolean;
};

export function RenameControl({ current, onRename, validate, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const to = draft.trim();
  const problem = validate(to);
  const hint = hintFor(to, problem);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setDraft(current);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <PencilIcon />
          Rename
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (problem !== undefined || to === current) {
              return;
            }
            setOpen(false);
            onRename(to);
          }}
        >
          <Field data-invalid={hint !== undefined}>
            <FieldLabel htmlFor="rename-input">Rename {current}</FieldLabel>
            <Input
              id="rename-input"
              className="font-mono"
              value={draft}
              aria-invalid={hint !== undefined}
              onChange={(event) => setDraft(event.target.value)}
            />
            <FieldError>{hint}</FieldError>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={problem !== undefined || to === current}>
              Rename
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
