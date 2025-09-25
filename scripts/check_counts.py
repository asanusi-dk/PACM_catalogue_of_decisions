#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re
A64 = re.compile(r'(A6\.4-[A-Z]+(?:-[A-Z]+)*-\d{3})', re.I)
UN  = re.compile(r'(FCCC/PA/CMA/\d{4}/[\w./-]+)', re.I)
with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
  data = json.load(f)

print(f"Total: {len(data)}")
want = {"Baku, Decision 6/CMA.6", "Baku, Decision 5/CMA.6",
        "Glasgow, Decision 3/CMA.3", "Sharm el-Sheikh, Decision 7/CMA.4",
        "Article 6.4 sustainable development tool (Mandatory tool)"}
have = {d["title"] for d in data}
missing = sorted(want - have)
if missing:
  print("Missing required titles:"); [print(" -", m) for m in missing]
else:
  print("All required titles present.")

# Check if any date fields look like symbols (should have been moved)
weird = [d for d in data if d.get("date") and (A64.search(d["date"]) or UN.search(d["date"]))]
if weird:
  print("\nRows where 'date' still looks like a symbol (should be zero):")
  for w in weird[:10]:
    print("-", w["title"], "| date:", w["date"])
else:
  print("\nNo symbol-looking strings left in the Date column.")
