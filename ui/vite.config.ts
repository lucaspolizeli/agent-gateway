import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const agwHome = process.env.AGW_HOME ?? fileURLToPath(new URL("..", import.meta.url));
const tokenFile = join(agwHome, "state", "admin-token");
const agwPort = process.env.AGW_PORT ?? "7820";

/**
 * Prints the dev URL with the admin token in the fragment, the same hand-off `agw ui` does, so the dev
 * server never serves the token in a page any local process could fetch.
 */
function printAdminUrl(): Plugin {
  return {
    name: "agw-admin-url",
    apply: "serve",
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const local = server.resolvedUrls?.local[0];
        let token = "";
        if (existsSync(tokenFile)) {
          token = readFileSync(tokenFile, "utf8").trim();
        }
        if (local === undefined || token === "") {
          server.config.logger.warn(`  Admin UI: no token in ${tokenFile}. Start "agw serve" first, then restart Vite.`);
          return;
        }
        server.config.logger.info(`  Admin UI: ${local}#t=${token}`);
      };
    },
  };
}

export default defineConfig({
  base: "/ui/",
  plugins: [react(), printAdminUrl()],
  server: {
    proxy: {
      "/api": { target: `http://127.0.0.1:${agwPort}`, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
