# 0004. Card == workspace == branch

- Status: Accepted
- Date: 2026-10-11

## Context

Agor calls the thing on a board a "branch", rendered as a kanban-like card, and
has a separate "Cards (beta)" feature. Paseo's equivalent primitive is a
**workspace**.

## Decision

A card on the board is a Paseo **workspace** (Agor's "branch"). We never refer
to Agor's "Cards (beta)" feature unless explicitly. The card title is the
workspace name; the git branch (when present) is shown beneath it.

## Consequences

- Consistent terminology in code, docs, and UI.
- PR, issue, and session metadata all hang off the workspace (see 0005).
