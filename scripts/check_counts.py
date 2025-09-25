#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, collections
with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
    data = json.load(f)

missing = [d for d in data if not (d.get("symbol") or "").strip()]
if missing:
    print("Entries with missing symbols:")
    for m in missing[:50]:
        print(" -", m.get("title"), "|", m.get("url"))
    if len(missing) > 50:
        print(f"... and {len(missing)-50} more")
else:
    print("All entries have a symbol.")

print("\nBy Section → Subsection counts:")
counts = collections.Counter((d.get("section",""), d.get("subsection","")) for d in data)
for (sec,sub),n in sorted(counts.items(), key=lambda x: (x[0][0].lower(), x[0][1].lower())):
    print(f" {sec or '—'} → {sub or '—'}: {n}")
print(f"\nGrand total: {len(data)} docs")
