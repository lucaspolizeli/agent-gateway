const TOKEN_FRAGMENT = /^#t=([^&/]+)(?:&(.*))?$/;

/**
 * `agw ui` opens `/ui/#t=<token>`. A route can follow after `&` (`#t=<token>&/servers/alpha`). The
 * returned `hash` is what the address bar shows once the token is gone, and the router reads it as usual.
 */
export function splitTokenFragment(hash: string): { token: string | undefined; hash: string } {
  const match = TOKEN_FRAGMENT.exec(hash);
  if (match === null) {
    return { token: undefined, hash };
  }
  const route = match[2];
  if (route === undefined || route === "") {
    return { token: match[1], hash: "" };
  }
  return { token: match[1], hash: `#${route}` };
}
