# 0008. Board MCP (`board_list` / `board_move_card`)

- Status: Accepted
- Date: 2026-10-11

## Context

Agents must be able to read and drive the board. Agor's model: agents move
branches to zones over MCP, and action-triggering is implicit in the move — not
a `run_action` call. A zone with no prompt is a state flag, so "move to Human
review" is a signal, not a trigger.

## Decision

- Expose exactly two MCP tools: `board_list` and `board_move_card`.
- `board_move_card(workspaceId, zoneId)` moves the card and fires the zone's
  trigger if one is configured. There is no `run_action` tool.
- Implement a minimal JSON-RPC-over-HTTP MCP server by hand (no SDK, per 0007),
  listening on `127.0.0.1:0`.
- Inject it into every agent with
  `server.before("agent.create", ...)` setting
  `config.mcpServers.ace = { type: "http", url, alwaysLoad: true }`.
  (`agent.session_open` cannot edit `mcpServers`, only `env`, so injection is
  create-only; the config is persisted with the agent.)

## Consequences

- This is the foundation for a board-resident agent (the deferred "board agent").
- The hand-rolled server may need protocol tuning once exercised by a real agent
  (Claude Code / Codex / OpenCode clients).
