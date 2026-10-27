import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { adminTokenPath, readAdminToken } from "./admin/token.ts";
import type { ClientResult } from "./clients.ts";
import { loadConfig, resolveProfile } from "./config.ts";
import { createSessionServer, Gateway } from "./gateway.ts";
import { GatewayPool } from "./pool.ts";
import { serveHttp } from "./http.ts";
import {
  DEFAULT_PORT,
  installGlobal,
  installProject,
  listProjects,
  syncAll,
  type Transport,
  uninstallProject,
  unsafeProjectDir,
} from "./project.ts";
import { installService, restartService, serviceLogPath, uninstallService } from "./service.ts";
import { loadMenuState, renderMenu, runMenuAction } from "./menubar.ts";
import type { LinkReport } from "./skills.ts";

const USAGE = `agw - one MCP gateway and skill hub per company

  agw install <profile> [dir] [--http]   Wire a project (default: cwd) to a profile
  agw uninstall [dir]                    Remove the gateway entries and skill links
  agw global [--http]                    Wire the "global" profile at user level, link global skills
  agw sync                               Re-link skills and entries for every installed project
  agw status <profile>                   Connect to a profile's servers and report each one
  agw list                               Show profiles and installed projects
  agw stdio <profile>                    Run the gateway over stdio (what the clients launch)
  agw serve [--port N]                   Run the gateway over HTTP at /mcp/<profile>, admin UI at /ui/
  agw ui [route]                         Open the admin UI of the running agw serve (e.g. profiles/globex)
  agw service install|start|uninstall    Keep agw serve running at login through launchd (macOS)
  agw menubar                            Print the SwiftBar menu (see swiftbar/)

Home: ${"$"}AGW_HOME, else this repository. Port: --port, ${"$"}AGW_PORT, else ${DEFAULT_PORT}.`;

const home = process.env.AGW_HOME ?? dirname(import.meta.dirname);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    http: { type: "boolean", default: false },
    port: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const port = Number(values.port ?? process.env.AGW_PORT ?? DEFAULT_PORT);
let transport: Transport = "stdio";
if (values.http) {
  transport = "http";
}

function printClients(results: ClientResult[]) {
  for (const result of results) {
    let mark = "ok  ";
    if (!result.ok) {
      mark = "FAIL";
    }
    console.log(`  ${mark} ${result.client}: ${result.detail}`);
  }
}

/** The last line of a command that touches clients; a failed client or project also makes the exit code non-zero. */
function printSummary(results: ClientResult[], failedProjects = 0) {
  const failed = results.filter((result) => !result.ok).length;
  const parts = [`${results.length - failed} of ${results.length} clients ok`];
  if (failedProjects > 0) {
    parts.push(`${failedProjects} projects failed`);
  }
  console.log(`Summary: ${parts.join(", ")}`);
  if (failed > 0 || failedProjects > 0) {
    process.exitCode = 1;
  }
}

function printSkills(reports: LinkReport[]) {
  for (const report of reports) {
    const parts = [`+${report.linked.length}`, `-${report.removed.length}`];
    console.log(`  skills ${report.target}: ${parts.join(" ")}`);
    if (report.linked.length > 0) {
      console.log(`    linked: ${report.linked.join(", ")}`);
    }
    if (report.skipped.length > 0) {
      console.log(`    skipped (a non-gateway entry has the same name): ${report.skipped.join(", ")}`);
    }
  }
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`Missing <${name}>\n\n${USAGE}`);
    process.exit(1);
  }
  return value;
}

type Command = (rest: string[]) => void | Promise<void>;

const commands: Record<string, Command> = {
  stdio: async (rest) => {
    const pool = new GatewayPool(home);
    const gateway = await pool.start(requireArg(rest[0], "profile"));
    pool.watch();
    const server = createSessionServer(gateway);
    const transportStdio = new StdioServerTransport();
    transportStdio.onclose = () => {
      pool.closeAll().finally(() => process.exit(0));
    };
    await server.connect(transportStdio);
  },
  serve: () => {
    serveHttp(home, port);
  },
  status: async (rest) => {
    const profile = resolveProfile(loadConfig(home), requireArg(rest[0], "profile"));
    const gateway = new Gateway(home, profile);
    await gateway.start();
    console.log(`Profile ${profile.name} (${profile.chain.join(" > ")})`);
    for (const entry of await gateway.status()) {
      let detail = "";
      if (entry.state === "ready") {
        detail = `${entry.toolCount} tools`;
      } else if (entry.state === "failed") {
        detail = entry.error;
      }
      console.log(`  ${entry.state.padEnd(10)} ${entry.server}  ${detail}`);
    }
    console.log(`  skill sets: ${profile.skillSets.join(", ") || "(none)"}`);
    await gateway.close();
  },
  install: async (rest) => {
    const report = await installProject(home, rest[1] ?? process.cwd(), { profile: requireArg(rest[0], "profile"), transport }, port);
    console.log(`Installed profile ${report.profile} in ${report.dir}`);
    printClients(report.clients);
    printSkills(report.skills);
    printSummary(report.clients);
  },
  uninstall: async (rest) => {
    const report = await uninstallProject(home, rest[0] ?? process.cwd());
    console.log(`Uninstalled ${report.dir}`);
    printClients(report.clients);
    printSkills(report.skills);
    if (report.kept) {
      console.log(`  ${report.dir} is still recorded because a client entry was not removed; fix the failure and run "agw uninstall ${report.dir}" again`);
    }
    printSummary(report.clients);
  },
  global: async () => {
    const report = await installGlobal(home, transport, port);
    console.log("Installed profile global at user level");
    printClients(report.clients);
    printSkills(report.skills);
    printSummary(report.clients);
  },
  sync: async () => {
    const report = await syncAll(home, port);
    console.log("Global skills");
    printSkills(report.global);
    for (const project of report.applied) {
      console.log(`${project.dir} (${project.profile})`);
      printClients(project.clients);
      printSkills(project.skills);
    }
    for (const dir of report.missing) {
      console.log(`${dir}: folder is gone, run "agw uninstall ${dir}" to forget it`);
    }
    for (const dir of report.unsafe) {
      console.log(`${dir}: skipped, ${unsafeProjectDir(dir)}; run "agw uninstall ${dir}" to forget it`);
    }
    for (const { dir, error } of report.failed) {
      console.log(`${dir}: FAIL ${error}`);
    }
    printSummary(
      report.applied.flatMap((project) => project.clients),
      report.failed.length,
    );
  },
  menubar: async (rest) => {
    if (rest[0] !== undefined) {
      await runMenuAction(home, port, rest[0], rest.slice(1));
      return;
    }
    process.stdout.write(renderMenu(await loadMenuState(home, port, serviceLogPath(home)), join(home, "bin", "agw")));
  },
  ui: async (rest) => {
    const url = `http://127.0.0.1:${port}/ui/`;
    const running = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(
      () => true,
      () => false,
    );
    if (!running) {
      console.error(`Nothing answers at ${url}. Start it with "agw serve" or "agw service install".`);
      process.exit(1);
    }
    const token = readAdminToken(home);
    if (token === undefined) {
      console.error(`No admin token in ${adminTokenPath(home)}. Start "agw serve" from this home first.`);
      process.exit(1);
    }
    let opener = "xdg-open";
    if (process.platform === "darwin") {
      opener = "open";
    }
    let fragment = `t=${token}`;
    if (rest[0] !== undefined) {
      fragment = `${fragment}&/${rest[0]}`;
    }
    spawn(opener, [`${url}#${fragment}`], { detached: true, stdio: "ignore" }).unref();
    console.log(`Opened ${url}`);
  },
  service: (rest) => {
    const action = requireArg(rest[0], "install|uninstall");
    if (action === "install") {
      const path = installService(home, port);
      console.log(`Loaded ${path}; agw serve now runs at login, logs in ${serviceLogPath(home)}`);
    } else if (action === "start") {
      restartService();
      console.log("Restarted agw serve");
    } else if (action === "uninstall") {
      console.log(`Unloaded and removed ${uninstallService()}`);
    } else {
      console.error(`Unknown service action "${action}"\n\n${USAGE}`);
      process.exit(1);
    }
  },
  list: () => {
    const config = loadConfig(home);
    console.log("Profiles");
    for (const [name, profile] of Object.entries(config.profiles)) {
      const parents = profile.extends.map((parent) => ` extends ${parent}`).join("");
      console.log(`  ${name}${parents}: servers [${profile.servers.join(", ")}] skills [${profile.skills.join(", ")}]`);
    }
    console.log("Projects");
    for (const [dir, binding] of Object.entries(listProjects(home))) {
      console.log(`  ${dir} -> ${binding.profile} (${binding.transport})`);
    }
  },
};

async function main() {
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }
  const run = commands[command];
  if (!run) {
    console.error(`Unknown command "${command}"\n\n${USAGE}`);
    process.exit(1);
  }
  await run(rest);
}

main().catch((error: unknown) => {
  let message = String(error);
  if (error instanceof Error) {
    message = error.message;
  }
  console.error(message);
  process.exit(1);
});
