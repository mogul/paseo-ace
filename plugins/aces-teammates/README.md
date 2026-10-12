# aces-teammates

Persistent AI teammates for Paseo: stable identity and file memory, a persona gallery, and a memory MCP. Give a teammate a board and a heartbeat to make a supervisor.

## Install

```
paseo plugin install github:mogul/paseo-aces:plugins/aces-teammates
```

Or from a local checkout:

```
paseo plugin install /absolute/path/to/paseo-aces/plugins/aces-teammates
```

## Usage

Open **Teammates** in the sidebar.

- Create a teammate: name, emoji, starting point (persona), provider/model, resident board, and an optional heartbeat.
- Start a teammate in a chosen workspace or its home directory. It loads its identity and memory and can write memory via MCP.
- Copy the memory path from a teammate's menu to browse its files.

## Memory MCP

Agents get `teammate_list`, `teammate_memory_append`, and `teammate_memory_read` tools. Memory is argument-scoped by teammate slug, which the teammate learns from its system prompt.

## Data model

```
~/.paseo/aces/
  teammates.json
  teammates/<slug>/
    SOUL.md
    USER.md
    IDENTITY.md
    BOARD.md
    HEARTBEAT.md
    memory/YYYY-MM-DD.md
```

## Development

```
npm install
npm run typecheck
```
