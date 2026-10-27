import type { ReactNode } from "react";

/** Sticks to the bottom of the scrolling detail so saving never needs a scroll. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

export function DirtyIndicator({ dirty }: { dirty: boolean }) {
  if (!dirty) {
    return <span className="dirty-indicator clean">sem alterações</span>;
  }
  return <span className="dirty-indicator">alterações não salvas</span>;
}
