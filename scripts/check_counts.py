#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, collections
with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
    data = json.load(f)

by_sec = collections.defaultdict(int)
by_pair = collections.defaultdict(int)
for r in data:
    by_sec[r.get("section","")] += 1
    key = (r.get("section",""), r.get("subsection",""))
    by_pair[key] += 1

print("\n=== Totals by section ===")
for sec, n in sorted(by_sec.items(), key=lambda x: x[0].lower()):
    print(f"{sec or '—'}: {n}")

print("\n=== Totals by section → subsection ===")
for (sec, sub), n in sorted(by_pair.items(), key=lambda x: (x[0][0].lower(), x[0][1].lower())):
    print(f"{sec or '—'} → {sub or '—'}: {n}")

print(f"\nGrand total: {len(data)} docs\n")
