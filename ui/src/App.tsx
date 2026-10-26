import type { ReactNode } from "react";
import { adminToken } from "./api/token.ts";
import { hrefFor, useRoute, type Route } from "./router.ts";
import { ProfilesScreen } from "./screens/ProfilesScreen.tsx";
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
import { ServersScreen } from "./screens/ServersScreen.tsx";
import { SkillsScreen } from "./screens/SkillsScreen.tsx";
import { StatusScreen } from "./screens/StatusScreen.tsx";

const tabs: Array<{ route: Route; label: string }> = [
  { route: { screen: "status" }, label: "Status" },
  { route: { screen: "servers" }, label: "Servidores" },
  { route: { screen: "profiles" }, label: "Perfis" },
  { route: { screen: "skills" }, label: "Skills" },
  { route: { screen: "projects" }, label: "Projetos" },
];

function renderScreen(route: Route): ReactNode {
  switch (route.screen) {
    case "status":
      return <StatusScreen />;
    case "servers":
      return <ServersScreen selected={route.server} />;
    case "profiles":
      return <ProfilesScreen selected={route.profile} />;
    case "skills":
      return <SkillsScreen set={route.set} skill={route.skill} />;
    case "projects":
      return <ProjectsScreen />;
  }
}

export function App() {
  const route = useRoute();
  const hasToken = adminToken() !== undefined;
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">agent-gateway</span>
        <nav className="tabs">
          {tabs.map((tab) => (
            <a
              key={tab.route.screen}
              className="tab"
              aria-current={tab.route.screen === route.screen}
              href={hrefFor(tab.route)}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </header>
      {!hasToken && <MissingTokenBanner />}
      {hasToken && <main className="content">{renderScreen(route)}</main>}
    </div>
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
