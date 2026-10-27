import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createAdminApi } from "./admin/api.ts";
import { ensureAdminToken } from "./admin/token.ts";
import { serveUi, UI_PREFIX } from "./admin/ui.ts";
import { errorMessage, HTTP_STATUS, UserError } from "./errors.ts";
import { createSessionServer } from "./gateway.ts";
import { GatewayPool } from "./pool.ts";

const MCP_ROUTE = /^\/mcp\/([a-z0-9-]+)\/?$/;

type Surface = {
  matches: (pathname: string) => boolean;
  /** Browser-facing surfaces refuse other Host headers, which blocks DNS rebinding. MCP checks its own. */
  checkHost: boolean;
  handle: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void;
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserError("invalid", "Request body is not valid JSON");
  }
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string) {
  res
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

function createMcpHandler(pool: GatewayPool, allowedHosts: string[]) {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const handle = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const match = MCP_ROUTE.exec(url.pathname);
    if (!match) {
      res.writeHead(404).end("Use /mcp/<profile>\n");
      return;
    }
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") {
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(404).end("Unknown session\n");
        return;
      }
      let body: unknown;
      if (req.method === "POST") {
        body = await readJson(req);
      }
      await transport.handleRequest(req, res, body);
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(400).end("Missing mcp-session-id\n");
      return;
    }
    const body = await readJson(req);
    if (!isInitializeRequest(body)) {
      res.writeHead(400).end("First request must be initialize\n");
      return;
    }
    const gateway = await pool.start(match[1]!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableDnsRebindingProtection: true,
      allowedHosts,
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };
    await createSessionServer(gateway).connect(transport);
    await transport.handleRequest(req, res, body);
  };
  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    try {
      await handle(req, res, url);
    } catch (error) {
      if (!(error instanceof UserError) || res.headersSent) {
        throw error;
      }
      sendJsonRpcError(res, HTTP_STATUS[error.kind], errorMessage(error));
    }
  };
}

/**
 * Serves every profile at `http://127.0.0.1:<port>/mcp/<profile>`, one upstream pool per profile,
 * plus the admin API at `/api` and the admin UI at `/ui/`.
 */
export function serveHttp(home: string, port: number) {
  const pool = new GatewayPool(home);
  pool.watch();
  const token = ensureAdminToken(home);
  const host = `127.0.0.1:${port}`;
  const allowedHosts = [host, `localhost:${port}`];
  const api = createAdminApi({ home, port, pool, token });

  const surfaces: Surface[] = [
    { matches: (path) => path.startsWith("/mcp/"), checkHost: false, handle: createMcpHandler(pool, allowedHosts) },
    { matches: (path) => path === "/api" || path.startsWith("/api/"), checkHost: true, handle: api },
    { matches: (path) => path.startsWith(UI_PREFIX), checkHost: true, handle: (_, res, url) => serveUi(home, url.pathname, res) },
    {
      matches: (path) => path === "/" || path === "/ui",
      checkHost: true,
      handle: (_, res) => {
        res.writeHead(302, { location: UI_PREFIX }).end();
      },
    },
  ];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const surface = surfaces.find((candidate) => candidate.matches(url.pathname));
    if (!surface) {
      res.writeHead(404).end("Use /mcp/<profile> or /ui/\n");
      return;
    }
    if (surface.checkHost && !allowedHosts.includes(req.headers.host ?? "")) {
      res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: "Host not allowed" }));
      return;
    }
    try {
      await surface.handle(req, res, url);
    } catch (error) {
      process.stderr.write(`[agent-gateway] ${req.method} ${url.pathname}: ${String(error)}\n`);
      if (!res.headersSent) {
        res.writeHead(500).end(`${String(error)}\n`);
      }
    }
  });

  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[agent-gateway] listening on http://${host}/mcp/<profile>, admin UI at http://${host}/ui/\n`);
  });

  const shutdown = async () => {
    server.close();
    await pool.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}
