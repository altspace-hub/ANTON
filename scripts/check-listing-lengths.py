#!/usr/bin/env python3
"""Verify the Play listing copy in docs/PLAY_STORE_LISTINGS.md fits Play's limits.

Play truncates nothing — it rejects. App name <= 30, short description <= 80,
full description <= 4000 characters. Run this after editing the copy:

    python scripts/check-listing-lengths.py
"""
import io, os, re, sys

DOC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "docs", "PLAY_STORE_LISTINGS.md")
LIMITS = {"App name": 30, "Short description": 80, "Full description": 4000}

text = io.open(DOC, encoding="utf-8").read()

# Each field is a **Bold label** followed by a fenced block.
pat = re.compile(r"\*\*(App name|Short description|Full description[^*]*)\*\*\s*\n```\n(.*?)\n```",
                 re.S)

app = None
rows, bad = [], 0
for line in text.split("\n"):
    m = re.match(r"^## \d+\.\s+(.+?)\s+—", line)
    if m:
        app = m.group(1)

# Re-walk with positions so each field is attributed to the heading above it.
headings = [(m.start(), m.group(1)) for m in re.finditer(r"^## \d+\.\s+(.+?)\s+—", text, re.M)]
for m in pat.finditer(text):
    label = m.group(1).split(" (")[0]
    limit = LIMITS.get(label)
    if limit is None:
        continue
    body = m.group(2)
    owner = "?"
    for pos, name in headings:
        if pos < m.start():
            owner = name
    n = len(body)
    ok = n <= limit
    bad += 0 if ok else 1
    rows.append((owner, label, n, limit, ok))

w = max(len(r[0]) for r in rows) if rows else 10
print("%-*s  %-18s %7s %7s  %s" % (w, "app", "field", "chars", "limit", "ok"))
for owner, label, n, limit, ok in rows:
    print("%-*s  %-18s %7d %7d  %s" % (w, owner, label, n, limit, "yes" if ok else "OVER"))

if not rows:
    print("no listing blocks found — has the doc format changed?")
    sys.exit(1)
print("\n%d field(s) over limit" % bad)
sys.exit(1 if bad else 0)
