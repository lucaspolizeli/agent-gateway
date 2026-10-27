import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { adminToken } from "./api/token.ts";
import { AppSidebar, type NavCount } from "./components/AppSidebar.tsx";
import { ErrorBox } from "./components/QueryState.tsx";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog.tsx";
import { hrefFor, screenHome, useRoute, type ProfileTab, type Route, type Screen } from "./router.ts";
import { ProfilesScreen } from "./screens/ProfilesScreen.tsx";
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
import { ServersScreen } from "./screens/ServersScreen.tsx";
import { SkillsScreen, skillsViewLabels } from "./screens/SkillsScreen.tsx";
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
      return <SkillsScreen route={route} />;
    case "projects":
      return <ProjectsScreen />;
  }
}

const screenLabels: Record<Screen, string> = {
  status: "Status",
  servers: "Servidores",
  profiles: "Perfis",
  skills: "Skills",
  projects: "Projetos",
};

const profileTabLabels: Record<ProfileTab, string> = { composicao: "Composição", tools: "Tools", segredos: "Segredos" };

type Crumb = { label: string; href?: string };

function crumbsFor(route: Route): Crumb[] {
  const home = { label: screenLabels[route.screen], href: hrefFor(screenHome[route.screen]) };
  switch (route.screen) {
    case "servers":
      return [home, ...optional(route.server)];
    case "profiles":
      if (route.profile === undefined) {
        return [home];
      }
      return [
        home,
        { label: route.profile, href: hrefFor({ screen: "profiles", profile: route.profile }) },
        { label: profileTabLabels[route.tab ?? "composicao"] },
      ];
    case "skills":
      if (route.view !== "hub") {
        return [home, { label: skillsViewLabels[route.view] }];
      }
      return [
        home,
        ...optional(route.set, hrefFor({ screen: "skills", view: "hub", set: route.set })),
        ...optional(route.skill),
      ];
    case "status":
    case "projects":
      return [home];
  }
}

function optional(label: string | undefined, href?: string): Crumb[] {
  if (label === undefined) {
    return [];
  }
  return [{ label, href }];
}

const WIDE_QUERY = "(min-width: 1100px)";

function useWideViewport(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(WIDE_QUERY);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
  );
}

function Shell({ route, sidebar, children }: { route: Route; sidebar: ReactNode; children: ReactNode }) {
  const wide = useWideViewport();
  const [open, setOpen] = useState(wide);
  const [seenWide, setSeenWide] = useState(wide);
  if (seenWide !== wide) {
    // Crossing the breakpoint resets the sidebar: full labels on wide screens, icons below.
    setSeenWide(wide);
    setOpen(wide);
  }
  const crumbs = crumbsFor(route);
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        onClick={() => document.querySelector<HTMLElement>("main")?.focus()}
      >
        Pular para o conteúdo
      </Button>
      {sidebar}
      <SidebarInset tabIndex={-1} className="min-w-0 outline-none">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, index) => (
                <Fragment key={`${index}:${crumb.label}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    <CrumbLabel crumb={crumb} last={index === crumbs.length - 1} />
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
      <UnsavedChangesDialog />
    </SidebarProvider>
  );
}

function CrumbLabel({ crumb, last }: { crumb: Crumb; last: boolean }) {
  if (last || crumb.href === undefined) {
    return <BreadcrumbPage className="max-w-60 truncate">{crumb.label}</BreadcrumbPage>;
  }
  return (
    <BreadcrumbLink href={crumb.href} className="max-w-60 truncate">
      {crumb.label}
    </BreadcrumbLink>
  );
}

export function App() {
  const route = useRoute();
  if (adminToken() === undefined) {
    return (
      <Shell route={route} sidebar={<AppSidebar current={route.screen} counts={{}} />}>
        <ErrorBox
          title="Sem acesso ao agw"
          message="Esta aba não tem o token de admin: abra pelo comando `agw ui`. Em desenvolvimento, use a URL com #t= que o Vite imprime ao iniciar."
        />
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
    status: { count: health.summary.attention.length, attention: true, label: "itens que precisam de atenção" },
    servers: { count: Object.keys(config.data?.servers ?? {}).length, attention: false, label: "servidores" },
    profiles: { count: Object.keys(config.data?.profiles ?? {}).length, attention: false, label: "perfis" },
    skills: {
      count: (skillSets.data ?? []).reduce((total, set) => total + set.skills.length, 0),
      attention: false,
      label: "skills",
    },
    projects: { count: projects.data?.length ?? 0, attention: false, label: "projetos" },
  };
  let summary = undefined;
  if (!health.isPending) {
    summary = health.summary;
  }
  return (
    <Shell route={route} sidebar={<AppSidebar current={route.screen} counts={counts} health={summary} />}>
      {renderScreen(route)}
    </Shell>
  );
}
