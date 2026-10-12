# ACE Teammates

ACE Teammates adds persistent AI teammates to Paseo. Each teammate has a stable identity (`SOUL.md`, `USER.md`, `IDENTITY.md`) and a daily-journal memory, a persona gallery with an emoji, and a memory MCP so it can recall and record what it learns across sessions. Give a teammate a resident board and a heartbeat and it becomes a supervisor that periodically drives that board.

## How it works

A teammate lives in a stable home directory under `~/.paseo/ace/teammates/<slug>/`, independent of any workspace, so its memory outlives the work it does. Starting a teammate assembles its identity and recent memory into the agent's system prompt and runs it in a chosen workspace or its home directory. Memory is written and read through MCP tools (`teammate_memory_append`, `teammate_memory_read`) rather than injected into every prompt.

## Setup

Requires Paseo 0.11.2 or later. Teammates store state in `~/.paseo/ace/`, shared with the `ace-boards` plugin and git-versionable.

## Personas and memory

When you create a teammate you pick a starting point (a persona, or Blank) and an emoji. The persona seeds the identity files. The teammate fills in `USER.md` as it learns about you and appends a daily journal to `memory/YYYY-MM-DD.md`. Framework files (`BOARD.md`, `HEARTBEAT.md`) update when the plugin bumps its framework version; learned files are preserved.

## Supervisor

A teammate with a resident board and a heartbeat cron becomes a supervisor. It wakes on schedule, reads its `HEARTBEAT.md`, and uses the board MCP to review and drive the board, filing learnings to memory.

## Limits

Single-user, local daemon. Memory is plain markdown files; there is no in-app memory editor, and the path is copied from the bench. Multiplayer presence and a shared knowledge base are future work.
