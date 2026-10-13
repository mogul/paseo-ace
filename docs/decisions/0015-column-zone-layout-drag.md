# 0015. Column/zone layout: stacked zones, nameless columns, grip drag

- Status: Accepted
- Date: 2026-10-12

## Context

The board initially shipped with one zone per column and tap-to-move only; ADR 0003
had explicitly "given up" on drag. In use, three gaps surfaced: (1) a "new zone"
always opened a whole new column, with no way to stack a second zone under an
existing column; (2) columns and zones could not be reordered at all; (3) the
column header printed a `title` that was always redundant with its single zone's
name (auto-seeded "New zone" or mirroring the zone), and would become stale once a
column held several zones.

## Decision

- A column is a nameless container of zones. The redundant `Column.title` is no
  longer rendered; zone titles are the visible labels. The `title` field stays in
  the schema for backward compatibility but is ignored by the UI.
- `board.add-zone` accepts an optional `columnId`. With it, a zone is appended to
  that column; without it, a new column containing one zone is created (the prior
  behavior). Columns are never left empty: a zone move that empties its source
  column deletes the column (consistent with `deleteZone`).
- New RPCs `board.move-column` (`{ boardId, columnId, index }`) and
  `board.move-zone` (`{ boardId, zoneId, columnId, index }`) reorder layout.
  `placement` is untouched: cards track `zoneId`, so these are pure layout moves.
- Reordering is drag-based on desktop (non-compact) and menu-based everywhere.
  Drag starts only from a dedicated `≡` grip on the column/zone header (the header
  body stays tappable), so it never conflicts with the board's horizontal scroll.
  The drag layer is built on React Native core `PanResponder` + `Animated` (no
  runtime deps, per ADR 0007): the dragged element follows the pointer, sibling
  frames are measured once at drag start via `measureInWindow`, a drop indicator is
  drawn at the computed insertion point, and the move is persisted on release.
- Compact/mobile uses menus instead of drag: the column `⋯` menu offers
  "Move up / Move down" (left/right on desktop), and the zone `⋯` menu offers
  "Move zone…", which opens a picker to choose a target column and position. The
  compact layout renders each column as a nameless group (a slim strip with a `⋯`)
  so column reorder remains reachable there.
- The DnD state is keyed by `{ kind, id }` and shared, so a future `kind: "card"`
  can plug in for dragging cards between zones. Card ordering *within* a zone is
  not represented today (`placement` is an unordered map); enabling card reorder
  will need a small schema addition, deferred to that feature.

## Consequences

- Zones stack vertically within a column; the trailing board button ("+ Add zone")
  still opens a new column, while each column also has its own "+ Add zone".
- Desktop gains pointer-driven reorder of columns and zones; compact and keyboard
  users reorder via menus.
- ADR 0003's "no drag" consequence is superseded in part: drag is supported via
  grip handles, but freeform spatial layout and drag-resize remain out of scope.
