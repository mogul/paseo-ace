# ACE

ACE is a board of zones for your Paseo workspaces. Each workspace is a card showing its branch, pull request, and active agent sessions. You arrange work by moving a card into a zone; a zone with a prompt runs that prompt in the workspace when a card lands there, while a zone with no prompt is a plain status flag.

## How it works

The board is a single screen in the Paseo sidebar, on desktop, web, and mobile. A server-side engine stores the board layout and, when a card is moved into a zone with a trigger, spawns an agent (or messages an existing one) in that workspace's directory using the zone's templated prompt. Board data persists to `board.json` under the daemon's Paseo home.

## Setup

Requires Paseo 0.11.2 or later. The daemon machine needs the providers referenced by zone prompts available. Board data lives under `~/.paseo/ace/` (or `$PASEO_HOME/ace/`).

## Zones

A zone is a region on the board. Its settings are a name and an optional trigger. A trigger chooses whether to create a new agent session or reuse an existing one, whether to send a prompt to it or spawn a child session, a provider, and an editable prompt template. A zone with no trigger is a status flag, so dropping a card into "Human review" just signals a state change.

Moving a card into a zone with a trigger fires it. Templates resolve against `{{workspace.name}}`, `{{workspace.directory}}`, `{{workspace.kind}}`, `{{branch.name}}`, `{{pr.number}}`, `{{pr.url}}`, `{{pr.title}}`, and `{{zone.title}}`.

## Cards

A card is a workspace. It shows the workspace name, its git branch when present, a pull request pill when one exists, and a collapsible session tree of the agents in that workspace (including sub-agents). Session rows open the corresponding agent. Issue references can be recorded as workspace labels with an `issue:` prefix and appear as pills.

## Limits

The board shows workspaces and agents the daemon lists; archived workspaces are excluded. Zones are arranged in columns and are moved by tapping, not dragging. Scheduled or lifecycle-driven automation is out of scope here and is covered by Paseo's own schedules and other facilities.
