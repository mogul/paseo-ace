# 0014. Rename boards plugin to `ace-boards`

- Status: Accepted
- Date: 2026-10-12

## Context

The boards plugin was named `ace`, but the ACE suite has two plugins and the
shared state directory is also `ace` (`~/.paseo/ace/`), which was confusing.

## Decision

Rename the boards plugin's id and package from `ace` to `ace-boards`. Its MCP
server is injected as `mcpServers["ace-boards"]` and its `serverInfo.name` is
`ace-boards`. The shared state directory stays `~/.paseo/ace/` (it is the
suite's, holding both `boards.json` and the teammates state). `ace-teammates`
is unchanged.

## Consequences

- Plugin id `ace-boards`; board MCP server name `ace-boards`.
- No state migration (the state dir is unchanged).
