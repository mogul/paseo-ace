# 0007. No external runtime deps; assets inlined

- Status: Accepted
- Date: 2026-10-11

## Context

We probed the plugin subprocess runtime: its `cwd` is the Paseo app directory,
`import.meta.url` is `undefined`, and there is no plugin-directory env var. We
also could not confirm that npm runtime dependencies resolve at runtime.

## Decision

- Use only Node builtins (`node:http`, `node:fs`, `node:path`, `node:os`,
  `node:crypto`) plus Paseo's host-provided modules (`@getpaseo/*`, `zod`, React,
  React Native). No external runtime npm dependencies.
- Anything a server needs (templating, cron, the MCP JSON-RPC server) is
  hand-rolled and small.
- Static assets are inlined as strings where a server would otherwise need to
  read files (moot since the web app was removed in 0003).

## Consequences

- Fully portable and self-contained; no dependency-resolution risk.
- Some reinvention of tiny utilities (template resolver, cron, MCP) that an SDK
  would otherwise provide.
