import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const tokenFile = fileURLToPath(new URL("../state/admin-token", import.meta.url));

/** Mirrors what `agw serve` does in production, so the dev server talks to a running gateway. */
function injectAdminToken(): Plugin {
  return {
    name: "agw-admin-token",
    apply: "serve",
    transformIndexHtml() {
      if (!existsSync(tokenFile)) {
        return [];
      }
      const token = readFileSync(tokenFile, "utf8").trim();
      if (token === "") {
        return [];
      }
      return [{ tag: "meta", attrs: { name: "agw-token", content: token }, injectTo: "head" }];
    },
  };
}

export default defineConfig({
  base: "/ui/",
  plugins: [react(), injectAdminToken()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:7820",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
