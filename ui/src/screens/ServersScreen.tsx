import { useState } from "react";
import type { GatewayConfig } from "../contract.ts";
import { Badge } from "../components/Badge.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { serverKind, serverSummary } from "../domain/serverForm.ts";
import { hrefFor, navigate } from "../router.ts";
import { useConfig } from "../state/config.ts";
import { ServerEditor, type EditorTarget } from "./servers/ServerEditor.tsx";

export function ServersScreen({ selected }: { selected?: string }) {
  const config = useConfig();
  const [creating, setCreating] = useState(false);
  return (
    <section>
      <header className="screen-header">
        <h1>Servidores</h1>
        <span className="spacer" />
        <button
          type="button"
          className="primary"
          onClick={() => {
            setCreating(true);
            navigate({ screen: "servers" });
          }}
        >
          Novo servidor
        </button>
      </header>
      <QueryState query={config}>
        {(data) => (
          <div className="split">
            <ServerList config={data} selected={selected} onSelect={() => setCreating(false)} />
            <EditorPane
              config={data}
              target={editorTarget(data, creating, selected)}
              onCreated={(name) => {
                setCreating(false);
                navigate({ screen: "servers", server: name });
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
    .map(([name]) => name);
}

type ListProps = { config: GatewayConfig; selected?: string; onSelect: () => void };

function ServerList({ config, selected, onSelect }: ListProps) {
  const names = Object.keys(config.servers).sort();
  return (
    <nav className="list">
      {names.length === 0 && <p className="muted">Nenhum servidor.</p>}
      {names.map((name) => {
        const spec = config.servers[name];
        if (spec === undefined) {
          return null;
        }
        return (
          <a
            key={name}
            className="list-item"
            aria-current={name === selected}
            href={hrefFor({ screen: "servers", server: name })}
            onClick={onSelect}
          >
            <div className="row">
              <span className="mono">{name}</span>
              <Badge tone="neutral">{serverKind(spec)}</Badge>
            </div>
            <div className="muted small truncate mono">{serverSummary(spec)}</div>
          </a>
        );
      })}
    </nav>
  );
}

type PaneProps = { config: GatewayConfig; target?: EditorTarget; onCreated: (name: string) => void };

function EditorPane({ config, target, onCreated }: PaneProps) {
  if (target === undefined) {
    return <div className="placeholder muted">Selecione um servidor ou crie um novo.</div>;
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
