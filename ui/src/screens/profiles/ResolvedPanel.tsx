import type { ResolvedProfileView } from "../../contract.ts";

export function ResolvedPanel({ view }: { view: ResolvedProfileView }) {
  const servers = Object.entries(view.servers).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="panel">
      <h3>Visão resolvida</h3>
      <div className="chain">
        {view.chain.map((profile, index) => (
          <span key={profile} className="chain-step">
            {index > 0 && <span className="muted"> → </span>}
            <span className="mono">{profile}</span>
          </span>
        ))}
      </div>
      {view.missingSecrets.length > 0 && (
        <div className="warn-box" role="alert">
          <b>Segredos faltando:</b>{" "}
          {view.missingSecrets.map((key) => (
            <code key={key} className="secret-chip">
              {key}
            </code>
          ))}
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Servidor</th>
            <th>Vem de</th>
          </tr>
        </thead>
        <tbody>
          {servers.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                Nenhum servidor.
              </td>
            </tr>
          )}
          {servers.map(([server, from]) => (
            <tr key={server}>
              <td className="mono">{server}</td>
              <td className="mono">{from}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small">
        <span className="muted">Skills: </span>
        <span className="mono">{view.skillSets.join(", ")}</span>
        {view.skillSets.length === 0 && <span className="muted">nenhuma</span>}
      </div>
    </section>
  );
}
