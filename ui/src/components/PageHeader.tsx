import type { ReactNode } from "react";

type Props = { title: string; description: string; actions?: ReactNode };

export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions !== undefined && <div className="page-actions">{actions}</div>}
    </header>
  );
}
