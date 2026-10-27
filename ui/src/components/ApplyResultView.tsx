import type { ProjectApplyResult } from "../contract.ts";
import { skillCounts } from "../domain/applyResult.ts";

export function ApplyResultView({ result }: { result: ProjectApplyResult }) {
  const counts = skillCounts(result);
  return (
    <div className="apply-result">
      <span className="mono truncate apply-dir" title={result.dir}>
        {result.dir}
      </span>
      <span className="apply-clients">
        {result.clients.map((client) => (
          <ClientChip key={client.client} ok={client.ok} name={client.client} detail={client.detail} />
        ))}
      </span>
      <span className="muted small">
        skills: {counts.linked} linkadas · {counts.removed} removidas · {counts.skipped} ignoradas
      </span>
      {result.clients
        .filter((client) => !client.ok)
        .map((client) => (
          <div key={client.client} className="apply-error">
            <b>{client.client}:</b> {client.detail}
          </div>
        ))}
    </div>
  );
}

function ClientChip({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  if (ok) {
    return (
      <span className="chip chip-ok" title={detail}>
        {name} <b>ok</b>
      </span>
    );
  }
  return (
    <span className="chip chip-fail" title={detail}>
      {name} <b>FAIL</b>
    </span>
  );
}
