import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** The last row of an editor card, stuck to the bottom of the viewport so saving never needs a scroll. */
export function ActionBar({ status, children }: { status: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mb-(--card-spacing) in-data-[slot=card-content]:-mx-(--card-spacing) flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-(--card-spacing) py-3 backdrop-blur supports-backdrop-filter:bg-card/85">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm" aria-live="polite">
        {status}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function DirtyIndicator({ dirty }: { dirty: boolean }) {
  if (!dirty) {
    return <span className="text-muted-foreground">Sem alterações</span>;
  }
  return <Badge variant="warning">Alterações não salvas</Badge>;
}
