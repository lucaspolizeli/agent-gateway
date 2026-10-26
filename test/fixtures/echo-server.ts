import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const label = process.env.ECHO_LABEL ?? "unset";
const server = new McpServer({ name: `echo-${label}`, version: "1.0.0" });
server.registerTool(
  "echo",
  { description: "Echoes text with the server label", inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: "text", text: `${label}:${text}` }] }),
);
server.registerTool("pid", { description: "Process id of this server" }, async () => ({
  content: [{ type: "text", text: String(process.pid) }],
}));
server.registerPrompt("greet", { description: "Greeting" }, async () => ({
  messages: [{ role: "user", content: { type: "text", text: `hello from ${label}` } }],
}));
await server.connect(new StdioServerTransport());
