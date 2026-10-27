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
        <FieldLegend>Segredos de {profile}</FieldLegend>
        <FieldDescription>
          Preenchem as referências <code className="font-mono">{"${NOME}"}</code> dos servidores. Os valores nunca são
          exibidos: só dá para definir, substituir ou remover.
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
                    <EmptyTitle>Nenhum segredo neste perfil</EmptyTitle>
                    <EmptyDescription>Adicione um abaixo quando um servidor usar {"${NOME}"}.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {rows.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chave</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Ações</span>
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
        {missing && <Badge variant="warning">faltando</Badge>}
        {!missing && <Badge variant="success">definido</Badge>}
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
                  Remover
                </>
              }
              title={`Remover ${secretKey}?`}
              description={`Os servidores de ${profile} que usam \${${secretKey}} deixam de conectar até que ele seja definido de novo.`}
              confirmLabel="Remover"
              disabled={remove.isPending}
              onConfirm={() =>
                void withFeedback(remove.mutateAsync({ profile, key: secretKey }), `${secretKey} removido.`)
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
  let label = "Substituir";
  if (missing) {
    label = "Definir";
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
            const saved = await withFeedback(set.mutateAsync({ profile, key: secretKey, value }), `${secretKey} salvo.`);
            if (saved !== undefined) {
              setOpen(false);
              setValue("");
            }
          }}
        >
          <Field data-invalid={set.error !== null}>
            <FieldLabel htmlFor={`secret-${secretKey}`}>Valor de {secretKey}</FieldLabel>
            <Input
              id={`secret-${secretKey}`}
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="valor"
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
              Cancelar
            </Button>
            <Button type="submit" disabled={value === "" || set.isPending}>
              {set.isPending && <Spinner />}
              Salvar
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
    replaces = `Substitui o valor atual de ${key}.`;
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
      onChange={() => set.reset()}
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await withFeedback(set.mutateAsync({ profile, key, value }), `${key} salvo.`);
        if (saved !== undefined) {
          setValue("");
          setSecretKey("");
        }
      }}
    >
      <span className="text-sm font-medium">Novo segredo</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
        <Field data-invalid={keyHint !== undefined}>
          <FieldLabel htmlFor="new-secret-key" className="sr-only">
            Chave do novo segredo
          </FieldLabel>
          <Input
            id="new-secret-key"
            className="font-mono"
            placeholder="CHAVE"
            value={secretKey}
            aria-invalid={keyHint !== undefined}
            onChange={(event) => setSecretKey(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-secret-value" className="sr-only">
            Valor do novo segredo
          </FieldLabel>
          <Input
            id="new-secret-value"
            type="password"
            autoComplete="new-password"
            placeholder="valor"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={keyProblem !== undefined || value === "" || set.isPending}>
          {set.isPending && <Spinner />}
          {!set.isPending && <PlusIcon />}
          Adicionar
        </Button>
      </div>
      <FieldError>{keyHint ?? set.error?.message}</FieldError>
      {replaces !== undefined && <FieldDescription>{replaces}</FieldDescription>}
    </form>
  );
}
