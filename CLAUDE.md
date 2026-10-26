# Account wiki: schema contract

An **LLM-maintained wiki** for one engineer's account work. Agents write it; the engineer reads
it, corrects it, and points agents at it. Two layers of knowledge sit side by side:

- **Per-account vaults** under `accounts/<slug>/`: relationship state. Who, what stage, what is
  blocked, what was said.
- **A cross-account technical layer** at the root: `concepts/`, `products/`, `demos/`. Traps,
  version behavior, and environment state that outlive any one account.

The second layer is the one that compounds. A trap found at one account is worth more as a
`concepts/` page than as a note buried in that account's timeline. When ingesting, ask: *is this
fact about this account, or about the product?* Account-specific goes in the vault.
Generalizable goes in `concepts/`, linked from both.

Read this file before writing anything. Then read the specific vault's `CLAUDE.md`, which carries
only that account's deltas (domains, channels, IDs, quirks).

---

## Layout

```
CLAUDE.md              this file, the schema contract
index.md               portfolio catalog
log.md                 append-only decision log

accounts/<slug>/       one vault per account
  CLAUDE.md              account-specific deltas only
  index.md               durable identifiers + overview
  status.md              REGENERATED operational dashboard
  timeline.md            reverse-chronological material events
  people/                one page per stakeholder
  topics/                one page per workstream
  meetings/              YYYY-MM-DD-slug.md, one per meeting
  resources/             docs, decks, repos shared
  _raw/                  IMMUTABLE sources, never modified after saving

concepts/              cross-account traps and technique
products/              per-product version behavior
demos/                 demo repos and environments
sources/               synthesized sources feeding the technical layer
sources/_raw/          IMMUTABLE raw transcripts for internal, non-account sources
templates/             skeletons for the technical layer
_vault-template/       skeleton for a new account vault
_cross-account/        roster, digests, rollups
```

Filenames are lowercase kebab-case slugs. Meetings and raw sources are date-prefixed.

`_raw/` is ground truth. Never edit it, only add. If a wiki page and a raw source disagree, the
source wins and you fix the page.

---

## Frontmatter

### accounts/`<slug>`/index.md
```yaml
---
account: "Acme Robotics"
products: []
stage: prospect         # prospect | poc | production | churned | historical
auto_sync: true         # false mutes batch ops but not explicit commands
owner:
last-contact:
last-sync:
---
```
Sections: Overview, Key Stakeholders (table linking `people/`), Active Workstreams, Key Risks.

### accounts/`<slug>`/status.md
```yaml
---
account: "Acme Robotics"
updated:
phase:
risk: green             # green | yellow | red
---
```
Sections: Current Phase, This Week's Focus, Blockers (table), Next Meeting, Recent Wins, Open
Action Items (table: Item | Owner | Due | Status), Risk Assessment, Flags.

**`status.md` is regenerated, not appended to.** It answers "what is true right now". Keep
completed action-item rows with `Done ✓ YYYY-MM-DD` so future runs can dedupe.

### accounts/`<slug>`/timeline.md
No frontmatter. Reverse-chronological. Only **material** events: stage change, decision,
delivery, blocker cleared, stakeholder churn.
```markdown
### YYYY-MM-DD: Brief title
- Point, with [[link]]
- Source: [[_raw/filename]]
```

### people, meetings, topics
```yaml
# people/*.md
name:
title:
company:
disposition: unknown    # champion | neutral | blocker | unknown
last-interaction:

# meetings/*.md
date:
attendees: []
source: manual          # pocket | recorder | chat | manual
type:                   # discovery | technical | executive | working-session | internal

# topics/*.md
topic:
status: active          # active | resolved | parked
first-raised:
```

### Technical layer
`concepts/` needs `confidence: verified | reported | assumed`.
`products/` needs `versions_seen: []`, only versions actually run.
`demos/` needs `repo`, `cluster`, `state`, `last_verified`.
All need `type`, `title`, `tags`, `updated`.

---

## Linking

Root-layer pages have unique filenames, so link them by slug: `[[transcript-speaker-labels-are-guesses]]`.

Account `index.md` / `status.md` / `timeline.md` collide across vaults, so those take a full
path with display text: `[[accounts/acme-robotics/index|Acme Robotics]]`.

Link generously across the two layers. An account `topics/` page hitting a known trap links the
`concepts/` page rather than restating it. A link to a page that does not exist yet marks work
to do.

---

## Confidence and provenance: the rule that matters most

The engineer ships commands and claims to customers. A wrong version number costs credibility.

- **Never write a fact you did not read from a source.** No inferring a config key from a related
  field, no guessing image tags.
- Mark unverified claims `[UNVERIFIED]` with what would confirm them.
- Prefer "reproduced on a live cluster 2026-10-14" over "supports X".
- Version-pin everything.
- Cite the source for anything a customer will act on.

---

## Privacy boundary

Decide which sources are out of bounds (for example, personal email) and write the rule here.
Agents follow this file, so a boundary that is not written here does not exist.

No secrets, license keys, or API keys in the vault, ever.

---

## House style

- No em dashes. Commas, periods, parentheses.
- No metaphors, no cheerleading.
- Plain declarative sentences. Write like an engineer leaving notes for the next engineer.
- Lead with the thing that bites. In `concepts/` and `demos/`, the failure mode goes near the top.
