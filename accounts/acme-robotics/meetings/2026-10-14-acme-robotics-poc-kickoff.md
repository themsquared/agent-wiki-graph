---
date: 2026-10-14
attendees: [jane-doe, sam-sample, Example Engineer, one unidentified Acme attendee]
source: pocket
type: technical
---

# Acme Robotics POC kickoff

Raw: [[_raw/2026-10-14-pocket-acme-robotics-kickoff]]

## Context

First call of the gateway POC.

## Key Discussion Points

- POC clusters run Kubernetes 1.33. Production runs 1.31. (The Pocket summary says "1.3"; the
  transcript says 1.33 and 1.31. See [[generated-summaries-are-not-sources]].)
- An Acme attendee asked for a monthly LLM spend cap per team, not one global cap. The label on
  that segment says Jane Doe, but the speaker refers to Jane in the third person, so the request
  is attributed to "Acme side". See [[transcript-speaker-labels-are-guesses]].
- [[sam-sample]] said the production upgrade to 1.33 is planned for November.

## Decisions

- POC success criteria: per-team budgets and tool-level access control. Four weeks.

## Action Items

| Item | Owner | Due |
|---|---|---|
| Send config capping two teams separately | Example Engineer | 2026-10-16 (Friday) |

## Follow-ups

- Identify the unnamed Acme attendee who raised budgets.
