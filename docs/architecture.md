# Architecture

`ace-boards` is the boards plugin in the ACE suite — an Agor-style, multi-board
workspace board. Its sibling, `ace-teammates`, handles persistent teammates and
memory. This is the canonical, current-state summary; decisions are recorded in
`docs/decisions/`.

## Principles

1. **Build on Paseo, don't reimplement it.** Paseo provides the multi-agent
   harness, multi-provider, worktrees, schedules, and orchestration MCP tools.
   `ace-boards` adds a board surface and a small MCP bridge; there is no
   workflow/DAG engine.
2. **Zones are the whole feature.** A zone has an optional prompt; dropping a
   workspace card into it runs that prompt. A zone with no prompt is a status
   flag.
3. **In-app RN surface.** The board is a native React Native screen (Paseo's
   platform requirement), rendering consistently on desktop/web/mobile.
4. **No external runtime deps.** Only Node builtins + Paseo's host modules
   (`@getpaseo/*`, `zod`, React, React Native). Templating, cron-free scheduling
   (none used), and the MCP JSON-RPC server are hand-rolled.

## Terminology

Card on the board == Paseo **workspace** == Agor "branch". "Zones" are the
droppable regions (arranged in columns). Agor's "Cards (beta)" is unrelated.

## Data model

`~/.paseo/ace/boards.json`:

```json
{
  "boards": [ { "id", "name", "columns": [...], "placement": {...}, "cardDefaults": CardDefaults } ],
  "lastVisitedBoardId": "..."
}
```

- `columns`: `[{ id, title, width?, zones: [{ id, title, trigger? }] }]`.
- `placement`: `{ workspaceId: zoneId }`. **This is membership** — a workspace
  is on a board iff its id is in that board's `placement`; unassigned workspaces
  appear only in the "Find card" picker. Workspaces never leak across boards.
- `cardDefaults`: `{ isolation: "worktree"|"directory", projectCwd?, baseBranch?,
  provider?, modeId?, thinkingOptionId?, prompt? }`.

Workspace cards are derived live from Paseo each poll:
- branch: `workspace.gitRuntime.currentBranch`
- PR pill: `workspace.githubRuntime.pullRequest`
- issue pills: `workspace.labels` with an `issue:` prefix
- session tree: agents in the workspace, parented via `labels["paseo.parent-agent-id"]`
- archived entities filtered (`workspace.archivingAt`, `agent.archivedAt`)
- a synthetic "No workspace" card (`UNASSIGNED_CARD_ID`) collects workspace-less agents

## RPCs (`shared/contracts.ts`)

`board.state` (get current/`boardId` board + workspaces + board list + lastVisited),
`board.create`, `board.rename`, `board.delete`, `board.set-last-visited`,
`board.set-defaults`, `board.projects` (projects + `isGit`), `board.workspaces`
(all workspaces, for Find card), `board.add-zone`, `board.update-zone`,
`board.delete-zone`, `board.move` (drop-to-zone, fires trigger), `board.new-session`,
`board.adopt-card`, `board.create-card` (slugify name → worktree branch / directory;
optional initial agent).

## Board MCP (for agents)

Hand-rolled JSON-RPC-over-HTTP server on `127.0.0.1:0`, injected via
`before("agent.create")` as `mcpServers["ace-boards"]`. Tools: `board_list` (current board +
workspaces + board summaries) and `board_move_card(workspaceId, zoneId, boardId?)`.
Action-firing is implicit in the move — there is no `run_action`.

## Card creation

Zone ⋯ menu → "Add card" → tabs "Create card" / "Find card".

- **Create card**: name (slugified for branch), project picker (from
  `board.projects`, defaults to `cardDefaults.projectCwd`), isolation
  (Worktree/Directory; Worktree + base branch disabled for non-git projects),
  dependent provider→model→mode→thinking dropdowns, and an optional prompt
  template (shared `PromptEditor` with template pills). Server calls
  `paseo.workspaces.create(...)` and places the new workspace in the zone.
- **Find card**: unassigned workspaces first, then other boards (non-selectable
  separators) with their cards; adopting an unassigned workspace places it in
  the zone.

## UI

- Sidebar item **"Boards"** → opens last-visited board.
- Top banner: board-selector dropdown (current checked, + "New board…"), a
  search field (client-side filter), and a settings ⋯ (rename/delete board,
  edit card defaults).
- Zone ⋯ menu: Settings / Add card / Delete.
- Host components from `@getpaseo/plugin/client/react-native` are used where
  available (`Modal`, `TextInput`, `ScrollView`, `useToast`, `Icon`).
- Mobile (`layout.compact`) renders zones vertically stacked.

## Correctness invariants

- Spawning always via `paseo.workspaces.ref(workspaceId).agents.create(...)` —
  never `agents.create({ cwd })`, which auto-creates a new workspace.
- `deleteZone` clears `placement` entries for the removed zone.
- `move` fires the trigger before committing placement.
- All mutation handlers surface errors via `useToast`.
- `structuredClone` for the default board; no shared-reference mutation.

## Deferred / out of scope

Scheduled/lifecycle prompts (Paseo `schedules`), canned prompts (Paseo skills),
agent "fork" (not in the plugin SDK), card action icons for terminal/files/diff
(not exposed by plugin navigation), and multiplayer presence (needs a relay).
