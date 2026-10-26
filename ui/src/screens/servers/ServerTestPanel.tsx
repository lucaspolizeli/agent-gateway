import { useState } from "react";
import type { ServerSpec, ServerTestResult } from "../../contract.ts";
import { ErrorBox } from "../../components/QueryState.tsx";
import { useServerTest } from "../../state/config.ts";

type Props = { spec: ServerSpec; profiles: string[]; disabled: boolean };

export function ServerTestPanel({ spec, profiles, disabled }: Props) {
  const [profile, setProfile] = useState(profiles[0] ?? "");
  const test = useServerTest();
  function run() {
    if (profile === "") {
      test.mutate({ spec });
      return;
    }
    test.mutate({ spec, profile });
  }
  return (
    <fieldset className="panel">
      <legend>Testar conexão</legend>
      <div className="row">
        <label className="inline">
          Segredos do perfil
          <select value={profile} onChange={(event) => setProfile(event.target.value)}>
            <option value="">nenhum</option>
            {profiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={disabled || test.isPending} onClick={run}>
          Testar conexão
        </button>
        {test.isPending && <span className="status-line pending">Conectando…</span>}
      </div>
      {test.error !== null && <ErrorBox message={test.error.message} />}
      {test.data !== undefined && <TestResult result={test.data} />}
    </fieldset>
  );
}

function TestResult({ result }: { result: ServerTestResult }) {
  if (!result.ok) {
    return (
      <div className="error-box" role="alert">
        Falhou em {result.durationMs} ms: {result.error}
      </div>
    );
  }
  return (
    <div>
      <div className="status-line ok">
        Conectou em {result.durationMs} ms · {result.tools.length} tools
      </div>
      <ul className="tool-list">
        {result.tools.map((tool) => (
          <li key={tool.name}>
            <span className="mono">{tool.name}</span>
            {tool.description !== undefined && <span className="muted small"> {tool.description}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
