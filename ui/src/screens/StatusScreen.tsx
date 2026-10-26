import type { ResolvedProfileView, UpstreamState } from "../contract.ts";
import { MutationStatus } from "../components/MutationStatus.tsx";
import { QueryState } from "../components/QueryState.tsx";
import { RunningBadge } from "../components/RunningBadge.tsx";
import { UpstreamBadge } from "../components/UpstreamBadge.tsx";
import { hrefFor } from "../router.ts";
import { useProfiles, useProfileStatus, useReconnectServer, useStartProfile } from "../state/profiles.ts";

export function StatusScreen() {
  const profiles = useProfiles();
  return (
    <section>
      <header className="screen-header">
        <h1>Status</h1>
        <span className="muted">Atualiza a cada 3 s enquanto a aba está visível.</span>
      </header>
      <QueryState query={profiles}>
        {(views) => (
          <div className="card-grid">
            {views.length === 0 && <p className="muted">Nenhum perfil configurado.</p>}
            {views.map((view) => (
              <ProfileStatusCard key={view.name} view={view} />
            ))}
          </div>
        )}
      </QueryState>
    </section>
  );
}

function ProfileStatusCard({ view }: { view: ResolvedProfileView }) {
  const status = useProfileStatus(view.name);
  const start = useStartProfile();
  const reconnect = useReconnectServer();
  return (
    <article className="card">
      <header className="card-header">
        <a className="card-title" href={hrefFor({ screen: "profiles", profile: view.name })}>
          {view.name}
        </a>
        {status.data !== undefined && <RunningBadge running={status.data.running} />}
        <span className="spacer" />
        {status.data?.running === false && (
          <button type="button" disabled={start.isPending} onClick={() => start.mutate(view.name)}>
            Iniciar
          </button>
        )}
      </header>
      <div className="muted small">{view.chain.join(" → ")}</div>
      {view.missingSecrets.length > 0 && (
        <div className="warn-line">Segredos faltando: {view.missingSecrets.join(", ")}</div>
      )}
      <MutationStatus mutation={start} success="Gateway iniciado." />
      <QueryState query={status}>
        {(data) => (
          <ul className="upstreams">
            {data.upstreams.length === 0 && <li className="muted">Nenhum upstream conectado.</li>}
            {data.upstreams.map((upstream) => (
              <UpstreamRow
                key={upstream.server}
                upstream={upstream}
                reconnecting={reconnect.isPending && reconnect.variables?.server === upstream.server}
                onReconnect={() => reconnect.mutate({ profile: view.name, server: upstream.server })}
              />
            ))}
          </ul>
        )}
      </QueryState>
      <MutationStatus mutation={reconnect} success="Reconectado." />
      {status.data?.running === false && Object.keys(view.servers).length > 0 && (
        <div className="muted small">Servidores: {Object.keys(view.servers).join(", ")}</div>
      )}
    </article>
  );
}

type UpstreamRowProps = { upstream: UpstreamState; reconnecting: boolean; onReconnect: () => void };

function UpstreamRow({ upstream, reconnecting, onReconnect }: UpstreamRowProps) {
  return (
    <li className="upstream">
      <div className="row">
        <span className="mono">{upstream.server}</span>
        <UpstreamBadge upstream={upstream} />
        <span className="spacer" />
        <button type="button" className="small" disabled={reconnecting} onClick={onReconnect}>
          Reconectar
        </button>
      </div>
      {upstream.state === "failed" && <pre className="error-text">{upstream.error}</pre>}
    </li>
  );
}
