# ace-boards

A board of zones for your Paseo workspaces. Move a workspace into a zone to run that zone's prompt, or use zones as status flags.

## Install

```
paseo plugin install github:mogul/paseo-ace:plugins/ace-boards
```

Or from a local checkout:

```
paseo plugin install /absolute/path/to/paseo-ace/plugins/ace-boards
```

## Usage

Open **Boards** in the sidebar. The board shows your workspaces as cards, grouped into zones.

- Add zones from the board menu; edit or delete a zone from its menu.
- Move a card between zones (or between boards). Landing in a zone with a trigger runs it; a zone with no trigger just moves the card.
- Tap a card to expand its session tree; tap a session to open it. Start a new session from a card.
- Create new workspace cards with Create card (using the board's card defaults) or adopt unassigned ones with Find card.

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

## Board MCP

Agents get `board_list` and `board_move_card` tools injected, so they can read and move cards on the board.

## Issue pills

Workspace labels with an `issue:` prefix are shown as issue pills on the card, e.g. a workspace label `issue:123`.

## Development

```
npm install
npm run typecheck
```

Board data lives in `~/.paseo/ace/boards.json`.
