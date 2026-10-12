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

## License

MIT. See [LICENSE](LICENSE).
