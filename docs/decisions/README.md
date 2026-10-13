# Architecture Decision Records

Key decisions for the `ace` plugin, newest last. Each record is immutable once accepted; supersede rather than edit.

| # | Title | Status |
|---|-------|--------|
| [0001](0001-board-zones-not-workflows.md) | The board is zones, not a workflow engine | Accepted |
| [0002](0002-single-plugin-ace.md) | One plugin, id `ace` | Accepted |
| [0003](0003-native-rn-board-not-web-app.md) | Native RN board, no served web app | Accepted |
| [0004](0004-terminology.md) | Card == workspace == branch | Accepted |
| [0005](0005-board-data-model.md) | Board data model and workspace metadata | Accepted |
| [0006](0006-zone-trigger-semantics.md) | Zone trigger semantics | Accepted |
| [0007](0007-no-runtime-deps.md) | No external runtime deps; inlined assets | Accepted |
| [0008](0008-board-mcp.md) | Board MCP (`board_list` / `board_move_card`) | Accepted |
| [0009](0009-multiple-boards.md) | Multiple boards and card defaults | Accepted |
| [0010](0010-card-creation-and-provider-selection.md) | Card creation and provider-selection refinements | Accepted |
| [0011](0011-teammates.md) | Teammates (persistent identity + file memory, separate plugin) | Accepted |
| [0012](0012-teammate-board-relationship.md) | Teammate ↔ board relationship (soft 1:1 resident board) | Accepted |
| [0013](0013-supervisor-heartbeat.md) | Supervisor (board-resident agent via heartbeat) | Accepted |
| [0014](0014-rename-boards-plugin.md) | Rename boards plugin to `ace-boards` | Accepted |
| [0015](0015-column-zone-layout-drag.md) | Column/zone layout: stacked zones, nameless columns, grip drag | Accepted |
| [0016](0016-group-terminology.md) | Rename column to group | Accepted |

See `../architecture.md` for the current shape of the system.
