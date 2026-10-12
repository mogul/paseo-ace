# 0006. Zone trigger semantics

- Status: Accepted
- Date: 2026-10-11

## Context

Agor's zone settings offer session strategy (new vs reuse) and an action
(prompt / fork / spawn). We needed the subset expressible in the Paseo plugin SDK.

## Decision

A zone trigger is:

```json
{
  "session": { "mode": "new" } | { "mode": "reuse" },
  "action": "prompt" | "spawn",
  "provider": "opencode/opencode-go/deepseek-v4-flash",
  "prompt": "…template…"
}
```

- `new` + `prompt`: create a new root agent in the workspace.
- `reuse` + `prompt`: send the prompt to a session chosen **at drop time**.
- `reuse` + `spawn`: create a child of the chosen session, in the workspace.
- An empty/whitespace prompt means no trigger (the zone is a status flag).
- "fork" is omitted: `buildAgentForkContext` is daemon-internal and not exposed
  on the plugin `PaseoApi`/agent handle.

## Consequences

- Spawning always uses `paseo.workspaces.ref(workspaceId).agents.create(...)`,
  never `paseo.agents.create({ cwd })`, because the latter auto-creates a new
  workspace per run.
- Template context: `{{workspace.name}}`, `{{workspace.directory}}`,
  `{{workspace.kind}}`, `{{branch.name}}`, `{{pr.*}}`, `{{zone.title}}`.
