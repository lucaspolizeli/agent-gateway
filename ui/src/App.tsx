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
      {adminToken === undefined && <MissingTokenBanner />}
      <main className="content">{renderScreen(route)}</main>
    </div>
  );
}

function MissingTokenBanner() {
  return (
    <div className="banner" role="alert">
      <b>Sem conexão com o agw.</b> Nenhum token de admin foi encontrado nesta página. Rode <code>agw serve</code> e
      recarregue. Em desenvolvimento, o Vite lê o token de <code>state/admin-token</code>, criado pelo{" "}
      <code>agw serve</code>.
    </div>
  );
}
