import { useState } from "react";
import { ConfirmButton } from "../../components/ConfirmButton.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { useDeleteSecret, useSecrets, useSetSecret } from "../../state/secrets.ts";

/** Write-only: values are typed into password inputs and never read back from the API. */
export function SecretsEditor({ profile, missing }: { profile: string; missing: string[] }) {
  const secrets = useSecrets();
  const [newKey, setNewKey] = useState("");
  return (
    <section className="panel">
      <h3>Segredos de {profile}</h3>
      <p className="muted small">Os valores nunca são exibidos. Só é possível definir ou remover.</p>
      <QueryState query={secrets}>
        {(views) => {
          const keys = [...(views.find((view) => view.profile === profile)?.keys ?? [])].sort();
          return (
            <div className="secrets">
              {keys.length === 0 && <p className="muted">Nenhum segredo neste perfil.</p>}
              {keys.map((key) => (
                <SecretRow key={key} profile={profile} secretKey={key} />
              ))}
              <NewSecret profile={profile} secretKey={newKey} onKeyChange={setNewKey} existing={keys} />
              {missing.length > 0 && (
                <div className="row wrap small">
                  <span className="muted">Faltando na cadeia:</span>
                  {missing.map((key) => (
                    <button key={key} type="button" className="secret-chip warn" onClick={() => setNewKey(key)}>
                      {key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}

function SecretRow({ profile, secretKey }: { profile: string; secretKey: string }) {
  const [value, setValue] = useState("");
  const set = useSetSecret();
  const remove = useDeleteSecret();
  return (
    <form
      className="secret-row"
      onSubmit={(event) => {
        event.preventDefault();
        set.mutate({ profile, key: secretKey, value }, { onSuccess: () => setValue("") });
      }}
    >
      <span className="mono secret-key">{secretKey}</span>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="novo valor"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={value === "" || set.isPending}>
        Atualizar
      </button>
      <ConfirmButton
        label="Remover"
        question={`Remover ${secretKey}?`}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate({ profile, key: secretKey })}
      />
      <MutationStatus mutation={set} success="Atualizado." />
      <MutationStatus mutation={remove} success="Removido." />
    </form>
  );
}

type NewSecretProps = {
  profile: string;
  secretKey: string;
  onKeyChange: (key: string) => void;
  existing: string[];
};

function NewSecret({ profile, secretKey, onKeyChange, existing }: NewSecretProps) {
  const [value, setValue] = useState("");
  const set = useSetSecret();
  const key = secretKey.trim();
  return (
    <form
      className="secret-row new"
      onSubmit={(event) => {
        event.preventDefault();
        set.mutate(
          { profile, key, value },
          {
            onSuccess: () => {
              setValue("");
              onKeyChange("");
            },
          },
        );
      }}
    >
      <input
        className="mono secret-key"
        placeholder="CHAVE"
        value={secretKey}
        onChange={(event) => onKeyChange(event.target.value)}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="valor"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="primary" disabled={key === "" || value === "" || set.isPending}>
        Adicionar
      </button>
      {existing.includes(key) && <span className="muted small">Substitui o valor atual.</span>}
      <MutationStatus mutation={set} success="Segredo salvo." />
    </form>
  );
}
