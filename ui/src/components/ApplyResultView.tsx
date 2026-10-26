import type { ProjectApplyResult } from "../contract.ts";
import { skillCounts } from "../domain/applyResult.ts";
import { Badge } from "./Badge.tsx";

export function ApplyResultView({ result }: { result: ProjectApplyResult }) {
  const counts = skillCounts(result);
  return (
    <div className="apply-result">
      <div className="mono">{result.dir}</div>
      <div className="row wrap">
        {result.clients.map((client) => (
          <ClientBadge key={client.client} ok={client.ok} name={client.client} detail={client.detail} />
        ))}
        <span className="muted">
          skills: {counts.linked} linkadas, {counts.removed} removidas, {counts.skipped} ignoradas
        </span>
      </div>
    </div>
  );
}

function ClientBadge({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  if (ok) {
    return (
      <Badge tone="ok" title={detail}>
        {name} ok
      </Badge>
    );
  }
  return (
    <Badge tone="danger" title={detail}>
      {name} FAIL: {detail}
    </Badge>
  );
}
