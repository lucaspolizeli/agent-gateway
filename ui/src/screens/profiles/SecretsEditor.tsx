import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "../../components/ConfirmAction.tsx";
import { withFeedback } from "../../components/feedback.ts";
import { QueryState } from "../../components/QueryState.tsx";
import { hintFor, secretKeyProblem } from "../../domain/validation.ts";
import { useDeleteSecret, useSecrets, useSetSecret } from "../../state/secrets.ts";

/** Write-only: values are typed into password inputs and never read back from the API. */
export function SecretsEditor({ profile, missing }: { profile: string; missing: string[] }) {
  const secrets = useSecrets();
  return (
    <div className="flex flex-col gap-6">
      <FieldSet>
        <FieldLegend>Secrets of {profile}</FieldLegend>
        <FieldDescription>
          Secrets fill the <code className="font-mono">{"${NAME}"}</code> references of servers. Values are never shown. You
          can only set, replace or remove them.
        </FieldDescription>
      </FieldSet>
      <QueryState query={secrets}>
        {(views) => {
          const keys = [...(views.find((view) => view.profile === profile)?.keys ?? [])].sort();
          const absent = missing.filter((key) => !keys.includes(key)).sort();
          // One list keyed by name: a secret that gets defined stays the same row.
          const rows = [...absent.map((key) => ({ key, missing: true })), ...keys.map((key) => ({ key, missing: false }))];
          return (
            <>
              {rows.length === 0 && (
                <Empty className="border p-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <KeyRoundIcon />
                    </EmptyMedia>
                    <EmptyTitle>No secrets in this profile</EmptyTitle>
                    <EmptyDescription>Add one below when a server uses {"${NAME}"}.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {rows.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <SecretRow key={row.key} profile={profile} secretKey={row.key} missing={row.missing} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <NewSecret profile={profile} existing={keys} />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

type RowProps = { profile: string; secretKey: string; missing: boolean };

function SecretRow({ profile, secretKey, missing }: RowProps) {
  const remove = useDeleteSecret();
  return (
    <TableRow>
      <TableCell className="font-mono">{secretKey}</TableCell>
      <TableCell>
        {missing && <Badge variant="warning">missing</Badge>}
        {!missing && <Badge variant="success">set</Badge>}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <SetValuePopover profile={profile} secretKey={secretKey} missing={missing} />
          {!missing && (
            <ConfirmAction
              size="sm"
              label={
                <>
                  <Trash2Icon />
                  Remove
                </>
              }
              title={`Remove ${secretKey}?`}
              description={`Servers in ${profile} that use \${${secretKey}} stop connecting until it is set again.`}
              confirmLabel="Remove"
              disabled={remove.isPending}
              onConfirm={() =>
                void withFeedback(remove.mutateAsync({ profile, key: secretKey }), `${secretKey} removed.`)
              }
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SetValuePopover({ profile, secretKey, missing }: RowProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const set = useSetSecret();
  let label = "Replace";
  if (missing) {
    label = "Set";
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setValue("");
        set.reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await withFeedback(set.mutateAsync({ profile, key: secretKey, value }), `${secretKey} saved.`);
            if (saved !== undefined) {
              setOpen(false);
              setValue("");
            }
          }}
        >
          <Field data-invalid={set.error !== null}>
            <FieldLabel htmlFor={`secret-${secretKey}`}>Value of {secretKey}</FieldLabel>
            <Input
              id={`secret-${secretKey}`}
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                set.reset();
              }}
            />
            <FieldError>{set.error?.message}</FieldError>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={value === "" || set.isPending}>
              {set.isPending && <Spinner />}
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function NewSecret({ profile, existing }: { profile: string; existing: string[] }) {
  const [secretKey, setSecretKey] = useState("");
  const [value, setValue] = useState("");
  const set = useSetSecret();
  const key = secretKey.trim();
  const keyProblem = secretKeyProblem(key);
  const keyHint = hintFor(key, keyProblem);
  let replaces: string | undefined = undefined;
  if (existing.includes(key)) {
    replaces = `Replaces the current value of ${key}.`;
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
      onChange={() => set.reset()}
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await withFeedback(set.mutateAsync({ profile, key, value }), `${key} saved.`);
        if (saved !== undefined) {
          setValue("");
          setSecretKey("");
        }
      }}
    >
      <span className="text-sm font-medium">New secret</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
        <Field data-invalid={keyHint !== undefined}>
          <FieldLabel htmlFor="new-secret-key" className="sr-only">
            Key of the new secret
          </FieldLabel>
          <Input
            id="new-secret-key"
            className="font-mono"
            placeholder="KEY"
            value={secretKey}
            aria-invalid={keyHint !== undefined}
            onChange={(event) => setSecretKey(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-secret-value" className="sr-only">
            Value of the new secret
          </FieldLabel>
          <Input
            id="new-secret-value"
            type="password"
            autoComplete="new-password"
            placeholder="value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={keyProblem !== undefined || value === "" || set.isPending}>
          {set.isPending && <Spinner />}
          {!set.isPending && <PlusIcon />}
          Add
        </Button>
      </div>
      <FieldError>{keyHint ?? set.error?.message}</FieldError>
      {replaces !== undefined && <FieldDescription>{replaces}</FieldDescription>}
    </form>
  );
}
