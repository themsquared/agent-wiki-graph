# agent-wiki-graph

A starter kit for an **Obsidian wiki that agents maintain and read**: persistent memory that
survives every session, and a schema that tells each agent where a fact goes before it writes it.

It is the skeleton of the wiki I run for my own account work, with every real account removed and
one fictional vault (`accounts/acme-robotics/`) built the same way the real ones are.

## Schema MCP, not file CRUD

Mem0 and generic Obsidian MCP servers treat a vault as a bag of files: search, read, write,
overwrite, delete. This repo ships the opposite. The server in [`mcp/`](mcp/) lets any MCP
client read the graph, but the only write is a new note under `_agents/inbox/` with required
frontmatter. The schema in [CLAUDE.md](CLAUDE.md) decides where a fact lives. The engineer
(or `/wiki ingest`) places it. That is structured multi-agent memory, not file CRUD.

## What is in it

| Path | What it does |
|---|---|
| `CLAUDE.md` | The schema contract. Page types, frontmatter, the provenance rule, routing (account fact vs product fact), house style, MCP write path, deny list. Every agent reads it first. |
| `mcp/` | Schema-enforcing MCP server. Read broadly, write only `_agents/inbox/`. |
| `_agents/inbox/` | Create-only drop for MCP agents. Existing wiki pages stay untouched. |
| `.claude/skills/wiki/SKILL.md` | The `/wiki` skill for Claude Code: `ingest`, `query`, `status`, `init`, `lint`. |
| `scripts/pocket_to_raw.py` | Turns a Pocket recorder export into immutable `_raw/` markdown, with per-recording warnings. Never overwrites. |
| `scripts/graph_check.py` | Walks the wikilink graph: pages, edges, broken links, orphans, top hubs. |
| `accounts/acme-robotics/` | A fictional vault produced from one fictional transcript, showing the fan-out. |
| `concepts/` | Two cross-account trap pages that the sample transcript triggers. |
| `templates/`, `_vault-template/` | Skeletons for new pages and new vaults. |

## Quickstart

```bash
git clone https://github.com/themsquared/agent-wiki-graph
cd agent-wiki-graph
python3 scripts/graph_check.py .
```

Expected output (counts move if you add pages):

```
pages 18  edges 48  broken targets 0  orphans 0
```

Ingest the sample transcript again (it refuses, because `_raw/` is immutable):

```bash
python3 scripts/pocket_to_raw.py examples/pocket-sample.json accounts/acme-robotics/_raw examples/notes.json
```

```
exists, skipped: accounts/acme-robotics/_raw/2026-10-14-pocket-acme-robotics-kickoff.md
```

Open the folder as an Obsidian vault and look at the graph view. Then open it in Claude Code
and run `/wiki query what are Acme's POC success criteria?`.

## MCP server

Requires Node.js 20 or later. `VAULT_ROOT` defaults to this repo (the directory that contains
`CLAUDE.md` and `accounts/`).

```bash
cd mcp
npm install
npm run smoke
npx tsx src/index.ts
```

`npm run smoke` copies the sample vault to a temp directory, loads the schema, writes one
inbox note, refuses a write outside the inbox, and runs `brain_health`. The tree in git is
not modified.

| Tool | What it does |
|---|---|
| `brain_schema` | Returns [CLAUDE.md](CLAUDE.md) plus write rules and the deny list. |
| `brain_search` | Search markdown titles and bodies. Optional `area` path prefix. |
| `brain_read` | Read one path-gated file. |
| `brain_inbox_write` | Create `_agents/inbox/YYYY-MM-DD-<agent-slug>-<topic>.md` only. |
| `brain_refuse_check` | Dry-run whether a proposed write or topic would be refused. |
| `brain_health` | `scripts/graph_check.py` summary plus inbox backlog count. |

Hard-refused topics and paths (generic, documented in CLAUDE.md): credentials and secrets,
access tokens, custody and family-legal matters, HR personnel matters. The server never
edits existing pages, never touches `_raw/`, and never deletes.

Optional HTTP: `npm run start:http` (default `http://127.0.0.1:43148/mcp`). Do not expose it
publicly. It can write inbox notes.

Full install notes: [`mcp/README.md`](mcp/README.md).

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-wiki-graph/mcp/src/index.ts"],
      "env": {
        "VAULT_ROOT": "/absolute/path/to/agent-wiki-graph"
      }
    }
  }
}
```

### Claude Desktop / Claude Code

Same stdio shape in Claude Desktop's MCP config, or:

```bash
claude mcp add agent-wiki --env VAULT_ROOT=/absolute/path/to/agent-wiki-graph -- npx tsx /absolute/path/to/agent-wiki-graph/mcp/src/index.ts
```

## The two traps the sample is built around

The fictional transcript contains the two errors that hit real recordings most often:

1. A speaker labeled `Jane Doe` refers to Jane in the third person. The label is wrong. See
   `concepts/transcript-speaker-labels-are-guesses.md`.
2. The recorder's summary says "Kubernetes 1.3". The transcript says 1.33 and 1.31. See
   `concepts/generated-summaries-are-not-sources.md`.

`notes.json` carries both warnings, so they are stamped into the raw file's header at save time.

## License

MIT. Author: Mike Moore / themsquared.
