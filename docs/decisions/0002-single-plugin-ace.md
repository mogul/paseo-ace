# 0002. One plugin, id `ace`

- Status: Accepted
- Date: 2026-10-11

## Context

We began with two self-contained plugins (`ace-pipelines`, `ace-canvas`). Once
the board model landed (0001), zones and the prompt library became tightly
coupled (zones reference prompts; the board is the only surface). Paseo plugins
are compiled independently and cannot import each other, so sharing would have
meant a filesystem contract or duplicated logic.

## Decision

Merge everything into a single plugin with id `ace`.

## Consequences

- No cross-plugin coupling; one `board.json`, one RPC surface, one MCP server.
- The id is deliberately unnamespaced; it can be renamed if we later split into
  multiple plugins, since there are no existing dependents on the id.
