---
type: concept
title: Recorder-generated summaries restate transcription errors as facts
tags: [concept, transcripts, ingest, provenance, trap]
confidence: verified
updated: 2026-10-20
---

# Recorder-generated summaries are not sources

## The failure mode

The AI summary a recorder attaches to a transcript is written from the transcript, including its
errors. It drops digits from version numbers, invents next steps nobody said, and turns a
mislabeled speaker into a named commitment. Because it is short and confident, an agent reaching
for "the facts" reads it first.

## Example

[[2026-10-14-acme-robotics-poc-kickoff]]: the summary says "Kubernetes 1.3". The transcript says
1.33 on POC clusters and 1.31 in production. The summary also says "next check-in is next week",
which nobody says.

## What to do

- Keep the summary in the raw file, under a heading that marks it as machine output.
- Extract facts from the transcript segments only.
- Version numbers from a summary are `[UNVERIFIED]` until found in the transcript.
