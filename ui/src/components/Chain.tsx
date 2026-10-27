import { ChevronRightIcon } from "lucide-react";

/** A profile's inheritance chain, ancestors first: `global › globex › globex-med`. */
export function Chain({ chain }: { chain: string[] }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
      {chain.map((profile, index) => (
        <span key={profile} className="inline-flex items-center gap-0.5">
          {index > 0 && <ChevronRightIcon className="size-3" aria-hidden="true" />}
          {profile}
        </span>
      ))}
    </span>
  );
}
