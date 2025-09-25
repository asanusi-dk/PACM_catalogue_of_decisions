#!/usr/bin/env python3
# Scrape ONLY the "Current version" rows + the CMA table, and store exact page headings.
# Each record gets:
#  - section: nearest H2 text (e.g., "Standards", "CMA related decisions and documents")
#  - subsection: nearest H3/H4 text if present (e.g., "Activity cycle", "Methodology")
# The script merges with existing data to preserve manual 'notes' and other curated fields.

import json, re, sys
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

RULES_URL = "https://unfccc.int/process-and-meetings/bodies/constituted-bodies/article-64-supervisory-body/rules-and-regulations"
OUT_JSON  = "data/a64_catalogue.json"
HEADERS = {"User-Agent": "PACM-catalogue-bot/1.0 (+https://github.com)"}

def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text

def clean_space(s): return " ".join((s or "").split())

def nearest_headings(el):
    # Walk back to find closest H2 (section) and then next H3/H4 (subsection)
    sec = sub = ""
    for prev in el.find_all_previous(["h2","h3","h4"]):
        tag = prev.name.lower()
        txt = clean_space(prev.get_text(" ", strip=True))
        if tag == "h2" and not sec:
            sec = txt
        elif tag in ("h3","h4") and not sub:
            sub = txt
        if sec and sub:
            break
    return sec, sub

def parse_current_version_table(table, section, subsection):
    # Detect header columns
    head = [clean_space(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
    if not any("current version" in h for h in head):
        return []
    rows = []
    for tr in table.find_all("tr"):
        tds = tr.find_all(["td","th"])
        if len(tds) < 3:
            continue
        # Current version link + version text
        link = None
        ver = ""
        try:
            idx_cv = next(i for i,h in enumerate(head) if "current version" in h)
            a = tds[idx_cv].find("a", href=True)
            if a:
                link = urljoin(RULES_URL, a["href"])
                ver = clean_space(a.get_text(" ", strip=True))
            else:
                continue
        except StopIteration:
            continue
        # Title
        try:
            idx_title = next(i for i,h in enumerate(head) if h.startswith("title"))
            title = clean_space(tds[idx_title].get_text(" ", strip=True))
        except StopIteration:
            title = ""
        # Symbol
        symbol = ""
        try:
            idx_sym = next(i for i,h in enumerate(head) if "symbol" in h)
            symbol = clean_space(tds[idx_sym].get_text(" ", strip=True))
        except StopIteration:
            pass
        # Entry into force / publication date
        date = ""
        for key in ("entry into force","publication date","date of entry into force"):
            try:
                idx_date = next(i for i,h in enumerate(head) if key in h)
                date = clean_space(tds[idx_date].get_text(" ", strip=True))
                break
            except StopIteration:
                continue

        rows.append({
            "title": title,
            "version": ver.replace("ver.","").strip(),
            "symbol": symbol,
            "date": date,
            "url": link,
            # exact headings from page
            "section": section,
            "subsection": subsection,
            # keep old fields for compatibility
            "type": "",
            "category": "",
            "notes": "",
            "is_current": True,
            "source_section": section or "Rules & Regulations"
        })
    return rows

def parse_cma_table(table, section):
    # Must be in the CMA section; headers won't include "Current version"
    head = [clean_space(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
    if any("current version" in h for h in head):
        return []
    if not any("title" in h for h in head):
        return []
    rows = []
    for tr in table.find_all("tr"):
        tds = tr.find_all(["td","th"])
        if len(tds) < 1:
            continue
        title = ""
        link = None
        symbol = ""
        date = ""

        # Title + link
        try:
            idx_title = next(i for i,h in enumerate(head) if h.startswith("title"))
            td = tds[idx_title]
            title = clean_space(td.get_text(" ", strip=True))
            a = td.find("a", href=True)
            if a: link = urljoin(RULES_URL, a["href"])
        except StopIteration:
            # fallback: any link in row
            a = tr.find("a", href=True)
            if a:
                link = urljoin(RULES_URL, a["href"])
                title = title or clean_space(a.get_text(" ", strip=True))

        # Symbol
        try:
            idx_sym = next(i for i,h in enumerate(head) if "symbol" in h)
            symbol = clean_space(tds[idx_sym].get_text(" ", strip=True))
        except StopIteration:
            pass

        if not title and not link:
            continue

        rows.append({
            "title": title or symbol or "CMA document",
            "version": "",
            "symbol": symbol,
            "date": date,
            "url": link or "",
            "section": section,
            "subsection": "",
            "type": "CMA decision",
            "category": "CMA",
            "notes": "",
            "is_current": False,
            "source_section": section
        })
    return rows

def merge(old, new):
    by_url = {r.get("url"): r for r in old if r.get("url")}
    for r in new:
        if r["url"] in by_url:
            cur = by_url[r["url"]]
            # Keep manual notes and any curated fields
            for k,v in r.items():
                if k == "notes" and cur.get("notes"):
                    continue
                if not cur.get(k) and (v not in (None, "")):
                    cur[k] = v
            # Always refresh section/subsection with current page headings
            cur["section"] = r.get("section","") or cur.get("section","")
            cur["subsection"] = r.get("subsection","") or cur.get("subsection","")
        else:
            by_url[r["url"]] = r
    return list(by_url.values())

def main():
    html = fetch(RULES_URL)
    soup = BeautifulSoup(html, "lxml")

    records = []
    for tb in soup.find_all("table"):
      # Find exact headings above this table
      section, subsection = nearest_headings(tb)
      sec_low = (section or "").lower()

      # CMA table (under CMA headings)
      if "cma related decisions" in sec_low or "cma related documents" in sec_low:
          rows = parse_cma_table(tb, section)
          if rows: records.extend(rows)
          continue

      # Current version tables
      rows = parse_current_version_table(tb, section, subsection)
      if rows:
          records.extend(rows)

    # Merge with existing to keep notes, etc.
    try:
        with open(OUT_JSON, "r", encoding="utf-8") as f:
            old = json.load(f)
    except Exception:
        old = []

    merged = merge(old, records)

    # Tidy and sort: by section → subsection → symbol → title
    for r in merged:
        for k in list(r.keys()):
            if isinstance(r[k], str):
                r[k] = r[k].strip()
        r.setdefault("notes","")
        r.setdefault("section","")
        r.setdefault("subsection","")

    def sort_key(x):
        return (
            (x.get("section") or "").lower(),
            (x.get("subsection") or "").lower(),
            (x.get("symbol") or ""),
            (x.get("title") or "").lower()
        )

    merged.sort(key=sort_key)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"[done] wrote {OUT_JSON} with {len(merged)} records (exact headings).")

if __name__ == "__main__":
    main()
