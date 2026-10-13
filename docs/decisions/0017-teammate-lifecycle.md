# 0017. Teammate lifecycle: create home + board + first session

- Status: Accepted
- Date: 2026-10-13

## Context

Clicking a teammate's emoji on a board did nothing for a freshly-created
teammate: the emoji opens the teammate's latest session, but a new teammate had
no session yet, and its heartbeat had never fired. Digging into Agor's lifecycle
(`preset-io/agor`) answered the open questions.

## Agor's lifecycle (reference)

When Agor creates a teammate it: (1) creates a home branch from a persona
template, (2) tags the branch with teammate metadata, (3) **creates a dedicated
board**, and (4) **launches the first session** (the `ONBOARDING.md` guided
experience) — deferred only when no AI model is connected.

A teammate is a *who* (one persistent home) that has **many sessions** over
time. "Start my teammate" opens a *new* session on the home; heartbeats and forks
spawn more. So there is no single "the session" — only the *latest* of many.

## Decision

- `lastAgentId` (latest session) is teammate-owned state in `teammates.json`; the
  board reads it and never writes teammate state.
- **Board at creation**: `teammate.create` auto-creates a dedicated board (named
  after the teammate) when no `boardId` is supplied, and attaches to an existing
  board when one is picked. This adds a *write* coupling from `aces-teammates`
  into `~/.paseo/aces/boards.json` (atomic tmp+rename, matching the board shape).
  The picker remains as the override so users who used boards first can attach a
  teammate to a pre-existing board.
- **Fire-on-create**: `teammate.create` also launches the first session in the
  teammate's home (heartbeat prompt for heartbeat teammates, else a brief
  orientation), sets `lastAgentId`, and returns the `agentId` so the client opens
  it. This also captures `paseo`, arming the heartbeat scheduler.
- **Paseo capture**: every teammates RPC handler captures `paseo` (previously
  only `start` did), so the heartbeat scheduler is armed by any teammates-UI
  interaction, not just an explicit start. This fixes the "heartbeat never fires
  for a heartbeat-only teammate" bug.
- The board emoji opens the latest session; when there is none (a teammate
  created before this change), it shows a toast pointing at the Teammates screen.

## Consequences

- A newly-created teammate immediately has a board and a session, matching Agor.
- `aces-teammates` now writes board state (one narrow function); the read side of
  the board contract is unchanged. Writes are atomic and infrequent, so the two
  plugins' last-writer-wins overlap is acceptable.
- `ONBOARDING.md` parity is deferred; the first session uses a short orientation
  prompt for now.
