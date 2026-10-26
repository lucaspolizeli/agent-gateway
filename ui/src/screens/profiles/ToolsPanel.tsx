import { useState } from "react";
import type { ToolInfo } from "../../contract.ts";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { groupByServer, toolVisibility } from "../../domain/profiles.ts";
import { useConfigEdit } from "../../state/config.ts";
import { useProfileStatus, useStartProfile } from "../../state/profiles.ts";

export function ToolsPanel({ profile }: { profile: string }) {
  const status = useProfileStatus(profile);
  const start = useStartProfile();
  const toggle = useConfigEdit();
  const [filter, setFilter] = useState("");

  return (
    <section className="panel">
      <header className="row">
        <h3>Tools</h3>
        <span className="spacer" />
        <input
          className="filter"
          placeholder="filtrar"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </header>
      <MutationStatus mutation={toggle} success="Visibilidade atualizada." />
      <QueryState query={status}>
        {(data) => {
          if (!data.running) {
            return (
              <div className="row">
                <span className="muted">Gateway parado: inicie para listar as tools.</span>
                <button type="button" disabled={start.isPending} onClick={() => start.mutate(profile)}>
                  Iniciar
                </button>
                <MutationStatus mutation={start} success="Gateway iniciado." />
              </div>
            );
          }
          const needle = filter.trim().toLowerCase();
          const tools = data.tools.filter((tool) => tool.name.toLowerCase().includes(needle));
          return (
            <div>
              {tools.length === 0 && <p className="muted">Nenhuma tool.</p>}
              {groupByServer(tools).map(([server, group]) => (
                <div key={server} className="tool-group">
                  <div className="tool-group-title mono">{server}</div>
                  {group.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      profile={profile}
                      busy={toggle.isPending}
                      onToggle={(hidden) => toggle.mutate({ op: "setToolHidden", profile, tool: tool.name, hidden })}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}

type RowProps = { tool: ToolInfo; profile: string; busy: boolean; onToggle: (hidden: boolean) => void };

function ToolRow({ tool, profile, busy, onToggle }: RowProps) {
  const visibility = toolVisibility(tool, profile);
  return (
    <label className="tool-row" data-hidden={visibility.kind !== "visible"} title={tool.description}>
      <input
        type="checkbox"
        checked={visibility.kind === "visible"}
        disabled={busy || visibility.kind === "hiddenByAncestor"}
        onChange={(event) => onToggle(!event.target.checked)}
      />
      <span className="mono">{tool.name}</span>
      {visibility.kind === "hiddenByAncestor" && <span className="muted small">oculta por {visibility.profile}</span>}
      {visibility.kind === "hiddenHere" && <span className="muted small">oculta</span>}
      {tool.description !== undefined && <span className="muted small truncate">{tool.description}</span>}
    </label>
  );
}
