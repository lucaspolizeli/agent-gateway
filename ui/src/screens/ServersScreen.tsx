import { useState } from "react";
import type { GatewayConfig } from "../contract.ts";
import { Badge } from "../components/Badge.tsx";
import { PlusIcon } from "../components/Icons.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { StatusDot } from "../components/StatusDot.tsx";
import { serverHealth, type Health } from "../domain/health.ts";
import { serverKind, serverSummary } from "../domain/serverForm.ts";
import { hrefFor, navigate } from "../router.ts";
import { useConfig } from "../state/config.ts";
import { useGatewayHealth } from "../state/health.ts";
import { ServerEditor, type EditorTarget } from "./servers/ServerEditor.tsx";

export function ServersScreen({ selected }: { selected?: string }) {
  const config = useConfig();
  const health = useGatewayHealth();
  const [creating, setCreating] = useState(false);
  const [seenServer, setSeenServer] = useState(selected);
  if (seenServer !== selected) {
    setSeenServer(selected);
    if (selected !== undefined) {
      setCreating(false);
    }
  }
  return (
    <section>
      <PageHeader
        title="Servidores"
        description="Servidores MCP que os perfis podem usar. A saúde vem dos perfis rodando."
        actions={
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (navigate({ screen: "servers" })) {
                setCreating(true);
              }
            }}
          >
            <PlusIcon />
            Novo servidor
          </button>
        }
      />
      <QueryState query={config}>
        {(data) => (
          <div className="split">
            <ServerList
              config={data}
              health={serverHealth([...health.statuses.values()])}
              selected={selected}
              creating={creating}
            />
            <EditorPane
              config={data}
              target={editorTarget(data, creating, selected)}
              onCreated={(name) => {
                setCreating(false);
                navigate({ screen: "servers", server: name }, { confirmed: true });
              }}
            />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function editorTarget(config: GatewayConfig, creating: boolean, selected?: string): EditorTarget | undefined {
  if (creating) {
    return { kind: "new" };
  }
  if (selected === undefined) {
    return undefined;
  }
  const spec = config.servers[selected];
  if (spec === undefined) {
    return undefined;
  }
  return { kind: "existing", name: selected, spec };
}

function usedBy(config: GatewayConfig, server: string): string[] {
  return Object.entries(config.profiles)
    .filter(([, profile]) => profile.servers.includes(server))
    .map(([name]) => name)
    .sort();
}

type ListProps = {
  config: GatewayConfig;
  health: Map<string, Health>;
  selected?: string;
  creating: boolean;
};

function ServerList({ config, health, selected, creating }: ListProps) {
  const names = Object.keys(config.servers).sort();
  return (
    <nav className="master" aria-label="Servidores">
      {names.length === 0 && <p className="empty">Nenhum servidor.</p>}
      {names.map((name) => {
        const spec = config.servers[name];
        if (spec === undefined) {
          return null;
        }
        return (
          <a
            key={name}
            className="master-item"
            aria-current={!creating && name === selected && "page"}
            href={hrefFor({ screen: "servers", server: name })}
          >
            <span className="master-item-title">
              <StatusDot health={health.get(name) ?? "unknown"} />
              <span className="mono truncate">{name}</span>
              <span className="spacer" />
              <Badge tone="neutral">{serverKind(spec)}</Badge>
            </span>
            <span className="master-item-meta mono truncate server-summary">{serverSummary(spec)}</span>
          </a>
        );
      })}
    </nav>
  );
}

type PaneProps = { config: GatewayConfig; target?: EditorTarget; onCreated: (name: string) => void };

function EditorPane({ config, target, onCreated }: PaneProps) {
  if (target === undefined) {
    return <div className="placeholder">Selecione um servidor ou crie um novo.</div>;
  }
  let key = "new";
  let users: string[] = [];
  if (target.kind === "existing") {
    key = `existing:${target.name}`;
    users = usedBy(config, target.name);
  }
  return (
    <ServerEditor
      key={key}
      target={target}
      profiles={Object.keys(config.profiles).sort()}
      usedBy={users}
      existingNames={Object.keys(config.servers)}
      onCreated={onCreated}
    />
  );
}
