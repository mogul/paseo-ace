# Roadmap

## Shipped

- **Board** — zones (columns) holding Paseo workspaces as cards; each card shows
  branch, PR pill, issue pills, and a session tree (with sub-agents). Drop a card
  into a zone to run that zone's prompt (or use a zone as a status flag).
- **Multiple boards + card defaults** — board selector, per-board card defaults,
  Create card (worktree/directory, slugified branch, optional initial agent) and
  Find card (adopt unassigned workspaces).
- **Board MCP** — `board_list` / `board_move_card` injected into agents, so
  agents can read and drive the board (action-firing is implicit in the move).
- **Teammates (v1)** — `ace-teammates` plugin: persistent identity + file memory
  (`SOUL.md`/`USER.md`/`IDENTITY.md` + daily journal) in a stable home dir,
  a bench UI, and a memory MCP (`teammate_list`/`teammate_memory_append`/`read`).
  "Start" runs in a chosen workspace or the teammate's home.
- **Supervisor (board-resident agent)** — a teammate with a `boardId` +
  `heartbeatCron`; `ace-teammates` wakes it on cron, in its home dir, with its
  identity + `HEARTBEAT.md`/`BOARD.md` + board MCP + memory MCP.
- **Persona gallery + emoji** — 9 personas seed identity files; emoji picker.
- **Template versioning** — `frameworkVersion` per teammate; migration updates
  framework files (`BOARD.md`/`HEARTBEAT.md`) and preserves learned files.
- **Presence** — the board banner shows associated teammates (emoji row),
  lit when actively running.
- **State-as-git** — state consolidated to `~/.paseo/ace/`; `scripts/ace-state-init.ps1`
  sets up git for backup/rollback/sharing.

## Next

1. **Discussion plane** — a human discussion/decision layer above sessions, with
   the ability to drop into any session to review or steer. Doubles as the
   human↔agent↔agent message surface.

## Backlog / deferred

- **Multiplayer presence** — live cursors/avatars; needs a relay/backend.
- **Card action icons** (terminal / files / diff) — blocked: the plugin
  navigation surface only exposes `openAgent`/`openWorkspace`/`openBrowser`.
- **Provider logos** in the session tree — only generic Lucide glyphs are
  reachable (real brand icons are SVG, not exposed to plugins).
- **Note/artifact slots** on cards (markdown notes maintained by agents).
- **Scheduled / lifecycle-triggered prompts** — covered by Paseo's own
  `schedules`; a future `ace-boards` feature if needed.
- **Agent "fork"** in zone triggers — not exposed by the plugin SDK.

## Verify-before-more

- **Create card → worktree**: confirm the initial agent runs in the new worktree
  (not the project root) — a known deviation worth an in-app check.
