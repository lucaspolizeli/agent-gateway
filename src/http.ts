import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createSessionServer } from "./gateway.ts";
import { GatewayPool } from "./pool.ts";

const ROUTE = /^\/mcp\/([a-z0-9-]+)\/?$/;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Serves every profile at `http://127.0.0.1:<port>/mcp/<profile>`, one upstream pool per profile. */
export function serveHttp(home: string, port: number) {
  const pool = new GatewayPool(home);
  pool.watch();
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const host = `127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    const match = ROUTE.exec(new URL(req.url ?? "/", `http://${host}`).pathname);
    if (!match) {
      res.writeHead(404).end("Use /mcp/<profile>\n");
      return;
    }
    try {
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
        allowedHosts: [host, `localhost:${port}`],
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
    } catch (error) {
      process.stderr.write(`[agent-gateway] ${req.method} ${req.url}: ${String(error)}\n`);
      if (!res.headersSent) {
        res.writeHead(500).end(`${String(error)}\n`);
      }
    }
  });

  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[agent-gateway] listening on http://${host}/mcp/<profile>\n`);
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
