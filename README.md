# agent-wiki-graph

A starter kit for an **Obsidian wiki that agents maintain and read**: persistent memory that
survives every session, and a schema that tells each agent where a fact goes before it writes it.

It is the skeleton of the wiki I run for my own account work, with every real account removed and
one fictional vault (`accounts/acme-robotics/`) built the same way the real ones are.

## What is in it

| Path | What it does |
|---|---|
| `CLAUDE.md` | The schema contract. Page types, frontmatter, the provenance rule, routing (account fact vs product fact), house style. Every agent reads it first. |
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

Expected output:

```
pages 17  edges 44  broken targets 0  orphans 0
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

## The two traps the sample is built around

The fictional transcript contains the two errors that hit real recordings most often:

1. A speaker labeled `Jane Doe` refers to Jane in the third person. The label is wrong. See
   `concepts/transcript-speaker-labels-are-guesses.md`.
2. The recorder's summary says "Kubernetes 1.3". The transcript says 1.33 and 1.31. See
   `concepts/generated-summaries-are-not-sources.md`.

`notes.json` carries both warnings, so they are stamped into the raw file's header at save time.

## License

MIT.
