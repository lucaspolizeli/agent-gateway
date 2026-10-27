import { useEffect, useState } from "react";
import { confirmLeave, hasUnsavedChanges } from "./state/unsaved.ts";

export const profileTabs = ["composicao", "tools", "segredos"] as const;

export type ProfileTab = (typeof profileTabs)[number];

export const skillsViews = ["hub", "todas", "diagnostico"] as const;

export type SkillsView = (typeof skillsViews)[number];

export type Route =
  | { screen: "status" }
  | { screen: "servers"; server?: string }
  | { screen: "profiles"; profile?: string; tab?: ProfileTab }
  | { screen: "skills"; view: "hub"; set?: string; skill?: string }
  | { screen: "skills"; view: "todas" | "diagnostico" }
  | { screen: "projects" };

export type Screen = Route["screen"];

export const screenHome: Record<Screen, Route> = {
  status: { screen: "status" },
  servers: { screen: "servers" },
  profiles: { screen: "profiles" },
  skills: { screen: "skills", view: "hub" },
  projects: { screen: "projects" },
};

/** Skill set names are slugs, so a `~` segment can never be mistaken for a set. */
const VIEW_PREFIX = "~";

function decode(segment: string | undefined): string | undefined {
  if (segment === undefined || segment === "") {
    return undefined;
  }
  return decodeURIComponent(segment);
}

function parseTab(segment: string | undefined): ProfileTab | undefined {
  return profileTabs.find((tab) => tab === segment);
}

function parseSkills([first, skill]: Array<string | undefined>): Route {
  const view = skillsViews.find((candidate) => `${VIEW_PREFIX}${candidate}` === first);
  if (view === "todas" || view === "diagnostico") {
    return { screen: "skills", view };
  }
  return { screen: "skills", view: "hub", set: first, skill };
}

const parsers: Record<Screen, (params: Array<string | undefined>) => Route> = {
  status: () => ({ screen: "status" }),
  servers: ([server]) => ({ screen: "servers", server }),
  profiles: ([profile, tab]) => ({ screen: "profiles", profile, tab: parseTab(tab) }),
  skills: parseSkills,
  projects: () => ({ screen: "projects" }),
};

function isScreen(value: string): value is Screen {
  return Object.hasOwn(parsers, value);
}

export function parseHash(hash: string): Route {
  const [screen = "", ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (!isScreen(screen)) {
    return { screen: "status" };
  }
  return parsers[screen](rest.map(decode));
}

function segmentsOf(route: Route): string[] {
  switch (route.screen) {
    case "servers":
      return [route.server].filter((param) => param !== undefined).map(encodeURIComponent);
    case "profiles":
      return [route.profile, route.tab].filter((param) => param !== undefined).map(encodeURIComponent);
    case "skills":
      if (route.view !== "hub") {
        return [`${VIEW_PREFIX}${route.view}`];
      }
      return [route.set, route.skill].filter((param) => param !== undefined).map(encodeURIComponent);
    case "status":
    case "projects":
      return [];
  }
}

export function hrefFor(route: Route): string {
  return `#/${[route.screen, ...segmentsOf(route)].join("/")}`;
}

/** The hash that has been shown to the user, so a refused navigation can put the address bar back. */
let shownHash = "";
/** The hash `navigate` already got confirmation for, so its `hashchange` does not ask a second time. */
let approvedHash: string | undefined;

function go(next: string) {
  approvedHash = next;
  window.location.hash = next;
}

/** Resolves to false when the user kept their unsaved edits instead of leaving. `confirmed` skips the question. */
export async function navigate(route: Route, options: { confirmed?: boolean } = {}): Promise<boolean> {
  const next = hrefFor(route);
  if (next === window.location.hash) {
    return true;
  }
  if (options.confirmed !== true && !(await confirmLeave())) {
    return false;
  }
  go(next);
  return true;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => {
    shownHash = window.location.hash;
    return parseHash(shownHash);
  });
  useEffect(() => {
    const onChange = () => {
      const next = window.location.hash;
      const approved = approvedHash === next;
      approvedHash = undefined;
      if (!approved && hasUnsavedChanges()) {
        // A plain link was followed: put the address back while the user decides, then follow it if they leave.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${shownHash}`);
        void confirmLeave().then((leave) => {
          if (leave) {
            go(next);
          }
        });
        return;
      }
      shownHash = next;
      setRoute(parseHash(next));
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
