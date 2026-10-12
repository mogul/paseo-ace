# ACE Boards

ACE Boards is a board of zones for your Paseo workspaces. Each workspace is a card showing its branch, pull request, issue pills, and a live session tree. Move a card into a zone to run that zone's prompt, or use zones as status flags. Multiple boards, per-board card defaults, and a board MCP let you and your agents organize and drive the work.

## How it works

The board is a single screen in the Paseo sidebar, on desktop, web, and mobile. A server-side engine stores each board's layout and, when a card is moved into a zone with a trigger, spawns an agent (or messages an existing one) in that workspace's directory using the zone's templated prompt. A small MCP server exposes `board_list` and `board_move_card` so agents can read and move cards too.

## Setup

Requires Paseo 0.11.2 or later. The daemon machine needs the providers referenced by zone prompts and card defaults available. Board data lives under `~/.paseo/ace/` (or `$PASEO_HOME/ace/`), shared with the `ace-teammates` plugin and git-versionable.

## Boards, zones, and cards

A board is a set of zones arranged in columns. A zone has a name and an optional trigger (session mode new or reuse, action prompt or spawn, a provider, and a templated prompt). A zone with no trigger is a status flag. Each board has card defaults that the Create card flow uses to make new workspace cards, including an isolation mode, a base branch, and a provider and model.

Cards are workspaces. They show the workspace name, its git branch, a pull request pill, issue pills (workspace labels with an `issue:` prefix), and a collapsible session tree. Cards move between zones and between boards.

## Limits

The board shows workspaces and agents the daemon lists; archived workspaces are excluded. Cards move by tapping, not dragging. Scheduled and lifecycle-driven automation are out of scope and covered by Paseo's own schedules. The board is single-user; multiplayer presence is not yet supported.
