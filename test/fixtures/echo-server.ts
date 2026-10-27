import { appendFileSync, existsSync } from "node:fs";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const label = process.env.ECHO_LABEL ?? "unset";
if (process.env.SPAWN_LOG) {
  appendFileSync(process.env.SPAWN_LOG, `${Date.now()}\n`);
}
if (process.env.FAIL_FLAG && existsSync(process.env.FAIL_FLAG)) {
  process.exit(1);
}

const server = new McpServer({ name: `echo-${label}`, version: "1.0.0" });
server.registerTool(
  "echo",
  { description: "Echoes text with the server label", inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: "text", text: `${label}:${text}` }] }),
);
server.registerTool("pid", { description: "Process id of this server" }, async () => ({
  content: [{ type: "text", text: String(process.pid) }],
}));
if (process.env.ALLOW_DIE) {
  server.registerTool("die", { description: "Exits this server right after answering" }, async () => {
    setTimeout(() => process.exit(1), 20);
    return { content: [{ type: "text", text: "bye" }] };
  });
}
server.registerPrompt("greet", { description: "Greeting" }, async () => ({
  messages: [{ role: "user", content: { type: "text", text: `hello from ${label}` } }],
}));
server.registerResource("shared", new ResourceTemplate("shared://{name}", { list: undefined }), { description: "Readable by name" }, async (uri, { name }) => ({
  contents: [{ uri: uri.href, text: `${label}:${name}` }],
}));
if (process.env.LIST_RESOURCES) {
  server.registerResource("doc", "shared://doc", { description: "Listed document" }, async (uri) => ({
    contents: [{ uri: uri.href, text: `${label}:doc` }],
  }));
}
await server.connect(new StdioServerTransport());
