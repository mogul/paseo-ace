# 0013. Supervisor (board-resident agent via heartbeat)

- Status: Accepted
- Date: 2026-10-12

## Context

The roadmap's "board-resident agent" is Agor's supervisor: a teammate that lives
on a board, is woken periodically, and drives the board via MCP + memory. Most of
the pieces now exist (teammates with `boardId`, `BOARD.md`/`HEARTBEAT.md`, board
MCP from `ace`, memory MCP from `ace-teammates`). The missing piece is the
periodic wake.

## Decision

- The supervisor is **not a new entity** — it is a teammate with a `boardId`
  (resident board) **and** a `heartbeatCron` (tick cadence).
- `ace-teammates` runs a scheduler; when a teammate's cron is due it spawns that
  teammate's agent **in its home dir** (manager-style, no workspace) with:
  - its assembled system prompt (identity + recent memory), and
  - a heartbeat prompt pointing at `HEARTBEAT.md`/`BOARD.md` and its `boardId`.
- The spawned agent uses the board MCP (`ace`) and memory MCP (`ace-teammates`)
  already injected via `before("agent.create")`.
- Guards: one live heartbeat agent per teammate; cron deduped per minute.

## Consequences

- The supervisor is a configuration of a teammate (resident board + heartbeat),
  not a hardcoded role. Many teammates may share a board (soft, per 0012); a
  heartbeat simply makes one proactive.
- Heartbeat frequency is a per-teammate cron string, editable in the bench UI.
