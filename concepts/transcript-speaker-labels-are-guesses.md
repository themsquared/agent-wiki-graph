---
type: concept
title: Transcript speaker labels are guesses, and a named wrong label looks exactly like a right one
tags: [concept, transcripts, ingest, provenance, trap]
confidence: verified
updated: 2026-10-20
---

# Transcript speaker labels are guesses

## The failure mode

Recorders label some speakers with a real attendee's name and others as `SPEAKER_01`. The named
labels are not more reliable, only more convincing. An ingest that trusts them writes a quote
onto the wrong `people/` page with a `_raw/` citation backing it, and the citation makes the
error survive review.

## How to catch it

The tell is a speaker referring to their own label in the third person. In
[[2026-10-14-acme-robotics-poc-kickoff]] the segment labeled `Jane Doe` says "Jane asked me to
raise budgets." Nobody talks about themselves that way.

## What to do

1. Corroborate the speaker from outside the label: someone addressing them by name, a
   self-identification ("This is Sam"), a known fact that matches.
2. When corroboration fails, attribute to the side ("Acme side"), not the person, and do not
   update a `people/` page from that quote.
3. Put the warning in the raw file's header at save time, so every later reader sees it.
   `scripts/pocket_to_raw.py` takes per-recording warnings for this.

## Seen in

- [[accounts/acme-robotics/index|Acme Robotics]], kickoff 2026-10-14.
