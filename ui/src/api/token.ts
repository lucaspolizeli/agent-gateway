import { splitTokenFragment } from "./tokenFragment.ts";

const STORAGE_KEY = "agw-admin-token";

/**
 * Moves the token from the URL fragment into `sessionStorage` and rewrites the address bar without it,
 * so it does not stay in the history, a bookmark or a screenshot. Must run before the router reads the hash.
 */
export function captureAdminToken() {
  const { token, hash } = splitTokenFragment(window.location.hash);
  if (token === undefined) {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, token);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
}

export function adminToken(): string | undefined {
  return sessionStorage.getItem(STORAGE_KEY) ?? undefined;
}
