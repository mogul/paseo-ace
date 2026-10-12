# 0009. Multiple boards and card defaults

- Status: Accepted
- Date: 2026-10-11

## Context

Agor supports multiple boards per workspace. We had a single board. We also
needed a way to create new workspace cards from the board (agents can spawn
workspaces via `paseo_create_workspace`; the plugin server has the same SDK:
`context.paseo.workspaces.create(...)`), using Agor's "branch defaults" idea.

## Decision

- Data moves from `board.json` to `boards.json`:
  ```json
  {
    "boards": [ { "id", "name", "columns": [...], "placement": {...}, "cardDefaults": CardDefaults } ],
    "lastVisitedBoardId": "…"
  }
  ```
- Membership stays authoritative in each board's `placement` (a workspace is on
  0..1 board). No workspace-label dependency (labels aren't writable from the
  plugin SDK).
- `CardDefaults` (per board): `{ isolation: "worktree"|"directory",
  projectCwd?, baseBranch?, provider?, modeId?, thinkingOptionId?, prompt? }`.
  `prompt` is an optional initial-prompt template with the same template pills as
  the zone action.

## Create card

From a zone's ⋯ menu → "Create/find card". "Create card" shows a form:
- workspace **name** (required), slugified for the worktree branch name;
- a **project** picker (from `paseo.projects.list()`) defaulting to
  `cardDefaults.projectCwd`;
- the remaining defaults (isolation, base branch, provider, model/mode, prompt)
  pre-filled from `cardDefaults`.

On submit the server calls `workspaces.create({ source: worktree|directory,
title, agent? })` and places the new workspace in that zone. "Find card" lists
unassigned workspaces first, then each board as a non-selectable separator with
its cards; picking an unassigned one adopts it into the zone.

## UI

- Sidebar item becomes **"Boards"** → opens `lastVisitedBoardId`.
- Top banner: centered board-selector dropdown ("Board: `<name>`", current
  checked, + "New board…"), a search field (client-side filter of the board's
  workspaces), and a settings item (rename/delete board, edit card defaults).

## Consequences

- All zone/move RPCs now take a `boardId`; `board.state` returns the current
  board, its workspaces, and the board list.
- The MCP `board_list` returns the current board + workspaces + board list;
  `board_move_card` takes an optional `boardId` (default last-visited).
- The hand-rolled overlay modal is replaced with the host `Modal`/`TextInput`
  from `@getpaseo/plugin/client/react-native` (better keyboard handling).
- Old `board.json` is superseded (test data, not migrated).
