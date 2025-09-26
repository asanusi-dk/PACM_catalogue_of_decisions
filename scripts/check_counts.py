#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, sys
DECISION = re.compile(r'(\d+/CMA\.\d)', re.I)

with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
  data = json.load(f)

errors = []
for r in data:
  m = DECISION.search(r["title"])
  if m:
    code = m.group(1)
    if (r.get("symbol","") or "").strip() != code:
      errors.append(f"Symbol mismatch for decision: {r['title']} | symbol='{r.get('symbol','')}', expected='{code}'")

print(f"Total: {len(data)}")
if errors:
  print("\nCMA decision symbol mismatches:")
  for e in errors[:30]:
    print(" -", e)
  if len(errors) > 30:
    print(f"... and {len(errors)-30} more")
  sys.exit(0)
else:
  print("\nAll CMA decision symbols match their decision code.")
