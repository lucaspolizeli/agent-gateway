import type { ReactNode } from "react";

export type TabItem = { id: string; label: string; href: string; extra?: ReactNode };

export function Tabs({ items, current, label }: { items: TabItem[]; current: string; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <a key={item.id} className="tab" href={item.href} aria-current={item.id === current && "page"}>
          {item.label}
          {item.extra}
        </a>
      ))}
    </nav>
  );
}
