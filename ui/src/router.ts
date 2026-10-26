import { useEffect, useState } from "react";

export type Route =
  | { screen: "status" }
  | { screen: "servers"; server?: string }
  | { screen: "profiles"; profile?: string }
  | { screen: "skills"; set?: string; skill?: string }
  | { screen: "projects" };

export type Screen = Route["screen"];

function decode(segment: string | undefined): string | undefined {
  if (segment === undefined || segment === "") {
    return undefined;
  }
  return decodeURIComponent(segment);
}

const parsers: Record<Screen, (params: Array<string | undefined>) => Route> = {
  status: () => ({ screen: "status" }),
  servers: ([server]) => ({ screen: "servers", server }),
  profiles: ([profile]) => ({ screen: "profiles", profile }),
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
      return [route.profile];
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

export function navigate(route: Route) {
  window.location.hash = hrefFor(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
