#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re
with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
  data = json.load(f)

print(f"Total: {len(data)}")
for r in data:
  if "Decision 6/CMA.6" in r["title"] or "Decision 5/CMA.6" in r["title"]:
    print("CMA Baku example →", r["title"], "| symbol:", r["symbol"])
  if "Decision 3/CMA.3" in r["title"] or "Decision 7/CMA.4" in r["title"]:
    print("CMA normalized →", r["title"], "| symbol:", r["symbol"])
