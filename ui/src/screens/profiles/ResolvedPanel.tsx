import type { ResolvedProfileView } from "../../contract.ts";
import { Badge } from "../../components/Badge.tsx";
import { hrefFor } from "../../router.ts";

export function ResolvedPanel({ view }: { view: ResolvedProfileView }) {
  const servers = Object.entries(view.servers).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="resolved">
      <div className="resolved-group">
        <div className="field-label">Servidores</div>
        {servers.length === 0 && <span className="muted">Nenhum.</span>}
        <ul className="resolved-list">
          {servers.map(([server, from]) => (
            <li key={server}>
              <a className="mono" href={hrefFor({ screen: "servers", server })}>
                {server}
              </a>
              <Origin from={from} self={view.name} />
            </li>
          ))}
        </ul>
      </div>
      <div className="resolved-group">
        <div className="field-label">Conjuntos de skills</div>
        {view.skillSets.length === 0 && <span className="muted">Nenhum.</span>}
        <ul className="resolved-list">
          {view.skillSets.map((set) => (
            <li key={set}>
              <a href={hrefFor({ screen: "skills", set })}>{set}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Origin({ from, self }: { from: string; self: string }) {
  if (from === self) {
    return <Badge tone="accent">próprio</Badge>;
  }
  return <Badge tone="neutral">de {from}</Badge>;
}
