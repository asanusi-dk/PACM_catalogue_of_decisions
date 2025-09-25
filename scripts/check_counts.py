#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, collections, sys
with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
    data = json.load(f)

print(f"Total records: {len(data)}")
bad = [d for d in data if re.search(r'^(instructions?|ver\.|version)\b', d.get("title",""), flags=re.I)]
if bad:
    print("\nSuspicious titles (should not be present):")
    for b in bad[:50]:
        print(" -", b.get("title"), "|", b.get("url"))
    if len(bad)>50: print(f"... and {len(bad)-50} more")

# Find duplicate URLs (ignoring hash fragment)
def strip_hash(u): return u.split('#',1)[0]
by_url = collections.defaultdict(list)
for d in data:
    by_url[strip_hash(d["url"])].append(d)
dups = {u:lst for u,lst in by_url.items() if len(lst)>1 and not (u.endswith("/2024/17/Add.1") or "2024/17/Add.1" in u)}
if dups:
    print("\nPotential duplicate URLs (ignoring #fragment):")
    for u,lst in list(dups.items())[:30]:
        print(" *", u)
        for x in lst:
            print("    -", x["title"])
    if len(dups)>30: print(f"... and {len(dups)-30} more")

print("\nBy Section → Subsection counts:")
counts = collections.Counter((d.get("section",""), d.get("subsection","")) for d in data)
for (sec,sub),n in sorted(counts.items(), key=lambda x: (x[0][0].lower(), x[0][1].lower())):
    print(f" {sec or '—'} → {sub or '—'}: {n}")
