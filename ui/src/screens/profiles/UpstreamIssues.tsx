import type { UpstreamState } from "../../contract.ts";
import { CountBadge } from "../../components/CountBadge.tsx";
import { MutationStatus } from "../../components/MutationStatus.tsx";
import { reconnectVerdict } from "../../components/reconnectVerdict.ts";
import { StatusDot } from "../../components/StatusDot.tsx";
import { UpstreamBadge } from "../../components/UpstreamBadge.tsx";
import { missingSecretKeys } from "../../domain/health.ts";
import { hrefFor } from "../../router.ts";
import { useReconnectServer } from "../../state/profiles.ts";

/** Upstreams that are not `ready` contribute no tools, so this is where their absence is explained. */
export function UpstreamIssues({ profile, upstreams }: { profile: string; upstreams: UpstreamState[] }) {
  const issues = upstreams.filter((upstream) => upstream.state !== "ready");
  if (issues.length === 0) {
    return null;
  }
  return (
    <section className="upstream-issues" aria-label="Servidores sem tools">
      <header className="upstream-issues-header">
        <h3 className="section-title">Servidores sem tools</h3>
        <CountBadge count={issues.length} tone="danger" />
      </header>
      <ul className="upstream-issues-list">
        {issues.map((upstream) => (
          <UpstreamIssue key={upstream.server} profile={profile} upstream={upstream} />
        ))}
      </ul>
    </section>
  );
}

function UpstreamIssue({ profile, upstream }: { profile: string; upstream: UpstreamState }) {
  const reconnect = useReconnectServer();
  return (
    <li className="upstream-issue" data-feedback-scope>
      <StatusDot health={upstream.state} />
      <div className="upstream-issue-body">
        <div className="row">
          <a className="mono" href={hrefFor({ screen: "servers", server: upstream.server })}>
            {upstream.server}
          </a>
          <UpstreamBadge upstream={upstream} />
        </div>
        <IssueDetail profile={profile} upstream={upstream} />
        <MutationStatus mutation={reconnect} verdict={reconnectVerdict} />
      </div>
      <button
        type="button"
        className="small"
        disabled={reconnect.isPending}
        onClick={() => reconnect.mutate({ profile, server: upstream.server })}
      >
        Reconectar
      </button>
    </li>
  );
}

function IssueDetail({ profile, upstream }: { profile: string; upstream: UpstreamState }) {
  if (upstream.state === "connecting") {
    return <span className="muted small">Conectando… as tools aparecem quando o servidor responder.</span>;
  }
  if (upstream.state === "ready") {
    return null;
  }
  const keys = missingSecretKeys(upstream.error);
  return (
    <>
      <pre className="issue-error">{upstream.error}</pre>
      {keys.length > 0 && (
        <a className="small" href={hrefFor({ screen: "profiles", profile, tab: "segredos" })}>
          Definir {keys.join(", ")} na aba Segredos
        </a>
      )}
    </>
  );
}
