import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVICE_LABEL = "dev.agent-gateway";

export function launchAgentPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
}

export function serviceLogPath(home: string): string {
  return join(home, "state", "serve.log");
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * launchd starts agents with a bare PATH, so the upstream commands (`npx`, `uv`, `node`) would not be found.
 * The agent gets the PATH of the shell that installed it.
 */
export function launchAgentPlist(home: string, port: number, path: string): string {
  const args = [join(home, "bin", "agw"), "serve", "--port", String(port)];
  const log = xml(serviceLogPath(home));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${xml(arg)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGW_HOME</key>
    <string>${xml(home)}</string>
    <key>PATH</key>
    <string>${xml(path)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

function domain(): string {
  return `gui/${process.getuid!()}`;
}

function isLoaded(): boolean {
  try {
    execFileSync("launchctl", ["print", `${domain()}/${SERVICE_LABEL}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** `bootout` returns before the agent is gone, and a `bootstrap` in that window fails with error 5. */
function bootout() {
  try {
    execFileSync("launchctl", ["bootout", `${domain()}/${SERVICE_LABEL}`], { stdio: "ignore" });
  } catch {
    // Not loaded.
  }
  const deadline = Date.now() + 10_000;
  while (isLoaded() && Date.now() < deadline) {
    execFileSync("sleep", ["0.2"]);
  }
}

/** Rewrites the agent and reloads it, so running it again picks up a new home or port. */
export function installService(home: string, port: number): string {
  const path = launchAgentPath();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(dirname(serviceLogPath(home)), { recursive: true });
  writeFileSync(path, launchAgentPlist(home, port, process.env.PATH ?? "/usr/bin:/bin"));
  bootout();
  execFileSync("launchctl", ["bootstrap", domain(), path], { stdio: ["ignore", "pipe", "pipe"] });
  return path;
}

/** Restarts the loaded agent, or starts it if it exited. */
export function restartService(): void {
  execFileSync("launchctl", ["kickstart", "-k", `${domain()}/${SERVICE_LABEL}`], { stdio: ["ignore", "pipe", "pipe"] });
}

export function uninstallService(): string {
  const path = launchAgentPath();
  bootout();
  if (existsSync(path)) {
    rmSync(path);
  }
  return path;
}
