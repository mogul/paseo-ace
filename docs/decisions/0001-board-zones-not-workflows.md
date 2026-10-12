# 0001. The board is zones, not a workflow engine

- Status: Accepted
- Date: 2026-10-11

## Context

We set out to port Agor's orchestration features to Paseo. The first cut was a
"pipelines" engine with steps, triggers (manual/schedule/event), templating, and
later "routing" between pipelines. In parallel we built a canvas.

Two realizations changed the direction:

1. Paseo already gives agents full orchestration (spawn/fork/steer agents and
   workspaces via MCP), so a DAG engine reimplements what the agent does better.
2. Agor's actual model is not pipelines: it is **zones** with an optional prompt;
   dropping a branch into a zone runs that prompt, and multi-step work is the
   agent's to orchestrate.

## Decision

The board is the whole feature. A **zone** has an optional templated prompt.
Dropping/moving a workspace card into a zone runs that prompt in the workspace;
a zone with no prompt is a pure status flag. There is no separate "action",
"pipeline", or "step" entity, and no routing.

## Consequences

- Scheduled and manual canned prompts are out of scope: Paseo's own `schedules`
  and `skills` cover them. Lifecycle-driven automation is a possible future
  feature, not part of the board.
- The `ace-pipelines` and `ace-canvas` plugins (and their step/routing/event
  machinery) were deleted in favor of one board plugin.
