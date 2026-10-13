# 0018. Teammate files (AGENTS/BOOT/ONBOARDING), boot injection, home-only start

- Status: Accepted
- Date: 2026-10-13

## Context

Teammates seeded only SOUL/USER/IDENTITY/BOARD/HEARTBEAT plus `memory/`, and
`buildSystemPrompt` injected only identity + memory. Catching the teammate
framework up to Agor's model (`preset-io/agor-teammate`) means adding an
operating manual (AGENTS.md), a startup checklist (BOOT.md), and a first-run
guide (ONBOARDING.md) — and starting a teammate from its home every time.

## Decision

- Teammates seed three new files: **AGENTS.md** (operating manual: priorities,
  working model, reference table), **BOOT.md** (startup checklist), and
  **ONBOARDING.md** (first-run guide + live progress record). AGENTS.md and
  BOOT.md are FRAMEWORK files (safe to overwrite on version bumps); ONBOARDING.md
  is learned — seeded once, never re-seeded.
- **Boot injection**: every session's system prompt is assembled as
  `You are the teammate named <name>.` → AGENTS.md → identity/soul/user →
  BOOT.md → ONBOARDING.md (only when present) → recent memory → the
  `teammate_memory_append` instruction. The boot checklist arrives each session
  without narrating the rebuild.
- **FRAMEWORK_VERSION** bumps from `1` to `2`. `migrateFramework()` overwrites
  the FRAMEWORK files for outdated teammates and seeds ONBOARDING.md once when it
  does not already exist (pre-existing teammates get it exactly once; existing
  onboarding progress is never overwritten).
- **Home-only start**: the "choose where to start" workspace picker is removed
  from the Teammates screen. `start` always spawns a new session in the
  teammate's home. Spawning work into workspaces is deferred to a future MCP
  capability; `teammateStartRpc`'s optional `workspaceId` handling stays as-is.

## Consequences

- A fresh teammate immediately has an operating manual, a boot checklist, and a
  first-run guide, so it can orient itself and track progress toward real work.
- Existing teammates at framework v1 are brought up to v2 automatically on the
  next plugin load, gaining AGENTS/BOOT/ONBOARDING without losing identity,
  user context, or memory.
- Start is now a single obvious action with no picker; work-in-workspaces is a
  deferred, separate capability.