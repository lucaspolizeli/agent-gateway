import { useState } from "react";
import type { ToolInfo } from "../../contract.ts";
import { Badge } from "../../components/Badge.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { QueryState } from "../../components/QueryState.tsx";
import { Switch } from "../../components/Switch.tsx";
import { groupByServer, toolMatches, toolVisibility } from "../../domain/profiles.ts";
import { useConfigEdit } from "../../state/config.ts";
import { useProfileStatus, useStartProfile } from "../../state/profiles.ts";
import { UpstreamIssues } from "./UpstreamIssues.tsx";

export function ToolsPanel({ profile }: { profile: string }) {
  const status = useProfileStatus(profile);
  const start = useStartProfile();
  const toggle = useConfigEdit();
  const [filter, setFilter] = useState("");

  return (
    <div className="tab-body">
      <QueryState query={status}>
        {(data) => {
          if (!data.running) {
            return (
              <div className="section stopped-tools">
                <p className="muted">O gateway deste perfil está parado. Inicie para listar as tools.</p>
                <div className="row">
                  <button type="button" className="primary" disabled={start.isPending} onClick={() => start.mutate(profile)}>
                    Iniciar gateway
                  </button>
                  <MutationStatus mutation={start} success="Gateway iniciado." />
                </div>
              </div>
            );
          }
          const visible = data.tools.filter((tool) => !tool.hidden).length;
          const query = filter.trim();
          const needle = query.toLowerCase();
          const noMatches = needle !== "" && !data.tools.some((tool) => toolMatches(tool, needle));
          return (
            <>
              <UpstreamIssues profile={profile} upstreams={data.upstreams} />
              <div className="tools-toolbar">
                <span className="secondary">
                  <b>{visible}</b> de {data.tools.length} tools visíveis para os clientes
                </span>
                <MutationStatus mutation={toggle} success="Visibilidade atualizada." />
                <span className="spacer" />
                <input
                  type="search"
                  className="filter"
                  aria-label="Filtrar tools"
                  placeholder="Filtrar tools"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
              {data.tools.length === 0 && <p className="empty">Nenhuma tool exposta pelos servidores.</p>}
              {noMatches && <p className="empty">Nenhuma tool corresponde a "{query}"</p>}
              {groupByServer(data.tools).map(([server, group]) => (
                <ToolGroup
                  key={server}
                  server={server}
                  tools={group}
                  needle={needle}
                  profile={profile}
                  busy={toggle.isPending}
                  onToggle={(tool, hidden) => toggle.mutate({ op: "setToolHidden", profile, tool, hidden })}
                />
              ))}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

type GroupProps = {
  server: string;
  tools: ToolInfo[];
  needle: string;
  profile: string;
  busy: boolean;
  onToggle: (tool: string, hidden: boolean) => void;
};

function ToolGroup({ server, tools, needle, profile, busy, onToggle }: GroupProps) {
  const shown = tools.filter((tool) => toolMatches(tool, needle));
  if (shown.length === 0) {
    return null;
  }
  const visible = tools.filter((tool) => !tool.hidden).length;
  return (
    <section className="tool-group">
      <header className="tool-group-header">
        <span className="mono">{server}</span>
        <span className="muted small">
          {visible} de {tools.length} visíveis
        </span>
      </header>
      <ul className="tool-rows">
        {shown.map((tool) => (
          <ToolRow key={tool.name} tool={tool} profile={profile} busy={busy} onToggle={onToggle} />
        ))}
      </ul>
    </section>
  );
}

type RowProps = { tool: ToolInfo; profile: string; busy: boolean; onToggle: (tool: string, hidden: boolean) => void };

function ToolRow({ tool, profile, busy, onToggle }: RowProps) {
  const visibility = toolVisibility(tool, profile);
  return (
    <li className="tool-row" data-hidden={visibility.kind !== "visible"}>
      <Switch
        checked={visibility.kind === "visible"}
        label={`${tool.name} visível para os clientes`}
        onText="visível"
        offText="oculta"
        disabled={busy || visibility.kind === "hiddenByAncestor"}
        onChange={(checked) => onToggle(tool.name, !checked)}
      />
      <span className="mono tool-name">{tool.name}</span>
      {visibility.kind === "hiddenByAncestor" && <Badge tone="neutral">oculta por {visibility.profile}</Badge>}
      <span className="muted truncate tool-description" title={tool.description}>
        {tool.description}
      </span>
    </li>
  );
}
