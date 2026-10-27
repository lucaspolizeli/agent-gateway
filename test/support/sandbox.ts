import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..", "..");
const fixture = join(import.meta.dirname, "..", "fixtures", "echo-server.ts");

/**
 * Fake client CLIs keep one marker file per client, scope and folder, and refuse like the real ones:
 * adding what exists fails, and removing what does not exist prints `No MCP server named 'gw' ...`.
 * `<state>/<client>.fail-<verb>` makes that verb fail for the client.
 */
const FAKE_CLIENT = `#!/bin/sh
name=$(basename "$0")
echo "$name $*" >> "$CLI_LOG"
scope=user
prev=
for arg in "$@"; do
  if [ "$prev" = -s ]; then scope=$arg; fi
  prev=$arg
done
verb=$2
if [ -e "$FAKE_STATE/$name.fail-$verb" ]; then
  echo "$name exploded" >&2
  exit 1
fi
key="$FAKE_STATE/$name-$(pwd | tr / _)-$scope"
case "$verb" in
  add|add-json)
    if [ -e "$key" ]; then echo "MCP server gw already exists" >&2; exit 1; fi
    touch "$key"
    ;;
  remove)
    if [ ! -e "$key" ]; then echo "No MCP server named 'gw' in $scope config" >&2; exit 1; fi
    rm "$key"
    ;;
esac
`;

export type Sandbox = ReturnType<typeof createSandbox>;

export function createSandbox() {
  const base = mkdtempSync(join(tmpdir(), "agw-sandbox-"));
  const home = join(base, "home");
  const userHome = join(base, "user");
  const bin = join(base, "bin");
  const state = join(base, "fake-state");
  const log = join(base, "cli.log");
  for (const dir of [home, userHome, bin, state]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(log, "");
  for (const client of ["claude", "codex", "grok"]) {
    writeFileSync(join(bin, client), FAKE_CLIENT);
    chmodSync(join(bin, client), 0o755);
  }
  const env = {
    ...process.env,
    AGW_HOME: home,
    HOME: userHome,
    CODEX_HOME: join(userHome, ".codex"),
    AGW_NODE: process.execPath,
    PATH: `${bin}:${process.env.PATH}`,
    CLI_LOG: log,
    FAKE_STATE: state,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };

  const sandbox = {
    base,
    home,
    userHome,
    env,
    fixture,
    /** Writes gateway.json with an `echo` server and a `work` profile that has skill set `globex`. */
    writeConfig(profiles: Record<string, unknown> = { global: { skills: ["global"] }, work: { extends: ["global"], servers: ["alpha"], skills: ["globex"] } }) {
      writeFileSync(
        join(home, "gateway.json"),
        JSON.stringify({ servers: { alpha: { command: process.execPath, args: [fixture], env: { ECHO_LABEL: "alpha" } } }, profiles }),
      );
    },
    makeSkill(set: string, name: string) {
      const dir = join(home, "skills", set, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} things\n---\nBody\n`);
    },
    agw(args: string[], options: { cwd?: string } = {}) {
      return spawnSync(join(repo, "bin", "agw"), args, { env, encoding: "utf8", cwd: options.cwd });
    },
    failClient(client: string, verb: string, failing = true) {
      const marker = join(state, `${client}.fail-${verb}`);
      if (failing) {
        writeFileSync(marker, "");
      } else {
        execFileSync("rm", ["-f", marker]);
      }
    },
    cliLog(): string[] {
      return readFileSync(log, "utf8").split("\n").filter(Boolean);
    },
    project(name: string): string {
      const dir = join(base, name);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
  };
  sandbox.writeConfig();
  sandbox.makeSkill("global", "g1");
  sandbox.makeSkill("globex", "deploy");
  return sandbox;
}

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
}

/** A repository with one commit, so worktrees can be added to it. */
export function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", "README.md");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
}
