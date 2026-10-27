# agent-gateway reference

This page lists the commands, the configuration format, the files, and the admin API. To install `agw`, follow the [README](../README.md). For the reasons behind the design, read [How agent-gateway works](how-it-works.md).

## Commands

| Command | What it does |
|---|---|
| `agw install <profile> [dir] [--http]` | Binds a repository to a profile. Registers `gw` in Claude Code, Codex, and Grok, and links the profile's skill sets. `dir` defaults to the current directory. `--http` points the clients at `agw serve` instead of a stdio process. |
| `agw uninstall [dir]` | Removes the `gw` entries, the skill links, and the `.git/info/exclude` block from a repository, and forgets the binding. |
| `agw global [--http]` | Registers the `global` profile at user level in every client and links the global skills. |
| `agw sync` | Re-applies every installed repository and makes every user-level skill visible to all clients. Reports each repository as applied, missing, unsafe, or failed. |
| `agw status <profile>` | Starts every server of a profile, prints each server's state and tool count, and stops them. |
| `agw list` | Prints the profiles and the installed repositories. |
| `agw stdio <profile>` | Runs the gateway over stdio. Clients start this command. You do not run it by hand. |
| `agw serve [--port N]` | Runs the gateway over HTTP, with `/mcp/<profile>`, `/api`, and `/ui/`. |
| `agw ui [route]` | Opens the web UI of the running `agw serve`. `route` opens a screen directly, for example `profiles/acme/secrets`. |
| `agw service install` | Writes `~/Library/LaunchAgents/dev.agent-gateway.plist` and loads it. The agent runs `agw serve` at login, keeps it alive, and uses the `PATH` of the installing shell. macOS only. |
| `agw service start` | Restarts the launchd agent. |
| `agw service uninstall` | Unloads and deletes the launchd agent. |
| `agw menubar` | Prints the SwiftBar menu. `swiftbar/agw.10s.sh` calls it every 10 seconds. |
| `agw skills list` | Prints every user-level skill and its origin: `hub`, `managed`, or `unmanaged`. |
| `agw skills import <path> <set>` | Moves an unmanaged skill folder into a hub set and links it back. Refuses skills listed in `~/.agents/.skill-lock.json`. |
| `agw skills doctor [dir]` | Asks Claude Code, Codex, and Grok which skills they discover in `dir`, or at user level when `dir` is omitted. |

`install`, `uninstall`, `global`, `sync`, and `skills doctor` exit with status 1 when any client, repository, or skill fails. They print a summary line.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `AGW_HOME` | The repository that contains `bin/agw` | Folder that holds `gateway.json`, `secrets/`, `skills/`, and `state/`. |
| `AGW_PORT` | `7820` | Port for `agw serve`, `agw ui`, `--http` installs, and the menu. `--port` overrides it. |
| `AGW_NODE` | `~/.nvm/versions/node/v<.nvmrc>/bin/node`, then `node` on the `PATH` | Node binary that `bin/agw` runs. |

## gateway.json

`gateway.json` has two keys, `servers` and `profiles`. `agw` rejects unknown keys.

### servers

Each key is a server name: lowercase letters and digits, separated by single hyphens. The name `gateway` is reserved.

A stdio server has these fields:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `command` | string | yes | Program to start. |
| `args` | string[] | no | Arguments. |
| `env` | object | no | Extra environment variables, added to the gateway's environment. |
| `cwd` | string | no | Working directory. |

A remote server has these fields:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `url` | string | yes | Streamable HTTP endpoint. |
| `headers` | object | no | HTTP headers sent with every request. |

Any string field can contain `${NAME}`. `agw` replaces it with the value from the profile's secrets files, then from the process environment. If the value is missing, the server fails with `Missing secret ${NAME}`.

### profiles

| Field | Type | Meaning |
|---|---|---|
| `extends` | string[] | Profiles to inherit from. Cycles are rejected. |
| `servers` | string[] | Server names that this profile adds. |
| `skills` | string[] | Skill sets that this profile adds. |
| `hiddenTools` | string[] | Tools to hide, as `<server>__<tool>`. Descendants inherit the hiding. |

## Files

| Path | Committed | Contents |
|---|---|---|
| `gateway.json` | no | Servers and profiles. |
| `gateway.example.json` | yes | A starting point for `gateway.json`. |
| `secrets/<profile>.env` | no | `KEY=value` lines, mode 0600. |
| `skills/<set>/<skill>/SKILL.md` | no | Hub skills. |
| `state/projects.json` | no | Installed repositories and the user-level install. |
| `state/admin-token` | no | Token for the admin API, mode 0600. |
| `state/serve.log` | no | Log of the launchd agent. |
| `state/backups/` | no | Copies of client configs taken before a migration. |
| `swiftbar/agw.10s.sh` | yes | SwiftBar plugin. |

## Where each client reads its configuration

| | Claude Code | Codex | Grok |
|---|---|---|---|
| Repository `gw` entry | `~/.claude.json`, local scope | `<repo>/.codex/config.toml` (trusted projects only) | `<repo>/.grok/config.toml` |
| User `gw` entry | `~/.claude.json`, user scope | `~/.codex/config.toml` | `~/.grok/config.toml` |
| Repository skills | `<repo>/.claude/skills` | `<repo>/.agents/skills` | `<repo>/.claude/skills`, `<repo>/.grok/skills` |
| User skills | `~/.claude/skills` | `~/.agents/skills` | `~/.claude/skills`, `~/.grok/skills` |

## Timeouts and retries

| Setting | Value |
|---|---|
| Upstream connect timeout | 30 seconds |
| Upstream tool call timeout | 10 minutes, reset by progress notifications |
| Retry after a failed connect or a lost connection | 1 s, doubling, capped at 60 s |
| Client CLI calls during install, uninstall, and sync | 30 seconds each |
| Skills doctor probes | about 60 s for Claude Code, about 20 s for Codex and Grok |

## SKILL.md rules checked by the doctor

- The frontmatter `name` equals the folder name.
- The `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$` and has at most 64 characters.
- The `description` exists and has at most 1024 characters.

## Admin API

`agw serve` exposes the API at `http://127.0.0.1:<port>/api`. Every request needs the header `x-agw-token` with the contents of `state/admin-token`. A request with another `Host` header gets 403. Errors return `{ "error": "<message>" }` with status 400, 404, 409, or 500. The request and response types are in `src/admin/contract.ts`.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/config` | | `GatewayConfig` |
| `POST /api/config/edits` | `ConfigEdit` | `GatewayConfig` |
| `GET /api/profiles` | | `ResolvedProfileView[]` |
| `GET /api/profiles/:name/status` | | `ProfileStatus`. Add `?start=1` to start the profile. |
| `POST /api/profiles/:name/servers/:server/reconnect` | | `ProfileStatus` |
| `POST /api/servers/test` | `ServerTestRequest` | `ServerTestResult` |
| `GET /api/secrets` | | `SecretsView[]`, key names only |
| `PUT /api/secrets/:profile/:key` | `{ value }` | `SecretsView` |
| `DELETE /api/secrets/:profile/:key` | | `SecretsView` |
| `GET /api/skills` | | `SkillSet[]` |
| `POST /api/skills/sets` | `{ name }` | `SkillSet[]` |
| `GET /api/skills/:set/:name` | | `SkillDocument` |
| `PUT /api/skills/:set/:name` | `{ content }` | `SkillDocument`. Creates the skill if it does not exist. |
| `POST /api/skills/:set/:name/move` | `{ toSet }` | `SkillSet[]` |
| `DELETE /api/skills/:set/:name` | | `SkillSet[]` |
| `GET /api/skills/importable` | | `ImportableSkill[]` |
| `POST /api/skills/import` | `{ path, toSet }` | `SkillSet[]` |
| `GET /api/skills/user` | | Every user-level skill with its `SkillOrigin` |
| `POST /api/skills/doctor` | `{ dir? }` | `SkillsDoctorReport` |
| `GET /api/projects` | | `ProjectView[]` |
| `POST /api/projects` | `{ dir, profile, transport }` | `ProjectApplyResult` |
| `DELETE /api/projects` | `{ dir }` | `ProjectApplyResult` |
| `POST /api/sync` | | `SyncResult` |

`ConfigEdit` has one of these `op` values: `upsertServer`, `removeServer`, `renameServer`, `upsertProfile`, `removeProfile`, and `setToolHidden`.
