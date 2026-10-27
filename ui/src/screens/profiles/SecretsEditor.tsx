import { useState } from "react";
import { Badge } from "../../components/Badge.tsx";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { useDeleteSecret, useSecrets, useSetSecret } from "../../state/secrets.ts";

/** Write-only: values are typed into password inputs and never read back from the API. */
export function SecretsEditor({ profile, missing }: { profile: string; missing: string[] }) {
  const secrets = useSecrets();
  return (
    <div className="tab-body">
      <section className="section">
        <h3 className="section-title">Segredos de {profile}</h3>
        <p className="section-hint">
          Preenchem as referências <code>{"${NOME}"}</code> dos servidores. Os valores nunca são exibidos: só dá para
          definir, substituir ou remover.
        </p>
        <QueryState query={secrets}>
          {(views) => {
            const keys = [...(views.find((view) => view.profile === profile)?.keys ?? [])].sort();
            const absent = missing.filter((key) => !keys.includes(key)).sort();
            return (
              <>
                <ul className="secret-list">
                  {absent.map((key) => (
                    <SecretRow key={`missing:${key}`} profile={profile} secretKey={key} missing />
                  ))}
                  {keys.map((key) => (
                    <SecretRow key={key} profile={profile} secretKey={key} missing={false} />
                  ))}
                  {keys.length === 0 && absent.length === 0 && (
                    <li className="secret-empty muted">Nenhum segredo neste perfil.</li>
                  )}
                </ul>
                <NewSecret profile={profile} existing={keys} />
              </>
            );
          }}
        </QueryState>
      </section>
    </div>
  );
}

type RowProps = { profile: string; secretKey: string; missing: boolean };

function SecretRow({ profile, secretKey, missing }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const set = useSetSecret();
  const remove = useDeleteSecret();
  let editLabel = "Substituir";
  if (missing) {
    editLabel = "Definir";
  }
  return (
    <li className="secret-row" data-missing={missing}>
      <span className="mono secret-key">{secretKey}</span>
      {missing && <Badge tone="warn">faltando</Badge>}
      {!missing && <Badge tone="ok">definido</Badge>}
      <span className="spacer" />
      <MutationStatus mutation={set} success="Salvo." />
      <MutationStatus mutation={remove} success="Removido." />
      {editing && (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            set.mutate(
              { profile, key: secretKey, value },
              {
                onSuccess: () => {
                  setValue("");
                  setEditing(false);
                },
              },
            );
          }}
        >
          <input
            type="password"
            autoComplete="new-password"
            autoFocus
            aria-label={`Valor de ${secretKey}`}
            placeholder="valor"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditing(false);
              }
            }}
          />
          <button type="submit" className="primary" disabled={value === "" || set.isPending}>
            Salvar
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </form>
      )}
      {!editing && (
        <button type="button" onClick={() => setEditing(true)}>
          {editLabel}
        </button>
      )}
      {!editing && !missing && (
        <ConfirmButton
          label="Remover"
          question={`Remover ${secretKey}?`}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate({ profile, key: secretKey })}
        />
      )}
    </li>
  );
}

function NewSecret({ profile, existing }: { profile: string; existing: string[] }) {
  const [secretKey, setSecretKey] = useState("");
  const [value, setValue] = useState("");
  const set = useSetSecret();
  const key = secretKey.trim();
  return (
    <form
      className="new-secret"
      onSubmit={(event) => {
        event.preventDefault();
        set.mutate(
          { profile, key, value },
          {
            onSuccess: () => {
              setValue("");
              setSecretKey("");
            },
          },
        );
      }}
    >
      <span className="field-label">Novo segredo</span>
      <div className="row">
        <input
          className="mono new-secret-key"
          aria-label="Chave do novo segredo"
          placeholder="CHAVE"
          value={secretKey}
          onChange={(event) => setSecretKey(event.target.value)}
        />
        <input
          type="password"
          className="grow"
          autoComplete="new-password"
          aria-label="Valor do novo segredo"
          placeholder="valor"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" disabled={key === "" || value === "" || set.isPending}>
          Adicionar
        </button>
      </div>
      {existing.includes(key) && <span className="muted small">Substitui o valor atual de {key}.</span>}
      <MutationStatus mutation={set} success="Segredo salvo." />
    </form>
  );
}
