# agent-gateway

`agw` gives each company you work for one MCP server and one set of agent skills. It works the same way in Claude Code, Codex, and Grok.

You describe your MCP servers once in `gateway.json` and group them into profiles, one per company or project. In each repository you run `agw install <profile>`. From then on, every coding agent that opens that repository sees a single MCP server named `gw`. That server exposes the tools of the profile and nothing else. Skills follow the same rule: global skills are available everywhere, and a company's skills appear only in that company's repositories.

A local web UI and an optional macOS menu bar icon let you edit servers, profiles, secrets, and skills without touching files.

To understand the design, read [How agent-gateway works](docs/how-it-works.md). For every command, config field, and API route, see the [reference](docs/reference.md).

## Requirements

- macOS or Linux. The background service and the menu bar icon are macOS only.
- Node.js 24, installed through [nvm](https://github.com/nvm-sh/nvm). The repository pins the version in `.nvmrc`.
- [pnpm](https://pnpm.io) 10.
- Git.
- At least one of the clients: [Claude Code](https://code.claude.com), [Codex CLI](https://github.com/openai/codex), or Grok CLI. `agw` configures the ones it finds and reports the others as failed.

## Install agent-gateway

The checkout is also the gateway's home: it holds your `gateway.json`, secrets, skills, and runtime state. `.gitignore` lists all four, so your own data never enters this repository. The examples below use `~/.agw`.

1. Clone the repository:

	```sh
	git clone https://github.com/lucaspolizeli/agent-gateway.git ~/.agw
	cd ~/.agw
	```

2. Install the Node version and the dependencies:

	```sh
	nvm install
	pnpm install
	pnpm --dir ui install
	```

3. Build the web UI:

	```sh
	pnpm --dir ui build
	```

	The build first runs `check-ui-kit`. It fails if a screen uses a raw HTML control instead of a component from the UI kit.

4. Put `agw` on your `PATH`:

	```sh
	ln -s ~/.agw/bin/agw ~/.local/bin/agw
	```

	Any directory on your `PATH` works. `bin/agw` finds the Node version from `.nvmrc` on its own, so clients can start it even when they do not load your shell profile.

5. Check the install:

	```sh
	agw --help
	```

	You see the list of commands.

## Configure your servers and profiles

1. Copy the example configuration:

	```sh
	cp gateway.example.json gateway.json
	```

2. Edit `gateway.json`. Add each MCP server under `servers`. Use the same `command`, `args`, and `env` that you would put in a client's `.mcp.json`. For a remote server, use `url` and `headers` instead.

3. Group the servers under `profiles`. A profile can extend other profiles and inherits their servers, skill sets, and hidden tools. A common layout has one `global` profile with the servers you use everywhere and one profile per company that extends it:

	```json
	"profiles": {
		"global": { "servers": ["context7"], "skills": ["global"] },
		"acme": { "extends": ["global"], "servers": ["acme-ado"], "skills": ["acme"] }
	}
	```

4. Do not write tokens in `gateway.json`. Write `${NAME}` instead, and put the value in `secrets/<profile>.env`:

	```sh
	mkdir -p secrets
	echo 'ADO_TOKEN=paste-the-token-here' > secrets/acme.env
	chmod 600 secrets/acme.env
	```

	A profile reads the secrets files of every profile in its chain. The last one wins.

5. Test the profile. `agw status` starts every server of the profile and reports what happened:

	```sh
	agw status acme
	```

	Each server shows `ready` with its tool count, or `failed` with the error. Fix failures before you continue.

## Connect a repository

1. Run `agw install` with the profile and the repository path:

	```sh
	agw install acme ~/work/acme/api
	```

	`agw` registers the `gw` server in Claude Code, Codex, and Grok for that repository. It also links the profile's skills. Each client gets one line of output, and the command exits with status 1 if any client failed.

2. Open the repository in any client. The `gw` server lists tools named `<server>__<tool>`, such as `acme-ado__wit_get_work_item`.

3. Repeat for each repository. `agw list` shows every installed repository and its profile.

`agw install` does not change any file that Git tracks. It writes the Claude Code entry to `~/.claude.json`, and it adds the files it creates to `.git/info/exclude`, so `git status` stays clean. If the repository tracks `.codex/config.toml` or `.grok/config.toml`, `agw` skips that client and says so.

Codex reads `.codex/config.toml` only in projects you marked as trusted. Open Codex in the repository once and accept the prompt.

To remove `agw` from a repository, run `agw uninstall <path>`.

## Use the gateway outside company repositories

To get the `global` profile and the global skills in every directory, run:

```sh
agw global
```

A repository's own `gw` entry overrides the global one, because every client gives the project scope priority over the user scope.

## Manage skills

A skill is a folder with a `SKILL.md` file. `agw` keeps your own skills in sets under `skills/<set>/<skill>/`. The `global` set goes to every directory. Every other set goes only to the repositories whose profile lists it.

1. Move a skill you wrote into a set:

	```sh
	agw skills import ~/.claude/skills/my-skill global
	```

	`agw` moves the folder into the hub and links it back, so nothing changes for the clients. Skills installed by the [`skills` CLI](https://github.com/vercel-labs/skills) stay where they are. That CLI updates them in place, so `agw` only makes them visible to every client.

2. Link everything:

	```sh
	agw sync
	```

	`agw sync` re-links the skills of every installed repository and makes every user-level skill visible to all three clients.

3. Check what each client really sees:

	```sh
	agw skills doctor
	agw skills doctor ~/work/acme/api
	```

	The doctor asks Claude Code, Codex, and Grok which skills they discovered. It prints one row per skill with a ✓ or ✗ per client, frontmatter problems, and broken links. It exits with status 1 if any skill is missing from any client.

## Open the web UI

1. Start the HTTP server:

	```sh
	agw serve
	```

2. In another terminal, open the UI:

	```sh
	agw ui
	```

	Your browser opens `http://127.0.0.1:7820/ui/` with an access token in the URL fragment. The UI has five screens: **Status**, **Servers**, **Profiles**, **Skills**, and **Projects**. Every change you save there is written to `gateway.json`, `secrets/`, or `skills/`. Running sessions reload on their own.

## Keep the server running on macOS

1. Install the launchd agent from a shell where `node`, `npx`, and your other MCP commands are on the `PATH`:

	```sh
	agw service install
	```

	The agent starts `agw serve` at login and restarts it if it stops. It keeps the `PATH` of the shell that installed it. Logs go to `state/serve.log`.

2. To restart it, run `agw service start`. To remove it, run `agw service uninstall`.

## Add the menu bar icon on macOS

1. Install [SwiftBar](https://github.com/swiftbar/SwiftBar):

	```sh
	brew install --cask swiftbar
	```

2. Point SwiftBar at the plugin folder and start it:

	```sh
	defaults write com.ameba.SwiftBar PluginDirectory "$HOME/.agw/swiftbar"
	open -a SwiftBar
	```

	If SwiftBar asks for a plugin folder on first launch, choose `~/.agw/swiftbar`.

The icon is green when every running profile is healthy, orange when a server failed or a secret is missing, gray when no profile runs in the service, and red when `agw serve` is down. The menu lists each profile and its servers, and it can start a profile, reconnect a server, or open the UI.

## Update agent-gateway

```sh
cd ~/.agw
git pull
pnpm install
pnpm --dir ui install
pnpm --dir ui build
agw service start
```

## Troubleshooting

- **`spawn npx ENOENT` in the service.** launchd started `agw serve` without your `PATH`. Run `agw service install` again from a shell where `which npx` works.
- **A tool is missing from `gw`.** Run `agw status <profile>`, or call the `gateway__status` tool from the client. A failed server shows its error and retries with a growing delay, up to one minute.
- **`Missing secret ${NAME}`.** Add `NAME` to `secrets/<profile>.env`, or set it on the **Profiles** › **Secrets** tab. The server reconnects by itself.
- **A skill does not show up in one client.** Run `agw skills doctor` in the same directory, then `agw sync`.
- **Codex does not list `gw`.** Mark the repository as trusted in Codex.

## Limitations

- `agw` cannot proxy a remote MCP server that requires OAuth, such as the connectors you add in claude.ai. Keep those configured in the client directly.
- The service and the menu bar icon need macOS.
- The doctor starts a short Claude Code session for each run, so it shows up in your Claude Code history.

## Development

```sh
pnpm exec tsc -p .
pnpm test
pnpm --dir ui exec tsc -b
pnpm --dir ui build
```

The backend runs from source on Node 24 with type stripping, so it has no build step. Tests use temporary homes and fake clients. They never touch your real `~/.claude`, `~/.codex`, `~/.grok`, or `~/.agents`.
