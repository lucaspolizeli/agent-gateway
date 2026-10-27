# How agent-gateway works

This page explains why `agw` is built the way it is. To install it, follow the [README](../README.md). For exact commands and fields, see the [reference](reference.md).

## The problem it solves

If you work for several companies, every coding agent session tends to see either too much or too little. Configure every MCP server at user level, and a session in company A's repository loads company B's issue tracker, with B's credentials and dozens of extra tools in the context window. Configure them per repository, and the same server definition and token get copied into many `.mcp.json` files, for three different clients with three different config formats.

Skills have the same problem. Claude Code, Codex, and Grok each read skills from different folders. A skill that lives only in `~/.claude/skills` does not exist for Codex.

`agw` keeps one definition of everything and decides, per repository, what each client sees.

## Profiles decide what a session sees

A profile is a named list of servers, skill sets, and hidden tools. Profiles can extend other profiles. `agw` resolves a profile by walking its `extends` chain, ancestors first, and merging what each one adds. A tool that an ancestor hides stays hidden in every descendant.

A typical layout has three levels:

- `global` holds what you use everywhere, such as a documentation server.
- One profile per company extends `global` and adds that company's tracker and repositories.
- A project profile extends its company's profile and adds a server that only makes sense in one repository, such as a database tool that runs in that repository's directory.

Every repository is bound to exactly one profile. The binding is stored in `state/projects.json`, and you change it with `agw install`.

## One MCP server per session

Each client sees one MCP server, `gw`. Behind it, `agw` starts the profile's real servers and merges their tools, prompts, and resources:

```
Claude Code ─┐
Codex ───────┼─▶ gw (agw, profile "acme") ─┬─▶ acme-ado    (npx @azure-devops/mcp)
Grok ────────┘                              ├─▶ context7    (npx @upstash/context7-mcp)
                                            └─▶ ...
```

Tool names get the server name as a prefix, `<server>__<tool>`. Two servers can then both offer a `search` tool without a collision. The double underscore is safe as a separator because server names allow only lowercase letters, digits, and single hyphens. Resources keep their URIs, because clients use them as identifiers. A read goes to the server that listed the URI.

`gw` also offers its own tool, `gateway__status`. It reports the state of every upstream server, so an agent can tell you why a tool is missing.

A server that fails does not take the others down. It shows `failed` with its error, and its tools disappear until it recovers. After a failed connect or a lost connection, `agw` tries again after 1 second, then 2, 4, and so on, up to once a minute. A missing secret is the one failure it does not retry, because only a config change can fix it.

## Two ways to run the gateway

**stdio, the default.** Each client session starts its own `agw stdio <profile>` process and talks to it over stdin and stdout. The process starts the profile's servers and exits with the session. Nothing has to run in the background, and two sessions never share a process. This is what `agw install` registers.

**HTTP.** `agw serve` runs one long-lived process on `127.0.0.1:7820`. It serves every profile at `/mcp/<profile>`, plus the admin API and the web UI. Install a repository with `--http` to have its clients connect to it instead of starting their own process. One running copy of each server is then shared by all sessions. The trade-off is that the service must be running, which is why `agw service install` exists.

The web UI and the menu bar always need `agw serve`. Its **Status** screen shows only the profiles that run inside that process. A stdio session in your editor is a separate process, so the screen can show a profile as stopped while a client is using it. **Start** on that screen launches a copy inside the service, which is a quick way to test connections.

## Changes apply without a restart

Every gateway process watches `gateway.json` and the `secrets/` folder. When either changes, the process reloads the configuration and compares each server's resolved spec, with secrets filled in, against what it runs. It restarts only the servers whose spec changed, stops the removed ones, starts the new ones, and then tells connected clients that the tool list changed. Changing one token restarts one server.

An invalid edit never takes a gateway down. The process logs the error and keeps running on the last valid configuration.

## Secrets stay out of the configuration

`gateway.json` holds `${NAME}` references, never values. The values live in `secrets/<profile>.env`, written with mode 0600. A profile reads the secrets files of its whole chain, so a company token can live next to the company profile and still reach a project profile that extends it. The process environment is the fallback.

The admin API never returns a secret value. It lists key names only, and it masks secret values in error messages.

## What `agw install` changes, and what it never touches

`agw install <profile> <repo>` registers `gw` in each client the way that client expects:

| Client | Where the entry goes |
|---|---|
| Claude Code | `~/.claude.json`, local scope for that directory, through `claude mcp add-json` |
| Codex | `<repo>/.codex/config.toml`, only the `[mcp_servers.gw]` table |
| Grok | `<repo>/.grok/config.toml`, through `grok mcp add --scope project` |

It also links the profile's skill sets into `<repo>/.claude/skills`, which Claude Code and Grok read, and `<repo>/.agents/skills`, which Codex reads.

Your company repositories are not your personal tooling, so `agw` follows three rules there:

- It never edits a file that Git tracks. A tracked `.codex/config.toml` belongs to the team, so `agw` skips Codex in that repository and reports why.
- It hides every file it creates through `.git/info/exclude`. That file is local to your clone and is never committed. Each checkout, including each worktree, gets its own marked block.
- It refuses your home folder as a repository, because the project skill folders there are your user-level skill folders.

`agw uninstall` reverses each step. It removes only the entries, links, and empty folders that `agw` created.

## Who owns a skill

A skill can come from three places, and `agw` treats each one differently:

- **Hub skills** live in `skills/<set>/`. You edit them in the UI, and `agw` links them where your profiles say. Commit them to version them.
- **Managed skills** were installed by the [`skills` CLI](https://github.com/vercel-labs/skills) into `~/.agents/skills` and are listed in `~/.agents/.skill-lock.json`. That CLI updates them in place, so `agw` never moves them. If it did, the next `skills update` would break the link.
- **Unmanaged skills** are real folders in a user skill folder that nothing manages. `agw skills import` moves them into a hub set.

At user level, Claude Code reads `~/.claude/skills`, Codex reads `~/.agents/skills`, and Grok reads `~/.grok/skills` and `~/.claude/skills`. `agw sync` makes sure every user-level skill exists in both `~/.claude/skills` and `~/.agents/skills`, by adding symlinks where a name is missing. It never replaces an entry that it did not create.

## Proving skills work in every client

Linking a folder is not proof that a client loads it. A client can skip a skill with an invalid name, or ignore a folder it does not scan. `agw skills doctor` asks each client directly, without sending a prompt:

- **Claude Code.** It starts a session in stream-json mode and reads the `skills` list from the `init` event, then stops the session.
- **Codex.** It runs `codex debug prompt-input` and reads the skills block of the prompt that Codex would send.
- **Grok.** It runs `grok inspect` and reads the `Skills` section.

The doctor compares what each client reports with what should be visible in that directory. It also checks each `SKILL.md` against the rules the clients enforce: the name must match the folder and use lowercase letters, digits, and hyphens, up to 64 characters, and the description is required, up to 1024 characters. If a client cannot be asked, its column counts as failed, never as passed.

## The admin UI is local and guarded

`agw serve` listens on `127.0.0.1` only. Even so, a web page you visit could try to reach it, so the server applies three guards:

- Every `/api` request must carry the token from `state/admin-token` in the `x-agw-token` header. Browsers cannot send that header across origins without a preflight, and the server does not answer preflights.
- The server rejects any `Host` header other than `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS rebinding.
- The UI page never contains the token. `agw ui` opens the page with the token in the URL fragment. Browsers do not send the fragment to the server. The UI moves the token to session storage and removes it from the address bar.

The UI is built with [shadcn/ui](https://ui.shadcn.com) on Radix and Tailwind CSS. `ui/scripts/check-ui-kit.mjs` runs before every build. It fails on raw HTML controls outside the kit, extra stylesheets, hard-coded colors, and ternary operators, so every screen keeps using the same components.
