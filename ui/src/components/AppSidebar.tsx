import { ActivityIcon, BookOpenIcon, FolderGit2Icon, LayersIcon, ServerIcon, WaypointsIcon, type LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { HealthSummary } from "../domain/health.ts";
import { plural } from "../domain/format.ts";
import { hrefFor, screenHome, type Screen } from "../router.ts";

export type NavCount = { count: number; attention: boolean; label: string };

const items: Array<{ screen: Screen; label: string; icon: LucideIcon }> = [
  { screen: "status", label: "Status", icon: ActivityIcon },
  { screen: "servers", label: "Servers", icon: ServerIcon },
  { screen: "profiles", label: "Profiles", icon: LayersIcon },
  { screen: "skills", label: "Skills", icon: BookOpenIcon },
  { screen: "projects", label: "Projects", icon: FolderGit2Icon },
];

type Props = {
  current: Screen;
  counts: Partial<Record<Screen, NavCount>>;
  health?: HealthSummary;
};

function accessibleName(label: string, count: NavCount | undefined): string {
  if (count === undefined || count.count === 0) {
    return label;
  }
  return `${label}, ${count.count} ${count.label}`;
}

export function AppSidebar({ current, counts, health }: Props) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="agent-gateway">
              <a href={hrefFor(screenHome.status)}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <WaypointsIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">agent-gateway</span>
                  <span className="truncate text-xs text-muted-foreground">MCP and skills</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Sections">
              {items.map((item) => {
                const count = counts[item.screen];
                const name = accessibleName(item.label, count);
                return (
                  <SidebarMenuItem key={item.screen}>
                    <SidebarMenuButton asChild isActive={item.screen === current} tooltip={name}>
                      <a
                        href={hrefFor(screenHome[item.screen])}
                        aria-label={name}
                        aria-current={item.screen === current && "page"}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                    {count !== undefined && count.count > 0 && (
                      <SidebarMenuBadge
                        aria-hidden="true"
                        className={cn(count.attention && "bg-destructive/15 text-destructive")}
                      >
                        {count.count}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>{health !== undefined && <HealthLine health={health} />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function HealthLine({ health }: { health: HealthSummary }) {
  const failing = health.serversFailing;
  let tone = "bg-success";
  if (failing > 0) {
    tone = "bg-destructive";
  }
  if (health.running === 0) {
    tone = "bg-muted-foreground";
  }
  let summary = plural(health.running, "profile running", "profiles running");
  if (failing > 0) {
    summary = `${summary}, ${failing} failed`;
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={summary}>
          <a href={hrefFor(screenHome.status)} aria-label={`Gateway health: ${summary}`}>
            <span className="flex size-4 items-center justify-center" aria-hidden="true">
              <span className={cn("size-2 rounded-full", tone)} />
            </span>
            <span className="truncate text-xs text-muted-foreground">{summary}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
