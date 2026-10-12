# 0011. Teammates

- Status: Accepted
- Date: 2026-10-11

## Context

Agor's "teammate" is a persistent *who* (identity + memory + orchestration), not
a *where* (branch). It uses an agent (Claude Code/Codex/…) to do work. Memory is
file-based and outlives any single working branch. We need the same primitive in
Paseo, where workspaces/worktrees are ephemeral.

## Decision

- **Separate plugin `ace-teammates`** (board-independent). The supervisor is a
  later composition of `ace` (board MCP) + `ace-teammates` (memory MCP) + a
  heartbeat.
- A **teammate** lives in a stable home directory that outlives workspaces:
  `~/.paseo/plugins/ace-teammates/teammates/<slug>/`, containing:
  - `SOUL.md` (personality/style/principles)
  - `USER.md` (knowledge about the user/preferences)
  - `IDENTITY.md` (name/purpose)
  - `memory/YYYY-MM-DD.md` (daily journal, appended)
  An index `teammates.json` holds `{ id (slug), name, description?, provider? }`.
- **Start** assembles `SOUL.md` + `USER.md` + `IDENTITY.md` + recent memory into
  the agent's system prompt, and runs the agent either in a **chosen workspace**
  (worker teammates) or the teammate's **home dir** (manager/orchestrator style).
- **Memory MCP**: injected into agents via `before("agent.create")`. Tools are
  argument-scoped by teammate slug (the agent learns its slug from its system
  prompt): `teammate_list`, `teammate_memory_append(teammate, text)`,
  `teammate_memory_read(teammate, days?)`.
- **Bench UI**: a "Teammates" screen (create/list/rename/delete/start), with a
  "copy memory path" shortcut (files on disk only; no in-app editor for v1).
- `BOARD.md` and `HEARTBEAT.md` are deferred to the supervisor.

## Consequences

- A teammate's learnings persist across the workspaces it works in.
- Two MCP servers coexist on agents (`ace` board + `ace-teammates` memory);
  the supervisor later uses both.
- Shared "Knowledge" (searchable markdown store) remains a separate future feature.
