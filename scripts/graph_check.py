#!/usr/bin/env python3
"""Check an Obsidian wiki's link graph: broken wikilinks, orphans, hubs.

Usage: graph_check.py <vault_root> [--json]

Resolves [[target]] and [[target|display]] the way Obsidian does: a bare
slug matches any file with that basename, a path matches from the vault root.
_raw/ files count as link targets but are never reported as orphans, because
raw sources are cited, not navigated to.
"""
import json, os, re, sys
from collections import Counter, defaultdict

root = os.path.abspath(sys.argv[1])
LINK = re.compile(r"\[\[([^\]|#\\]+)\\?(?:#[^\]|]*)?\\?(?:\|[^\]]*)?\]\]")  # \| is a pipe escaped inside a table
SKIP = {".git", ".obsidian", ".trash", "node_modules", ".claude", "templates", "_vault-template"}  # skeletons hold placeholder links

files = {}  # relpath without .md -> abs path
for d, dirs, fs in os.walk(root):
    dirs[:] = [x for x in dirs if x not in SKIP]
    for f in fs:
        if f.endswith(".md"):
            p = os.path.join(d, f)
            files[os.path.relpath(p, root)[:-3]] = p

by_base = defaultdict(list)
for rel in files:
    by_base[os.path.basename(rel).lower()].append(rel)

def resolve(target, src):
    t = target.strip().removesuffix(".md")
    if t in files:
        return t
    # relative to the linking file's folder, then any folder up the tree
    here = os.path.dirname(src)
    while True:
        cand = os.path.normpath(os.path.join(here, t))
        if cand in files:
            return cand
        if not here:
            break
        here = os.path.dirname(here)
    hits = by_base.get(os.path.basename(t).lower(), [])
    return hits[0] if hits else None

inbound = Counter()
broken = defaultdict(list)
edges = 0
for rel, p in files.items():
    text = open(p, encoding="utf-8", errors="replace").read()
    text = re.sub(r"```.*?```", "", text, flags=re.S)  # ignore code fences
    for m in LINK.finditer(text):
        tgt = resolve(m.group(1), rel)
        if tgt:
            if tgt != rel:
                inbound[tgt] += 1
                edges += 1
        else:
            broken[m.group(1).strip()].append(rel)

def raw(rel):
    return "/_raw/" in f"/{rel}/"

orphans = sorted(r for r in files if inbound[r] == 0 and not raw(r)
                 and os.path.basename(r) not in {"index", "CLAUDE", "log", "README"})
report = {
    "pages": len(files),
    "edges": edges,
    "broken_targets": len(broken),
    "orphans": len(orphans),
    "top_hubs": inbound.most_common(15),
    "broken": {k: sorted(set(v))[:5] for k, v in sorted(broken.items())},
    "orphan_list": orphans,
}
if "--json" in sys.argv:
    print(json.dumps(report, indent=1))
else:
    print(f"pages {report['pages']}  edges {edges}  broken targets {len(broken)}  orphans {len(orphans)}")
    print("top hubs:")
    for t, n in report["top_hubs"]:
        print(f"  {n:4d}  {t}")
