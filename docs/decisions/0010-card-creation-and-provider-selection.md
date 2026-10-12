# 0010. Card creation and provider-selection refinements

- Status: Accepted
- Date: 2026-10-11

## Context

After multiple boards landed (0009), card creation needed a usable project and
model selection flow, and error handling was silent.

## Decision

- **Dependent provider selection**: a shared `ProviderModelSelector` drives
  harness → model → mode → thinking options, each filtered by the prior, using
  `usePaseo().providers.listAvailable()/listModels()/listModes()` and the
  selected model's `thinkingOptions`. It persists a single `harness/model`
  string plus `modeId`/`thinkingOptionId`. Used in both the card-defaults editor
  and the Create-card form.
- **Non-git projects**: `board.projects` returns `isGit` (from
  `WorkspaceProjectDescriptorPayload.projectKind === "git"`). Worktree isolation
  and base branch are disabled for non-git projects, with an auto-switch to
  Directory and a hint.
- **Base branch placement**: the base-branch control sits between the Worktree
  and Directory radios, indented as a sub-option of Worktree.
- **Error surfacing**: all board mutation handlers wrap RPC calls in try/catch
  and report via `useToast().error(...)`; the server gives clear errors for a
  malformed `provider` string and an empty slugified branch name.
- **Find card** enumerates unassigned workspaces and, separately, other boards'
  cards (never the current board), via the `board.workspaces` RPC.

## Consequences

- Card creation is guided and fails loudly instead of silently.
- `ProjectSchema` gained a required `isGit`; `board.projects` is the source for
  git detection.
