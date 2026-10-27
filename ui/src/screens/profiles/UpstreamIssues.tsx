import { RotateCwIcon } from "lucide-react";
import type { UpstreamState } from "../../contract.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { withFeedback } from "../../components/feedback.ts";
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
    <section aria-label="Servers without tools" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Servers without tools
        <Badge variant="destructive">{issues.length}</Badge>
      </h3>
      <ItemGroup className="gap-2">
        {issues.map((upstream) => (
          <UpstreamIssue key={upstream.server} profile={profile} upstream={upstream} />
        ))}
      </ItemGroup>
    </section>
  );
}

function UpstreamIssue({ profile, upstream }: { profile: string; upstream: UpstreamState }) {
  const reconnect = useReconnectServer();
  const vars = { profile, server: upstream.server };
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemMedia className="pt-1.5">
        <StatusDot health={upstream.state} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <a className="font-mono underline-offset-4 hover:underline" href={hrefFor({ screen: "servers", server: upstream.server })}>
            {upstream.server}
          </a>
          <UpstreamBadge upstream={upstream} />
        </ItemTitle>
        <IssueDetail profile={profile} upstream={upstream} />
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reconnect.isPending}
          onClick={() => void withFeedback(reconnect.mutateAsync(vars), (status) => reconnectVerdict(status, vars))}
        >
          {reconnect.isPending && <Spinner />}
          {!reconnect.isPending && <RotateCwIcon />}
          Reconnect
        </Button>
      </ItemActions>
    </Item>
  );
}

function IssueDetail({ profile, upstream }: { profile: string; upstream: UpstreamState }) {
  if (upstream.state === "connecting") {
    return <p className="text-xs text-muted-foreground">Connecting… Tools appear when the server responds.</p>;
  }
  if (upstream.state === "ready") {
    return null;
  }
  const keys = missingSecretKeys(upstream.error);
  return (
    <>
      <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-destructive">
        {upstream.error}
      </pre>
      {keys.length > 0 && (
        <a
          className="text-xs font-medium underline underline-offset-4"
          href={hrefFor({ screen: "profiles", profile, tab: "secrets" })}
        >
          Set {keys.join(", ")} on the Secrets tab
        </a>
      )}
    </>
  );
}
