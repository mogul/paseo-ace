# 0012. Teammate ↔ board relationship

- Status: Accepted
- Date: 2026-10-12

## Context

We modeled teammates as board-independent (0011). Digging into Agor's source
showed the opposite: a teammate is associated with a board.

## Decision (what Agor actually does)

- A teammate is **not a separate entity** — it is a branch flagged with
  `custom_context.teammate` (no `teammates` table). `TeammateConfig` carries
  `displayName`, `emoji`, `frameworkRepo`, `frameworkVersion`, `kb`.
- Its board relationship is two pointers: `branch.board_id` (its **resident
  board**, one board at a time) and `boards.primary_teammate_id` (FK back to the
  branch). Creation auto-creates a **dedicated board** and wires it as primary.
  The source calls this a **"soft 1:1 teammate↔board coupling … deliberately not
  hard-enforced."**
- `BOARD.md` (resident-board zone semantics) is a git file in the branch; board
  IDs live in `IDENTITY.md`.
- Memory is split: identity/instruction files (`SOUL.md`, `IDENTITY.md`,
  `USER.md`, `BOARD.md`, `HEARTBEAT.md`, `ONBOARDING.md`) are local git files
  read at boot via `BOOT.md`; **daily memory** lives in a searchable store
  (Knowledge) accessed only through MCP (`agor_teammate_memory_append`/`_search`).
- Personas are **template branches** in the framework repo, not config blobs.

## Decision (what we adopt in Paseo)

- `ace-teammates` teammates gain `boardId` + `boardName` (soft 1:1 resident board
  association). The board MCP (injected by `ace`) lets the teammate operate on it.
- Seed `BOARD.md` and `HEARTBEAT.md` as part of the teammate file set.
- Keep identity injected into the system prompt at start (more reliable than
  relying on the agent to follow `BOOT.md`); keep memory via MCP.
- **Board picker via a filesystem contract**: `ace-teammates` reads
  `ace`'s `~/.paseo/plugins/ace/boards.json` to list boards for the picker. The
  two plugins are coupled only through that file's `{ boards: [{ id, name }] }`
  shape; treat `ace`'s boards schema as the shared contract.

## Home vs work repos

A teammate's **home** (identity + memory) is distinct from the **repos/workspaces
it works on**. In Agor the home is a branch of the framework repo; in Paseo it is
`~/.paseo/plugins/ace-teammates/teammates/<slug>/`. Work happens in whatever
workspace the teammate is "Started" in; one teammate spans many work repos while
its home (memory) persists. A `TOOLS.md`-style repo roster in the home is an
optional fast-follow.

## Consequences

- The supervisor becomes: a teammate with `boardId` set + `BOARD.md`/`HEARTBEAT.md`
  + a heartbeat, using the board MCP and memory MCP. No new engine.
- A persona gallery (template branches/dirs) is a fast-follow, not core.
