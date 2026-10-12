# ACE — Agentic Coding Enabler

ACE is a [Paseo](https://paseo.sh) plugin that brings Agor-style, board-based
orchestration to Paseo: a board of **zones** where each **workspace** is a card
showing its branch, pull request, and active agent sessions. Move a workspace
into a zone to run that zone's prompt, or use zones as status flags.

It builds on Paseo's native facilities (multi-agent harness, multi-provider,
worktrees, schedules, and orchestration MCP tools) rather than reimplementing
them: there is no separate "pipeline" or "action" engine here — a zone's prompt
is the workflow step, and multi-step work is the agent's to orchestrate.

## Plugin

| Plugin | ID | What it does | Status |
| --- | --- | --- | --- |
| Board | `ace` | Zones + workspace cards (branch/PR/sessions) + move-to-zone triggers | beta |
| Teammates | `ace-teammates` | Persistent identity + file memory, bench UI, memory MCP | beta |

## Roadmap

- **Shipped**: board (zones + workspace cards + move-to-zone triggers), multiple
  boards + card defaults (create/find card), and the board MCP
  (`board_list` / `board_move_card`).
- **Next**: board-resident agent, discussion plane, teammates.

See `docs/roadmap.md` for the full done/next/backlog picture.

## Install

From this monorepo:

```
paseo plugin install github:mogul/ace-plugins:plugins/ace
```

Or from a local checkout:

```
paseo plugin install /absolute/path/to/ace-plugins/plugins/ace
```

## Development

Each plugin is a standalone `paseo plugin init` project. To typecheck all plugins:

```
npm install
npm run typecheck
```

See `docs/architecture.md` for the design, and the plugin's `OVERVIEW.md` /
`README.md` for details.

## State (version control)

Both plugins store their runtime state in one shared, git-versioned directory
under the daemon's Paseo home (`$PASEO_HOME`, defaulting to `~/.paseo`):

```
~/.paseo/ace/
  boards.json                # ace: board layout, placement, card defaults
  teammates.json             # ace-teammates: teammate index
  teammates/<slug>/          # ace-teammates: SOUL.md, USER.md, memory/, …
  active.json                # ace-teammates: ephemeral "running now" set (gitignored)
```

`active.json` records which teammates currently have a running session so the
board can light them up; it is transient and excluded from version control
(the setup script writes a `.gitignore` entry for it).

On first load each plugin migrates any state found under the legacy
`~/.paseo/plugins/ace` / `~/.paseo/plugins/ace-teammates` locations into
`~/.paseo/ace` (copy only; legacy files are left in place).

To version-control this directory, run the one-shot setup script with your
remote as the argument:

```
.\scripts\ace-state-init.ps1 https://github.com/user/paseo-ace-state.git
```

After that, from inside `~/.paseo/ace`:

```
git add -A; git commit -m "ace state snapshot"   # commit current state
git push                                         # push to origin
git pull --rebase                                # pull remote changes
git log --oneline                                # inspect history
git checkout <sha> -- .                          # restore files to a snapshot
```

## License

MIT. See [LICENSE](LICENSE).
