import { CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClientResult, ProjectApplyResult } from "../contract.ts";
import { skillCounts } from "../domain/applyResult.ts";

export function ApplyResultView({ result }: { result: ProjectApplyResult }) {
  const counts = skillCounts(result);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={result.dir}>
          {result.dir}
        </span>
        {result.clients.map((client) => (
          <ClientBadge key={client.client} client={client} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        skills: {counts.linked} linkadas · {counts.removed} removidas · {counts.skipped} ignoradas
      </p>
      {result.clients
        .filter((client) => !client.ok)
        .map((client) => (
          <p key={client.client} className="text-xs text-destructive">
            <span className="font-medium">{client.client}:</span> {client.detail}
          </p>
        ))}
    </div>
  );
}

function ClientBadge({ client }: { client: ClientResult }) {
  let badge = (
    <Badge variant="destructive" tabIndex={0}>
      <XIcon data-icon="inline-start" />
      {client.client}
    </Badge>
  );
  if (client.ok) {
    badge = (
      <Badge variant="success" tabIndex={0}>
        <CheckIcon data-icon="inline-start" />
        {client.client}
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{client.detail}</TooltipContent>
    </Tooltip>
  );
}
