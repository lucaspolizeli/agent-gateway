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

export function launchAgentPlist(home: string, port: number): string {
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

function bootout() {
  try {
    execFileSync("launchctl", ["bootout", `${domain()}/${SERVICE_LABEL}`], { stdio: "ignore" });
  } catch {
    // Not loaded.
  }
}

/** Rewrites the agent and reloads it, so running it again picks up a new home or port. */
export function installService(home: string, port: number): string {
  const path = launchAgentPath();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(dirname(serviceLogPath(home)), { recursive: true });
  writeFileSync(path, launchAgentPlist(home, port));
  bootout();
  execFileSync("launchctl", ["bootstrap", domain(), path], { stdio: ["ignore", "pipe", "pipe"] });
  return path;
}

export function uninstallService(): string {
  const path = launchAgentPath();
  bootout();
  if (existsSync(path)) {
    rmSync(path);
  }
  return path;
}
