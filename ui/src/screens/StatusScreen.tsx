import type { ProfileStatus, ResolvedProfileView, UpstreamState } from "../contract.ts";
import { Chain } from "../components/Chain.tsx";
import { CountBadge } from "../components/CountBadge.tsx";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { reconnectRowVerdict, reconnectVerdict } from "../components/reconnectVerdict.ts";
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
    <section>
      <PageHeader title="Status" description="Saúde dos gateways de cada perfil. Atualiza a cada 3 s." />
      <QueryState query={profiles}>
        {(views) => (
          <div className="status-page">
            <StatTiles summary={health.summary} />
            <AttentionList items={health.summary.attention} />
            <ProfileCards views={views} statuses={health.statuses} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

type Tile = { label: string; value: number; hint: string; tone: "neutral" | "ok" | "warn" | "danger" };

function tiles(summary: HealthSummary): Tile[] {
  let failingTone: Tile["tone"] = "neutral";
  if (summary.serversFailing > 0) {
    failingTone = "danger";
  }
  let secretsTone: Tile["tone"] = "neutral";
  if (summary.missingSecrets > 0) {
    secretsTone = "warn";
  }
  return [
    { label: "Perfis rodando", value: summary.running, hint: `de ${summary.profiles} perfis`, tone: "neutral" },
    { label: "Servidores prontos", value: summary.serversReady, hint: "nos perfis rodando", tone: "ok" },
    { label: "Servidores com falha", value: summary.serversFailing, hint: "nos perfis rodando", tone: failingTone },
    { label: "Segredos faltando", value: summary.missingSecrets, hint: "em todos os perfis", tone: secretsTone },
  ];
}

function StatTiles({ summary }: { summary: HealthSummary }) {
  return (
    <div className="stat-grid">
      {tiles(summary).map((tile) => (
        <div key={tile.label} className={`stat-tile stat-${tile.tone}`}>
          <div className="stat-label">{tile.label}</div>
          <div className="stat-value">{tile.value}</div>
          <div className="stat-hint">{tile.hint}</div>
        </div>
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">Precisa de atenção</h2>
        <CountBadge count={items.length} tone="danger" />
      </header>
      {items.length === 0 && (
        <div className="attention-empty">
          <StatusDot health="ready" />
          Nada pendente: todos os servidores dos perfis rodando estão prontos.
        </div>
      )}
      {items.length > 0 && (
        <ul className="attention-list">
          {items.map((item) => {
            if (item.kind === "failedServer") {
              return <FailedServerRow key={`server:${item.profile}:${item.server}`} item={item} />;
            }
            return <MissingSecretRow key={`secret:${item.profile}:${item.key}`} item={item} />;
          })}
        </ul>
      )}
    </section>
  );
}

function FailedServerRow({ item }: { item: Extract<AttentionItem, { kind: "failedServer" }> }) {
  const reconnect = useReconnectServer();
  return (
    <li className="attention-row">
      <span className="attention-kind attention-danger">Falha</span>
      <div className="attention-body">
        <div className="attention-title">
          <span className="mono">{item.server}</span>
          <span className="muted">em</span>
          <a href={hrefFor({ screen: "profiles", profile: item.profile })}>{item.profile}</a>
        </div>
        <pre className="attention-error">{item.error}</pre>
        <MutationStatus mutation={reconnect} verdict={reconnectRowVerdict} />
      </div>
      <button
        type="button"
        disabled={reconnect.isPending}
        onClick={() => reconnect.mutate({ profile: item.profile, server: item.server })}
      >
        Reconectar
      </button>
    </li>
  );
}

function MissingSecretRow({ item }: { item: Extract<AttentionItem, { kind: "missingSecret" }> }) {
  return (
    <li className="attention-row">
      <span className="attention-kind attention-warn">Segredo</span>
      <div className="attention-body">
        <div className="attention-title">
          <span className="mono">{item.key}</span>
          <span className="muted">faltando em</span>
          <a href={hrefFor({ screen: "profiles", profile: item.profile })}>{item.profile}</a>
        </div>
        <div className="muted small">Sem valor nos segredos do perfil nem no ambiente.</div>
      </div>
      <a className="button-link" href={hrefFor({ screen: "profiles", profile: item.profile, tab: "segredos" })}>
        Definir segredo
      </a>
    </li>
  );
}

type CardsProps = { views: ResolvedProfileView[]; statuses: Map<string, ProfileStatus> };

function ProfileCards({ views, statuses }: CardsProps) {
  if (views.length === 0) {
    return <p className="empty">Nenhum perfil configurado.</p>;
  }
  const running = views.filter((view) => statuses.get(view.name)?.running !== false);
  const stopped = views.filter((view) => statuses.get(view.name)?.running === false);
  return (
    <section className="stack">
      <h2 className="eyebrow">Perfis</h2>
      {running.length > 0 && (
        <div className="profile-grid">
          {running.map((view) => (
            <RunningCard key={view.name} view={view} status={statuses.get(view.name)} />
          ))}
        </div>
      )}
      {stopped.length > 0 && (
        <ul className="panel stopped-list">
          {stopped.map((view) => (
            <StoppedRow key={view.name} view={view} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RunningCard({ view, status }: { view: ResolvedProfileView; status?: ProfileStatus }) {
  const reconnect = useReconnectServer();
  return (
    <article className="panel profile-card">
      <header className="profile-card-header">
        <a className="profile-card-title" href={hrefFor({ screen: "profiles", profile: view.name })}>
          {view.name}
        </a>
        <RunningBadge state={profileState(status)} />
        <span className="spacer" />
        <span className="muted small">
          <Chain chain={view.chain} />
        </span>
      </header>
      <ul className="upstream-list">
        {status !== undefined && status.upstreams.length === 0 && (
          <li className="muted small upstream-empty">Nenhum upstream conectado.</li>
        )}
        {(status?.upstreams ?? []).map((upstream) => (
          <UpstreamRow
            key={upstream.server}
            upstream={upstream}
            reconnecting={reconnect.isPending && reconnect.variables?.server === upstream.server}
            onReconnect={() => reconnect.mutate({ profile: view.name, server: upstream.server })}
          />
        ))}
      </ul>
      <footer className="profile-card-footer">
        <span className="muted small">{plural(status?.tools.length ?? 0, "tool exposta", "tools expostas")}</span>
        <span className="spacer" />
        <MutationStatus mutation={reconnect} verdict={reconnectVerdict} />
      </footer>
    </article>
  );
}

type UpstreamRowProps = { upstream: UpstreamState; reconnecting: boolean; onReconnect: () => void };

function UpstreamRow({ upstream, reconnecting, onReconnect }: UpstreamRowProps) {
  return (
    <li className="upstream-row">
      <StatusDot health={upstream.state} />
      <a className="mono upstream-name" href={hrefFor({ screen: "servers", server: upstream.server })}>
        {upstream.server}
      </a>
      <UpstreamBadge upstream={upstream} />
      <span className="spacer" />
      <button type="button" className="small ghost" disabled={reconnecting} onClick={onReconnect}>
        Reconectar
      </button>
    </li>
  );
}

function StoppedRow({ view }: { view: ResolvedProfileView }) {
  const start = useStartProfile();
  const servers = Object.keys(view.servers).sort();
  return (
    <li className="stopped-row">
      <StatusDot health="unknown" />
      <a className="profile-card-title" href={hrefFor({ screen: "profiles", profile: view.name })}>
        {view.name}
      </a>
      <RunningBadge state="stopped" />
      <span className="muted small">
        <Chain chain={view.chain} />
      </span>
      <span className="muted small truncate stopped-servers">
        {plural(servers.length, "servidor", "servidores")}: <span className="mono">{servers.join(", ")}</span>
      </span>
      <span className="spacer" />
      <MutationStatus mutation={start} success="Iniciado." />
      <button type="button" disabled={start.isPending} onClick={() => start.mutate(view.name)}>
        Iniciar
      </button>
    </li>
  );
}
