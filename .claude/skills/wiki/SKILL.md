---
name: wiki
description: Maintain the account wiki in this repo. Ingest transcripts and documents, answer questions from the wiki with citations, regenerate an account's status page, start a new account vault, and health-check the link graph. Use when the user says ingest, sync, query, status, init, or lint about the wiki.
---

# /wiki: account wiki

The schema contract is `CLAUDE.md` at the repo root. Read it before writing anything, then read
`accounts/<slug>/CLAUDE.md` for that account's deltas. Never write a page without having read both.

| Subcommand | Args | Does |
|---|---|---|
| `ingest <account\|--tech> [source]` | slug or flag | Save a raw source, then fan it out into pages |
| `query <question>` | question | Answer from the wiki with `[[citations]]` |
| `status <account>` | slug | Regenerate `status.md` |
| `init <name>` | name | New vault from `_vault-template/` |
| `lint` | none | Run `scripts/graph_check.py`, then the content checks below |

## ingest

The core operation. Everything else is scaffolding around it.

**Route first.** Is this fact about this account, or about the product? `--tech` (or a source with
no account) routes to the root technical layer.

1. **Save the raw source** to `accounts/<slug>/_raw/YYYY-MM-DD-<source>-<slug>.md` with
   frontmatter `date`, `source`, `original-title`. For Pocket exports use
   `scripts/pocket_to_raw.py`, which never overwrites. Never edit `_raw/` after saving.
2. **Extract.** List the takeaways that will still matter in three months: decisions,
   commitments with owners and dates, version-pinned facts, people, blockers, sentiment shifts.
   Show them to the user before writing, unless they asked for a batch ingest.
3. **Fan out.** A real source touches 5 to 15 pages. If you touched one, you under-ingested.
   - `people/`: create or update each attendee, set `last-interaction`
   - `topics/`: create or update each workstream discussed
   - `meetings/YYYY-MM-DD-<slug>.md`: Context, Key Discussion Points, Decisions, Action Items,
     Follow-ups
   - `timeline.md`: prepend, material events only
   - `status.md`: regenerate if state, risk, blockers, or next steps moved
   - `index.md`: update `last-contact`
   - **Root layer**: if the source revealed a generalizable trap or version behavior, write or
     update `concepts/`, `products/`, or `demos/` and link it from the account page.
4. **Reconcile, do not append blindly.** If the source contradicts a page, fix the page and note
   what changed. Newer verified source wins. If you cannot tell, keep both and flag it.
5. **Report**: pages created, pages updated, contradictions resolved, open questions.

### Batch ingest with parallel agents

For a week of recordings, split by account and give each subagent exactly one vault to write.
Shared root files (`index.md`, `log.md`, `products/*`, existing `concepts/*`) belong to the
orchestrator only. Subagents may create new `concepts/` pages and must return proposed edits to
shared files in their report instead of writing them. Two writers on one file is how a wiki
silently loses a paragraph.

## query

1. Read `index.md`, then grep `accounts/`, `concepts/`, `products/`, `demos/`.
2. Read the pages that matter in full and follow their wikilinks one hop out. The answer is often
   on a linked `concepts/` page rather than the obvious account page.
3. Answer with `[[citations]]` on every claim. If the wiki does not cover it, say so.
4. If the answer took real synthesis, file it as a `concepts/` page and log it.

## status

Regenerate `status.md` from `index.md`, `timeline.md`, recent `meetings/`, and active `topics/`.
Lead with what is true now, including "nothing has happened in N weeks". Risk must say why, and
must separate risk-from-evidence from risk-from-ignorance.

## lint

1. `python3 scripts/graph_check.py .` for broken links, orphans, and hubs.
2. Then read for: contradictions between pages (quote both), `[UNVERIFIED]` markers older than
   30 days, `demos/` with `last_verified` older than 60 days, people not contacted in 30 days on
   an active account, overdue action items.
3. Never resolve a contradiction by picking a side unless one source is clearly newer and
   verified. Surface both.
