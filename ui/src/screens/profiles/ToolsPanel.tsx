import { PlayIcon, SearchIcon, WrenchIcon } from "lucide-react";
import { useState } from "react";
import type { ToolInfo } from "../../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { withFeedback } from "../../components/feedback.ts";
import { QueryState } from "../../components/QueryState.tsx";
import { groupByServer, toolMatches, toolVisibility } from "../../domain/profiles.ts";
import { useConfigEdit } from "../../state/config.ts";
import { useProfileStatus, useStartProfile } from "../../state/profiles.ts";
import { UpstreamIssues } from "./UpstreamIssues.tsx";

export function ToolsPanel({ profile }: { profile: string }) {
  const status = useProfileStatus(profile);
  const start = useStartProfile();
  const toggle = useConfigEdit();
  const [filter, setFilter] = useState("");

  function setHidden(tool: string, hidden: boolean) {
    let done = `${tool} visível para os clientes.`;
    if (hidden) {
      done = `${tool} oculta dos clientes.`;
    }
    void withFeedback(toggle.mutateAsync({ op: "setToolHidden", profile, tool, hidden }), done);
  }

  return (
    <QueryState query={status}>
      {(data) => {
        if (!data.running) {
          return (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WrenchIcon />
                </EmptyMedia>
                <EmptyTitle>Gateway parado</EmptyTitle>
                <EmptyDescription>Inicie o gateway deste perfil para listar as tools que ele expõe.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  disabled={start.isPending}
                  onClick={() => void withFeedback(start.mutateAsync(profile), "Gateway iniciado.")}
                >
                  {start.isPending && <Spinner />}
                  {!start.isPending && <PlayIcon />}
                  Iniciar gateway
                </Button>
              </EmptyContent>
            </Empty>
          );
        }
        const visible = data.tools.filter((tool) => !tool.hidden).length;
        const query = filter.trim();
        const needle = query.toLowerCase();
        const noMatches = needle !== "" && !data.tools.some((tool) => toolMatches(tool, needle));
        return (
          <div className="flex flex-col gap-4">
            <UpstreamIssues profile={profile} upstreams={data.upstreams} />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{visible}</span> de {data.tools.length} tools
                visíveis para os clientes
              </span>
              <span className="flex-1" />
              <div className="relative w-full sm:w-64">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-8"
                  aria-label="Filtrar tools"
                  placeholder="Filtrar tools"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
            </div>
            {data.tools.length === 0 && (
              <Empty className="border p-4">
                <EmptyHeader>
                  <EmptyTitle>Nenhuma tool exposta</EmptyTitle>
                  <EmptyDescription>Os servidores deste perfil não expõem tools agora.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {noMatches && (
              <Empty className="border p-4">
                <EmptyHeader>
                  <EmptyTitle>Nenhuma tool corresponde a "{query}"</EmptyTitle>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFilter("")}>
                    Limpar filtro
                  </Button>
                </EmptyContent>
              </Empty>
            )}
            {groupByServer(data.tools).map(([server, group]) => (
              <ToolGroup
                key={server}
                server={server}
                tools={group}
                needle={needle}
                profile={profile}
                busy={toggle.isPending}
                onToggle={setHidden}
              />
            ))}
          </div>
        );
      }}
    </QueryState>
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
    <section className="overflow-hidden rounded-lg border">
      <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="font-mono text-sm font-medium">{server}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {visible} de {tools.length} visíveis
        </span>
      </header>
      <ul className="divide-y">
        {shown.map((tool) => (
          <ToolRow key={tool.name} tool={tool} profile={profile} busy={busy} onToggle={onToggle} />
        ))}
      </ul>
    </section>
  );
}

type RowProps = { tool: ToolInfo; profile: string; busy: boolean; onToggle: (tool: string, hidden: boolean) => void };

const visibilityText = { visible: "visível", hidden: "oculta" };

function ToolRow({ tool, profile, busy, onToggle }: RowProps) {
  const visibility = toolVisibility(tool, profile);
  const shown = visibility.kind === "visible";
  let text = visibilityText.hidden;
  if (shown) {
    text = visibilityText.visible;
  }
  const id = `tool-${tool.name}`;
  return (
    <li className={cn("flex items-center gap-3 px-3 py-2", !shown && "bg-muted/30")}>
      <Switch
        id={id}
        checked={shown}
        aria-label={`${tool.name} visível para os clientes`}
        disabled={visibility.kind === "hiddenByAncestor"}
        aria-disabled={busy}
        onCheckedChange={(checked) => {
          // Not `disabled` while busy: a disabled switch drops focus, which breaks Space on the next tool.
          if (!busy) {
            onToggle(tool.name, !checked);
          }
        }}
      />
      <span className="w-12 text-xs text-muted-foreground" aria-hidden="true">
        {text}
      </span>
      <span className={cn("font-mono text-sm", !shown && "text-muted-foreground line-through")}>{tool.name}</span>
      {visibility.kind === "hiddenByAncestor" && <Badge variant="secondary">oculta por {visibility.profile}</Badge>}
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={tool.description}>
        {tool.description}
      </span>
    </li>
  );
}
