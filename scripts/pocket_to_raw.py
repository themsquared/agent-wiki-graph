#!/usr/bin/env python3
"""Write Pocket recordings to immutable _raw/ markdown files for an agent-maintained wiki.

Usage: pocket_to_raw.py <get_pocket_conversation output .txt/.json> <out_dir> <notes.json>

notes.json maps recordingId -> {"slug": "...", "start": "ISO UTC start from the
search_pocket_conversations result", "event": "...", "warnings": ["..."]}.
Recordings not in notes.json are skipped. Existing files are never overwritten,
because _raw/ is immutable.

The Pocket AI summary is kept, but under a heading that marks it as generated,
since it restates diarization and transcription errors as facts. Signed audio
URLs are not stored; they expire and carry signatures.
"""
import json, os, sys

src, out_dir, notes_path = sys.argv[1:4]
data = json.load(open(src))["data"]
notes = json.load(open(notes_path))
os.makedirs(out_dir, exist_ok=True)

GENERIC = (
    "Speaker labels are Pocket diarization guesses, not records. Named labels are no more "
    "reliable than numbered ones, and in a room recording the account owner's own name can "
    "land on a presenter. Corroborate a speaker from content before attributing anything. "
    "See [[transcript-speaker-labels-are-guesses]] and "
    "[[generated-summaries-are-not-sources]]."
)

for r in data:
    n = notes.get(r["recordingId"])
    if not n:
        continue
    path = os.path.join(out_dir, f"{n['slug']}.md")
    if os.path.exists(path):
        print("exists, skipped:", path)
        continue
    segs = r.get("transcriptSegments") or []
    dur = segs[-1]["end"] / 60 if segs else 0
    labels = sorted({s["speaker"] for s in segs})
    with open(path, "w") as f:
        f.write("---\n")
        f.write(f"date: {n['start'][:10]}\n")
        f.write("source: pocket\n")
        f.write(f"original-title: \"{r['recordingTitle']}\"\n")
        f.write(f"pocket_recording_id: {r['recordingId']}\n")
        f.write(f"recording_start_utc: {n['start']}\n")
        f.write(f"pocket_recording_date_field: {r.get('recordingDate')}\n")
        f.write(f"duration_min: {dur:.1f}\n")
        f.write(f"event: \"{n.get('event', '')}\"\n")
        f.write(f"speaker_labels: {json.dumps(labels)}\n")
        f.write("---\n\n")
        f.write(f"# {r['recordingTitle']} (raw Pocket transcript)\n\n")
        f.write("> [!warning] Read before quoting anything below\n")
        f.write(f"> {GENERIC}\n")
        for w in n.get("warnings", []):
            f.write(f"> - {w}\n")
        f.write("\n## Pocket-generated summary (machine output, not a source)\n\n")
        f.write((r.get("summary") or {}).get("markdown", "(none)").strip() + "\n\n")
        f.write("## Transcript\n\n")
        for s in segs:
            m, sec = divmod(int(s["start"]), 60)
            f.write(f"**[{m:02d}:{sec:02d}] {s['speaker']}:** {s['text']}\n\n")
    print("wrote", path)
