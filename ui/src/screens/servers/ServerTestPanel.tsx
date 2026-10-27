import type { ServerTestResult } from "../../contract.ts";
import { plural } from "../../domain/format.ts";

type ControlsProps = {
  profiles: string[];
  profile: string;
  onProfileChange: (profile: string) => void;
  disabled: boolean;
  onRun: () => void;
};

export function TestControls({ profiles, profile, onProfileChange, disabled, onRun }: ControlsProps) {
  return (
    <>
      <label className="test-profile">
        <span className="muted small">Segredos de</span>
        <select value={profile} aria-label="Segredos do perfil" onChange={(event) => onProfileChange(event.target.value)}>
          <option value="">nenhum perfil</option>
          {profiles.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={disabled} onClick={onRun}>
        Testar conexão
      </button>
    </>
  );
}

export function TestResultView({ result }: { result: ServerTestResult }) {
  if (!result.ok) {
    return (
      <div className="test-result">
        <div className="status-line error">Falhou em {result.durationMs} ms</div>
        <div className="error-box" role="alert">
          {result.error}
        </div>
      </div>
    );
  }
  return (
    <div className="test-result">
      <div className="status-line ok">
        Conectou em {result.durationMs} ms · {plural(result.tools.length, "tool", "tools")}
      </div>
      <ul className="test-tools">
        {result.tools.map((tool) => (
          <li key={tool.name}>
            <span className="mono">{tool.name}</span>
            {tool.description !== undefined && <span className="muted truncate">{tool.description}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
