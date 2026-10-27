import { PlusIcon, ServerIcon } from "lucide-react";
import { useState } from "react";
import type { GatewayConfig } from "../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { DetailPlaceholder, ListLink, ListPane, SplitView } from "../components/SplitView.tsx";
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
  async function startCreating() {
    if (await navigate({ screen: "servers" })) {
      setCreating(true);
    }
  }
  return (
    <>
      <PageHeader
        title="Servers"
        description="MCP servers that profiles can use. Health comes from the running profiles."
        actions={
          <Button type="button" onClick={() => void startCreating()}>
            <PlusIcon />
            New server
          </Button>
        }
      />
      <QueryState query={config}>
        {(data) => (
          <SplitView
            list={
              <ServerList
                config={data}
                health={serverHealth([...health.statuses.values()])}
                selected={selected}
                creating={creating}
                onCreate={() => void startCreating()}
              />
            }
            detail={
              <EditorPane
                config={data}
                target={editorTarget(data, creating, selected)}
                onCreate={() => void startCreating()}
                onCreated={(name) => {
                  setCreating(false);
                  void navigate({ screen: "servers", server: name }, { confirmed: true });
                }}
              />
            }
          />
        )}
      </QueryState>
    </>
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
  onCreate: () => void;
};

function ServerList({ config, health, selected, creating, onCreate }: ListProps) {
  const names = Object.keys(config.servers).sort();
  return (
    <ListPane label="Servers">
      {names.length === 0 && (
        <DetailPlaceholder
          className="min-h-0 border-0 p-4"
          icon={<ServerIcon />}
          title="No servers yet"
          description="Add your first MCP server."
          action={
            <Button type="button" size="sm" onClick={onCreate}>
              <PlusIcon />
              New server
            </Button>
          }
        />
      )}
      {names.map((name) => {
        const spec = config.servers[name];
        if (spec === undefined) {
          return null;
        }
        return (
          <ListLink key={name} href={hrefFor({ screen: "servers", server: name })} current={!creating && name === selected}>
            <span className="flex items-center gap-2">
              <StatusDot health={health.get(name) ?? "unknown"} />
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">{name}</span>
              <Badge variant="outline">{serverKind(spec)}</Badge>
            </span>
            <span className="truncate pl-4 font-mono text-xs text-muted-foreground">{serverSummary(spec)}</span>
          </ListLink>
        );
      })}
    </ListPane>
  );
}

type PaneProps = {
  config: GatewayConfig;
  target?: EditorTarget;
  onCreate: () => void;
  onCreated: (name: string) => void;
};

function EditorPane({ config, target, onCreate, onCreated }: PaneProps) {
  if (target === undefined) {
    return (
      <DetailPlaceholder
        icon={<ServerIcon />}
        title="Select a server"
        description="Choose a server from the list to edit, test or remove it."
        action={
          <Button type="button" variant="outline" onClick={onCreate}>
            <PlusIcon />
            New server
          </Button>
        }
      />
    );
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
