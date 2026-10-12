# 0005. Board data model and workspace metadata

- Status: Accepted
- Date: 2026-10-11

## Context

The board must persist layout and derive rich card state from Paseo. We needed
to know which Paseo metadata exists (branch, PR, issues, parent/child sessions).

## Decision

`board.json` stores:

```json
{
  "columns": [{ "id", "title", "width?", "zones": [{ "id", "title", "trigger?" }] }],
  "placement": { "<workspaceId>": "<zoneId>" }
}
```

Workspace cards are derived live from Paseo each poll:

- branch: `workspace.gitRuntime.currentBranch`
- PR pill: `workspace.githubRuntime.pullRequest` (number/url/title/state)
- issue pills: `workspace.labels` entries with an `issue:` prefix
- session tree: agents in the workspace, parented via `labels["paseo.parent-agent-id"]`

Archived entities are filtered (`workspace.archivingAt`, `agent.archivedAt`).

## Consequences

- Placement defaults to the first zone; moving a card rewrites `placement`.
- Issue references have no native Paseo source; the `issue:` label convention is
  our own, writeable by agents/automation later.
- A synthetic "No workspace" card collects agents without a matching workspace;
  its id is the exported `UNASSIGNED_CARD_ID` and move/new-session are hidden for it.
