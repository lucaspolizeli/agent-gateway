import type { ReactNode } from "react";
import type { HealthSummary } from "../domain/health.ts";
import { plural } from "../domain/format.ts";
import { hrefFor, type Screen } from "../router.ts";
import { CountBadge } from "./CountBadge.tsx";
import type { Tone } from "./Badge.tsx";
import { ProfilesIcon, ProjectsIcon, ServersIcon, SkillsIcon, StatusIcon } from "./Icons.tsx";

export type NavCount = { count: number; tone: Tone; label: string };

const items: Array<{ screen: Screen; label: string; icon: ReactNode }> = [
  { screen: "status", label: "Status", icon: <StatusIcon /> },
  { screen: "servers", label: "Servidores", icon: <ServersIcon /> },
  { screen: "profiles", label: "Perfis", icon: <ProfilesIcon /> },
  { screen: "skills", label: "Skills", icon: <SkillsIcon /> },
  { screen: "projects", label: "Projetos", icon: <ProjectsIcon /> },
];

type Props = {
  current: Screen;
  counts: Partial<Record<Screen, NavCount>>;
  health?: HealthSummary;
};

export function Sidebar({ current, counts, health }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">agent-gateway</span>
      </div>
      <nav className="nav" aria-label="Seções">
        {items.map((item) => {
          const count = counts[item.screen];
          return (
            <a
              key={item.screen}
              className="nav-item"
              href={hrefFor({ screen: item.screen })}
              aria-current={item.screen === current && "page"}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
              {count !== undefined && <CountBadge count={count.count} tone={count.tone} label={count.label} />}
            </a>
          );
        })}
      </nav>
      <span className="spacer" />
      {health !== undefined && <HealthLine health={health} />}
    </aside>
  );
}

function HealthLine({ health }: { health: HealthSummary }) {
  const failing = health.serversFailing;
  let dot = "dot-ready";
  if (failing > 0) {
    dot = "dot-failed";
  }
  if (health.running === 0) {
    dot = "dot-unknown";
  }
  return (
    <a className="health-line" href={hrefFor({ screen: "status" })} aria-label="Saúde do gateway">
      <span className={`dot ${dot}`} aria-hidden="true" />
      <span>
        {plural(health.running, "perfil rodando", "perfis rodando")}
        {failing > 0 && <span className="health-fail"> · {plural(failing, "falha", "falhas")}</span>}
      </span>
    </a>
  );
}
