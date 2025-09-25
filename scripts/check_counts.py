#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys

REQUIRED_TITLES = {
  "Baku, Decision 5/CMA.6",
  "Baku, Decision 6/CMA.6",
  "Glasgow, Decision 3/CMA.3",
  "Sharm el-Sheikh, Decision 7/CMA.4",
  "Article 6.4 sustainable development tool (Mandatory tool)",
  "Status of Article 6.4 mechanism resource allocation plan 2024 implementation",
  "Status of Article 6.4 mechanism resource allocation plan 2025 implementation",
}

with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
  data = json.load(f)

titles = {d["title"] for d in data}
missing = [t for t in REQUIRED_TITLES if t not in titles]

print(f"Total: {len(data)}")
if missing:
  print("Missing required titles:")
  for m in missing:
    print(" -", m)
else:
  print("All required titles present.")
