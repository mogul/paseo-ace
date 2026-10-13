# 0016. Rename "column" to "group"

- Status: Accepted
- Date: 2026-10-12

## Context

The board's outermost layout unit was called a "column", a name carried over from
the desktop-first mental model where zones sit side by side. On mobile (the
`layout.compact` branch) those same containers stack vertically, so "column" reads
as a misnomer. The name was also leaking into user-facing strings ("Column
options", "Top of column", "Column {ci + 1}") and into the data model and RPC
surface, where a rename is cheap only if done early.

## Decision

- The concept is renamed "group": a group is a nameless container of zones. The
  data-model field `columns` becomes `groups` (`BoardSchema` / `Board["groups"]`),
  and the zod type `ColumnSchema` becomes `GroupSchema` (`BoardGroup`).
- The reorder RPC `board.move-column` becomes `board.move-group`, with its input
  field `columnId` renamed to `groupId` (the exported const is now
  `boardMoveGroupRpc`). `board.add-zone` and `board.move-zone` likewise take
  `groupId` instead of `columnId`.
- User-facing strings follow: "Column options" → "Group options", "Top of column"
  → "Top of group", "Column {n}" → "Group {n}". The drag kind literal `"column"`
  becomes `"group"`.
- No migration: nothing reads the persisted `columns` field yet, so on-disk
  `boards.json` still keyed as `columns` simply fails the zod parse and falls back
  to defaults. The `col` abbreviations (`colRefs`, `colFrames`, `styles.col*`,
  group ids seeded as `col-…`) are left as-is.

## Consequences

- Desktop and mobile share one term for the layout container, matching how it is
  actually rendered in each orientation.
- `docs/architecture.md`, `docs/roadmap.md`, and the plugin `OVERVIEW.md` are
  updated to use "group" instead of "column".
- ADR 0015's references to "column" are superseded in terminology only; its
  behavior (stacked zones, nameless containers, grip drag) is unchanged.
