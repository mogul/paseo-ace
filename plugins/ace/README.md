# ace

A board of zones for your Paseo workspaces. Move a workspace into a zone to run that zone's prompt, or use zones as status flags.

## Install

```
paseo plugin install github:mogul/ace-plugins:plugins/ace
```

Or from a local checkout:

```
paseo plugin install /absolute/path/to/ace-plugins/plugins/ace
```

## Usage

Open the **Board** item in the sidebar. The board shows your workspaces as cards, grouped into zones.

- **Add zone** from the board's ⋯ menu.
- A zone's ⋯ menu has **Settings** (name + trigger) and **Delete**.
- Tap a card to expand its session tree; tap a session to open it.
- **Move** a card to another zone. Landing in a zone with a trigger runs it; a zone with no trigger just moves the card.
- **New session** on a card creates another agent in that workspace.

## Zone trigger

A trigger is configured in a zone's settings:

```json
{
  "session": { "mode": "new" },
  "action": "prompt",
  "provider": "opencode/opencode-go/deepseek-v4-flash",
  "prompt": "Review the working tree in {{workspace.directory}} and summarize what changed."
}
```

- `session.mode`: `new` (create a fresh agent) or `reuse` (prompt an existing session in that workspace, chosen at drop time).
- `action`: `prompt` (send a message) or `spawn` (create a child session); `spawn` requires `reuse`.
- `prompt` is a template over `{{workspace.name}}`, `{{workspace.directory}}`, `{{workspace.kind}}`, `{{branch.name}}`, `{{pr.number}}`, `{{pr.url}}`, `{{pr.title}}`, and `{{zone.title}}`.

## Issue pills

Workspace labels with an `issue:` prefix are shown as issue pills on the card, e.g. a workspace label `issue:123`.

## Development

```
npm install
npm run typecheck
```

Board data lives in `~/.paseo/plugins/ace/board.json`.
