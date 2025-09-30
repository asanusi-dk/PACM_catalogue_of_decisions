#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

REQUIRED = {
  "FCCC/PA/CMA/2022/6": "Annual report (reporting period 28 Jul. - 22 Sep. 2022)",
  "FCCC/PA/CMA/2022/6/Add.1": "Addendum (reporting period 23 Sep. - 6 Nov. 2022)",
  "FCCC/PA/CMA/2023/15": "Annual report (reporting period 7 Nov. 2022 - 14 Sep. 2023)",
  "FCCC/PA/CMA/2023/15/Add.1": "Addendum (reporting period 15 Sep. - 2 Nov. 2023)",
  "FCCC/PA/CMA/2024/2": "Annual report (reporting period 18 Nov. 2023 - 18 Jul. 2024)",
  "FCCC/PA/CMA/2024/2/Add.1": "Addendum (reporting period 19 Jul. 2024 - 9 Oct. 2024)",
}

with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
  data = json.load(f)

by_sym = { (d.get("symbol") or "").strip(): d for d in data if (d.get("symbol") or "").strip() }

missing = [k for k in REQUIRED if k not in by_sym]
wrong   = [k for k,v in REQUIRED.items() if (k in by_sym and by_sym[k].get("title") != v)]

print(f"Total: {len(data)}")
if missing:
  print("\nMissing required Annual report/Addendum symbols:")
  for k in missing: print(" -", k)
else:
  print("\nAll required Annual report/Addendum symbols are present (if published on the page).")
if wrong:
  print("\nTitles needing normalization:")
  for k in wrong: print(f" - {k}: found '{by_sym[k].get('title')}', expected '{REQUIRED[k]}'")
else:
  print("\nAll mapped titles match the expected phrasing.")
