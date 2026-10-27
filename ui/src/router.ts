import { useEffect, useState } from "react";
import { confirmLeave } from "./state/unsaved.ts";

export const profileTabs = ["composicao", "tools", "segredos"] as const;

export type ProfileTab = (typeof profileTabs)[number];

export type Route =
  | { screen: "status" }
  | { screen: "servers"; server?: string }
  | { screen: "profiles"; profile?: string; tab?: ProfileTab }
  | { screen: "skills"; set?: string; skill?: string }
  | { screen: "projects" };

export type Screen = Route["screen"];

function decode(segment: string | undefined): string | undefined {
  if (segment === undefined || segment === "") {
    return undefined;
  }
  return decodeURIComponent(segment);
}

function parseTab(segment: string | undefined): ProfileTab | undefined {
  return profileTabs.find((tab) => tab === segment);
}

const parsers: Record<Screen, (params: Array<string | undefined>) => Route> = {
  status: () => ({ screen: "status" }),
  servers: ([server]) => ({ screen: "servers", server }),
  profiles: ([profile, tab]) => ({ screen: "profiles", profile, tab: parseTab(tab) }),
  skills: ([set, skill]) => ({ screen: "skills", set, skill }),
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

function paramsOf(route: Route): Array<string | undefined> {
  switch (route.screen) {
    case "servers":
      return [route.server];
    case "profiles":
      return [route.profile, route.tab];
    case "skills":
      return [route.set, route.skill];
    case "status":
    case "projects":
      return [];
  }
}

export function hrefFor(route: Route): string {
  const encoded = paramsOf(route)
    .filter((param) => param !== undefined)
    .map(encodeURIComponent);
  return `#/${[route.screen, ...encoded].join("/")}`;
}

/** The hash that has been shown to the user, so a refused navigation can put the address bar back. */
let shownHash = "";
/** The hash `navigate` already got confirmation for, so its `hashchange` does not ask a second time. */
let approvedHash: string | undefined;

/** Returns false when the user kept their unsaved edits instead of leaving. `confirmed` skips the question. */
export function navigate(route: Route, options: { confirmed?: boolean } = {}): boolean {
  const next = hrefFor(route);
  if (next === window.location.hash) {
    return true;
  }
  if (options.confirmed !== true && !confirmLeave()) {
    return false;
  }
  approvedHash = next;
  window.location.hash = next;
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
      if (!approved && !confirmLeave()) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${shownHash}`);
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
