import { useRef, type ReactNode } from "react";
import { adminToken } from "./api/token.ts";
import { Sidebar, type NavCount } from "./components/Sidebar.tsx";
import { useRoute, type Route, type Screen } from "./router.ts";
import { ProfilesScreen } from "./screens/ProfilesScreen.tsx";
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
import { ServersScreen } from "./screens/ServersScreen.tsx";
import { SkillsScreen } from "./screens/SkillsScreen.tsx";
import { StatusScreen } from "./screens/StatusScreen.tsx";
import { useConfig } from "./state/config.ts";
import { useGatewayHealth } from "./state/health.ts";
import { useProjects } from "./state/projects.ts";
import { useSkillSets } from "./state/skills.ts";

function renderScreen(route: Route): ReactNode {
  switch (route.screen) {
    case "status":
      return <StatusScreen />;
    case "servers":
      return <ServersScreen selected={route.server} />;
    case "profiles":
      return <ProfilesScreen selected={route.profile} tab={route.tab} />;
    case "skills":
      return <SkillsScreen set={route.set} skill={route.skill} />;
    case "projects":
      return <ProjectsScreen />;
  }
}

function Shell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  return (
    <div className="app">
      <button type="button" className="skip-link" onClick={() => main.current?.focus()}>
        Pular para o conteúdo
      </button>
      {sidebar}
      <main className="main" ref={main} tabIndex={-1}>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export function App() {
  const route = useRoute();
  if (adminToken() === undefined) {
    return (
      <Shell sidebar={<Sidebar current={route.screen} counts={{}} />}>
        <MissingTokenBanner />
      </Shell>
    );
  }
  return <ConnectedApp route={route} />;
}

function ConnectedApp({ route }: { route: Route }) {
  const config = useConfig();
  const health = useGatewayHealth();
  const skillSets = useSkillSets();
  const projects = useProjects();
  const counts: Partial<Record<Screen, NavCount>> = {
    status: { count: health.summary.attention.length, tone: "danger", label: "itens que precisam de atenção" },
    servers: { count: Object.keys(config.data?.servers ?? {}).length, tone: "neutral", label: "servidores" },
    profiles: { count: Object.keys(config.data?.profiles ?? {}).length, tone: "neutral", label: "perfis" },
    skills: {
      count: (skillSets.data ?? []).reduce((total, set) => total + set.skills.length, 0),
      tone: "neutral",
      label: "skills",
    },
    projects: { count: projects.data?.length ?? 0, tone: "neutral", label: "projetos" },
  };
  let summary = undefined;
  if (!health.isPending) {
    summary = health.summary;
  }
  return (
    <Shell sidebar={<Sidebar current={route.screen} counts={counts} health={summary} />}>
      {renderScreen(route)}
    </Shell>
  );
}

function MissingTokenBanner() {
  return (
    <div className="banner" role="alert">
      <b>Sem acesso ao agw.</b> Esta aba não tem o token de admin: abra pelo comando <code>agw ui</code>. Em
      desenvolvimento, use a URL com <code>#t=</code> que o Vite imprime ao iniciar.
    </div>
  );
}
