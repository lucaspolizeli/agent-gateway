import { existsSync, readFileSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

export const UI_PREFIX = "/ui/";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

const NOT_BUILT = `<!doctype html>
<html><head><meta charset="utf-8"><title>agent-gateway</title></head>
<body style="font-family: system-ui; max-width: 40rem; margin: 4rem auto">
<h1>The admin UI is not built</h1>
<p>From the agent-gateway folder, run:</p>
<pre>pnpm --dir ui install &amp;&amp; pnpm --dir ui build</pre>
<p>then reload this page.</p>
</body></html>
`;

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Stops another page from framing the UI and clickjacking the admin actions. */
const FRAMING_HEADERS = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
};

/**
 * Serves `<home>/ui/dist` under `/ui/`. Paths without a file extension fall back to index.html so the
 * SPA router can handle them; index.html is never cached. The pages carry no secret: `agw ui` hands
 * the admin token to the browser in the URL fragment, which is never sent over the network.
 */
export function serveUi(home: string, pathname: string, res: ServerResponse) {
  const dist = resolve(home, "ui", "dist");
  const index = join(dist, "index.html");
  if (!isFile(index)) {
    res.writeHead(503, { ...FRAMING_HEADERS, "content-type": CONTENT_TYPES[".html"]! }).end(NOT_BUILT);
    return;
  }
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice(UI_PREFIX.length));
  } catch {
    res.writeHead(400, FRAMING_HEADERS).end("Bad path\n");
    return;
  }
  const file = resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(404, FRAMING_HEADERS).end("Not found\n");
    return;
  }
  if (file !== index && isFile(file)) {
    const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { ...FRAMING_HEADERS, "content-type": type }).end(readFileSync(file));
    return;
  }
  if (file !== index && extname(file) !== "") {
    res.writeHead(404, FRAMING_HEADERS).end("Not found\n");
    return;
  }
  res
    .writeHead(200, { ...FRAMING_HEADERS, "content-type": CONTENT_TYPES[".html"]!, "cache-control": "no-store" })
    .end(readFileSync(index));
}
