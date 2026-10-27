import type { ReactNode } from "react";

type Props = {
  /** Status text and problems. Takes the room it needs and wraps, so nothing is cut off. */
  messages: ReactNode;
  /** Buttons. They wrap under the messages when the bar is narrow. */
  children: ReactNode;
  className?: string;
};

/** Sticks to the bottom of the scrolling detail so saving never needs a scroll. */
export function ActionBar({ messages, children, className }: Props) {
  let barClass = "action-bar";
  if (className !== undefined) {
    barClass = `action-bar ${className}`;
  }
  return (
    <div className={barClass}>
      <div className="action-bar-messages">{messages}</div>
      <div className="action-bar-actions">{children}</div>
    </div>
  );
}

export function DirtyIndicator({ dirty }: { dirty: boolean }) {
  if (!dirty) {
    return <span className="dirty-indicator clean">sem alterações</span>;
  }
  return <span className="dirty-indicator">alterações não salvas</span>;
}
