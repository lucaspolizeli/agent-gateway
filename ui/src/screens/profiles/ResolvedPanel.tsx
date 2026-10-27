import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { ResolvedProfileView } from "../../contract.ts";
import { hrefFor } from "../../router.ts";

export function ResolvedPanel({ view }: { view: ResolvedProfileView }) {
  const servers = Object.entries(view.servers).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Group title="Servers" empty={servers.length === 0}>
        {servers.map(([server, from]) => (
          <li key={server} className="flex items-center gap-2">
            <a className="font-mono text-sm underline-offset-4 hover:underline" href={hrefFor({ screen: "servers", server })}>
              {server}
            </a>
            <Origin from={from} self={view.name} />
          </li>
        ))}
      </Group>
      <Group title="Skill sets" empty={view.skillSets.length === 0}>
        {view.skillSets.map((set) => (
          <li key={set}>
            <a className="text-sm underline-offset-4 hover:underline" href={hrefFor({ screen: "skills", view: "hub", set })}>
              {set}
            </a>
          </li>
        ))}
      </Group>
    </div>
  );
}

function Group({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {empty && <p className="text-sm text-muted-foreground">None.</p>}
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Origin({ from, self }: { from: string; self: string }) {
  if (from === self) {
    return <Badge>own</Badge>;
  }
  return <Badge variant="secondary">from {from}</Badge>;
}
