# 0003. Native RN board, no served web app

- Status: Accepted
- Date: 2026-10-11

## Context

An early canvas was a self-contained web app (vanilla web components) served by
the plugin over `node:http`, opened in a separate browser tab; mobile got a
read-only RN fallback. In use, the in-app React Native view felt better: no
context break, no duplicate tab, and it renders identically on desktop, web, and
mobile.

## Decision

The board is a native React Native screen (Paseo's platform requirement). The
served web app, its HTTP server, inlined HTML, and the desktop/mobile split were
removed.

## Consequences

- One code path across all clients; no localhost reachability issues.
- Given up (RN constraints): drag-resize, freeform spatial layout, and HTML
  artifact rendering. The board is a grid with tap-to-move.
- Web components may still be useful later for a standalone dashboard, but not
  for the in-app board.
