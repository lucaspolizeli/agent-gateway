import { CircleCheckIcon, KeyRoundIcon, PlayIcon, RotateCwIcon, ServerCrashIcon } from "lucide-react";
import type { ProfileStatus, ResolvedProfileView, UpstreamState } from "../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Chain } from "../components/Chain.tsx";
import { withFeedback } from "../components/feedback.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { reconnectVerdict } from "../components/reconnectVerdict.ts";
import { RunningBadge } from "../components/RunningBadge.tsx";
import { StatusDot } from "../components/StatusDot.tsx";
import { UpstreamBadge } from "../components/UpstreamBadge.tsx";
import { plural } from "../domain/format.ts";
import { profileState, type AttentionItem, type HealthSummary } from "../domain/health.ts";
import { hrefFor } from "../router.ts";
import { useGatewayHealth } from "../state/health.ts";
import { useProfiles, useReconnectServer, useStartProfile } from "../state/profiles.ts";

export function StatusScreen() {
  const profiles = useProfiles();
  const health = useGatewayHealth();
  return (
    <>
      <PageHeader title="Status" description="Saúde dos gateways de cada perfil. Atualiza a cada 3 s." />
      <QueryState query={profiles}>
        {(views) => (
          <div className="flex flex-col gap-6">
            <StatTiles summary={health.summary} />
            <AttentionList items={health.summary.attention} />
            <ProfileCards views={views} statuses={health.statuses} />
          </div>
        )}
      </QueryState>
    </>
  );
}

type Tile = { label: string; value: number; hint: string; tone: string };

function tiles(summary: HealthSummary): Tile[] {
  let failingTone = "";
  if (summary.serversFailing > 0) {
    failingTone = "text-destructive";
  }
  let secretsTone = "";
  if (summary.missingSecrets > 0) {
    secretsTone = "text-warning";
  }
  return [
    { label: "Perfis rodando", value: summary.running, hint: `de ${summary.profiles} perfis`, tone: "" },
    { label: "Servidores prontos", value: summary.serversReady, hint: "nos perfis rodando", tone: "text-success" },
    { label: "Servidores com falha", value: summary.serversFailing, hint: "nos perfis rodando", tone: failingTone },
    { label: "Segredos faltando", value: summary.missingSecrets, hint: "em todos os perfis", tone: secretsTone },
  ];
}

function StatTiles({ summary }: { summary: HealthSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {tiles(summary).map((tile) => (
        <Card key={tile.label}>
          <CardHeader>
            <CardDescription>{tile.label}</CardDescription>
            <CardTitle className={cn("text-3xl font-semibold tabular-nums", tile.tone)}>{tile.value}</CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">{tile.hint}</CardFooter>
        </Card>
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Precisa de atenção
          {items.length > 0 && <Badge variant="destructive">{items.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 && (
          <Empty className="flex-row justify-start gap-3 border p-3 text-left">
            <EmptyMedia variant="icon" className="mb-0 bg-success/15 text-success">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyHeader className="items-start">
              <EmptyTitle>Nada pendente</EmptyTitle>
              <EmptyDescription>Todos os servidores dos perfis rodando estão prontos.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {items.length > 0 && (
          <ItemGroup className="gap-2">
            {items.map((item) => {
              if (item.kind === "failedServer") {
                return <FailedServerRow key={`server:${item.profile}:${item.server}`} item={item} />;
              }
              return <MissingSecretRow key={`secret:${item.profile}:${item.key}`} item={item} />;
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

function ReconnectButton({ profile, server, size }: { profile: string; server: string; size?: "sm" }) {
  const reconnect = useReconnectServer();
  const vars = { profile, server };
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={reconnect.isPending}
      onClick={() => void withFeedback(reconnect.mutateAsync(vars), (status) => reconnectVerdict(status, vars))}
    >
      {reconnect.isPending && <Spinner />}
      {!reconnect.isPending && <RotateCwIcon />}
      Reconectar
    </Button>
  );
}

function FailedServerRow({ item }: { item: Extract<AttentionItem, { kind: "failedServer" }> }) {
  return (
    <Item variant="outline" className="items-start">
      <ItemMedia variant="icon" className="bg-destructive/10 text-destructive">
        <ServerCrashIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <span className="font-mono">{item.server}</span>
          <span className="font-normal text-muted-foreground">em</span>
          <a className="underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile: item.profile })}>
            {item.profile}
          </a>
        </ItemTitle>
        <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-destructive">
          {item.error}
        </pre>
      </ItemContent>
      <ItemActions>
        <ReconnectButton profile={item.profile} server={item.server} />
      </ItemActions>
    </Item>
  );
}

function MissingSecretRow({ item }: { item: Extract<AttentionItem, { kind: "missingSecret" }> }) {
  return (
    <Item variant="outline">
      <ItemMedia variant="icon" className="bg-warning/15 text-warning">
        <KeyRoundIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex-wrap">
          <span className="font-mono">{item.key}</span>
          <span className="font-normal text-muted-foreground">faltando em</span>
          <a className="underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile: item.profile })}>
            {item.profile}
          </a>
        </ItemTitle>
        <ItemDescription>Sem valor nos segredos do perfil nem no ambiente.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" asChild>
          <a href={hrefFor({ screen: "profiles", profile: item.profile, tab: "secrets" })}>Definir segredo</a>
        </Button>
      </ItemActions>
    </Item>
  );
}

type CardsProps = { views: ResolvedProfileView[]; statuses: Map<string, ProfileStatus> };

function ProfileCards({ views, statuses }: CardsProps) {
  if (views.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nenhum perfil configurado</EmptyTitle>
          <EmptyDescription>Crie um perfil para agrupar servidores, skills e segredos.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <a href={hrefFor({ screen: "profiles" })}>Ir para Perfis</a>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  const running = views.filter((view) => statuses.get(view.name)?.running !== false);
  const stopped = views.filter((view) => statuses.get(view.name)?.running === false);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Perfis</h2>
      {running.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {running.map((view) => (
            <RunningCard key={view.name} view={view} status={statuses.get(view.name)} />
          ))}
        </div>
      )}
      {stopped.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Parados</CardTitle>
            <CardDescription>Sobem quando um cliente conecta, ou agora pelo botão Iniciar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-1">
              {stopped.map((view) => (
                <StoppedRow key={view.name} view={view} />
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function RunningCard({ view, status }: { view: ResolvedProfileView; status?: ProfileStatus }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <a className="underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile: view.name })}>
            {view.name}
          </a>
          <RunningBadge state={profileState(status)} />
        </CardTitle>
        <CardDescription>
          <Chain chain={view.chain} />
        </CardDescription>
        <CardAction className="text-xs text-muted-foreground">
          {plural(status?.tools.length ?? 0, "tool exposta", "tools expostas")}
        </CardAction>
      </CardHeader>
      <CardContent>
        {status !== undefined && status.upstreams.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum upstream conectado.</p>
        )}
        <ul className="divide-y">
          {(status?.upstreams ?? []).map((upstream) => (
            <UpstreamRow key={upstream.server} profile={view.name} upstream={upstream} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function UpstreamRow({ profile, upstream }: { profile: string; upstream: UpstreamState }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <StatusDot health={upstream.state} />
      <a
        className="min-w-0 truncate font-mono text-sm underline-offset-4 hover:underline"
        href={hrefFor({ screen: "servers", server: upstream.server })}
      >
        {upstream.server}
      </a>
      <UpstreamBadge upstream={upstream} />
      <span className="flex-1" />
      <ReconnectButton profile={profile} server={upstream.server} size="sm" />
    </li>
  );
}

function StoppedRow({ view }: { view: ResolvedProfileView }) {
  const start = useStartProfile();
  const servers = Object.keys(view.servers).sort();
  return (
    <Item size="sm" className="px-1">
      <ItemMedia className="self-center">
        <StatusDot health="unknown" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <a className="underline-offset-4 hover:underline" href={hrefFor({ screen: "profiles", profile: view.name })}>
            {view.name}
          </a>
          <RunningBadge state="stopped" />
          <Chain chain={view.chain} />
        </ItemTitle>
        <ItemDescription className="truncate">
          {plural(servers.length, "servidor", "servidores")}: <span className="font-mono">{servers.join(", ")}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={start.isPending}
          onClick={() => void withFeedback(start.mutateAsync(view.name), `${view.name} iniciado.`)}
        >
          {start.isPending && <Spinner />}
          {!start.isPending && <PlayIcon />}
          Iniciar
        </Button>
      </ItemActions>
    </Item>
  );
}
