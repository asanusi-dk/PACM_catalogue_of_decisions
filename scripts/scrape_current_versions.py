#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hotfix scraper:
- ENG-only, Current version only, ignore Forms.
- Picks Title from explicit Title/Document column; avoids "ver. 01.0" & "Instructions".
- De-duplicates by URL while preserving CMA 5/CMA.6 & 6/CMA.6 via URL fragments.
"""
import json, re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE = "https://unfccc.int"
URL  = BASE + "/process-and-meetings/bodies/constituted-bodies/article-64-supervisory-body/rules-and-regulations"

S = requests.Session()
S.headers.update({"User-Agent": "PACM-catalogue/1.0 (+github actions)"})

def fetch(url):
    r = S.get(url, timeout=60)
    r.raise_for_status()
    return r.text

def clean(s): return re.sub(r"\s+", " ", (s or "")).strip()

def nearest_headings(node):
    h2 = node.find_previous("h2")
    sec = clean(h2.get_text(" ")) if h2 else ""
    h3 = node.find_previous(["h3","h4"])
    sub = clean(h3.get_text(" ")) if (h3 and (not h2 or getattr(h3, 'sourceline', 0) > getattr(h2, 'sourceline', 0))) else ""
    return sec, sub

def english_link(a_tags):
    eng = [a for a in a_tags if "eng" in (a.get_text(" ") or "").lower() or "english" in (a.get_text(" ") or "").lower()]
    if eng: return eng[0]
    return a_tags[0] if a_tags else None

_version_rx = re.compile(r'^\s*(ver\.|version)\s*[.:]?\s*\d+(?:\.\d+)*\s*$', re.I)
_bad_title_rx = re.compile(r'^(instructions?|english|click here|ver\.|version)\b', re.I)

def best_title(cells, idx_title, link):
    # 1) Prefer the Title/Document column text
    title = ""
    if idx_title is not None and 0 <= idx_title < len(cells):
        title = clean(cells[idx_title].get_text(" "))
    # 2) Fallback to first meaningful cell from left
    if not title or _version_rx.match(title) or _bad_title_rx.match(title):
        for td in cells:
            t = clean(td.get_text(" "))
            if t and not _version_rx.match(t) and not _bad_title_rx.match(t):
                title = t; break
    # 3) Last resort, use the link text if it's not just ENG/version
    if (not title or _version_rx.match(title) or _bad_title_rx.match(title)) and link is not None:
        t = clean(link.get_text(" "))
        if t and not _version_rx.match(t) and not _bad_title_rx.match(t):
            title = t
    return title

def parse_current_table(table):
    sec, sub = nearest_headings(table)
    if "forms" in sec.lower() or "forms" in sub.lower():
        return []

    header_row = table.find("tr")
    if not header_row: return []
    headers = [clean(th.get_text(" ")) for th in header_row.find_all(["th","td"])]
    def col_idx(*keys):
        keys = [k.lower() for k in keys]
        for i, h in enumerate(headers):
            hlow = h.lower()
            for k in keys:
                if k in hlow:
                    return i
        return None

    idx_cv   = col_idx("current version")
    idx_ttl  = col_idx("title", "document", "document name", "name")
    idx_sym  = col_idx("symbol", "doc symbol")
    idx_date = col_idx("entry into force", "publication date", "date of entry into force", "date")

    rows = []
    for tr in table.find_all("tr")[1:]:  # skip header
        cells = tr.find_all(["td","th"])
        if not cells: continue

        # pick link from Current version column, else any link in row
        link = None
        if idx_cv is not None and idx_cv < len(cells):
            link_tags = cells[idx_cv].find_all("a", href=True)
            if link_tags:
                link = english_link(link_tags)
        if link is None:
            link_tags = tr.find_all("a", href=True)
            if link_tags:
                link = english_link(link_tags)

        if link is None: 
            continue

        href = link.get("href","")
        if not href: continue
        if href.lower().endswith((".doc",".docx",".xls",".xlsx")):
            continue  # skip forms/files
        url = urljoin(BASE, href)

        title = best_title(cells, idx_ttl, link)
        if not title or _version_rx.match(title) or _bad_title_rx.match(title):
            # If still bad, skip the row (prevents "ver. 01.0" / "Instructions")
            continue

        symbol = clean(cells[idx_sym].get_text(" ")) if (idx_sym is not None and idx_sym < len(cells)) else ""
        date   = clean(cells[idx_date].get_text(" ")) if (idx_date is not None and idx_date < len(cells)) else ""

        sec_low = sec.lower()
        if "standard" in sec_low: typ = "Standard"
        elif "procedure" in sec_low: typ = "Procedure"
        elif "tool" in sec_low: typ = "Tool"
        elif "information note" in sec_low: typ = "Information note"
        elif "regular reports" in sec_low: typ = "Regular report"
        else: typ = ""

        rows.append({
            "title": title, "url": url, "symbol": symbol, "version": "", "date": date,
            "type": typ, "section": sec, "subsection": sub, "notes": ""
        })
    return rows

def parse_cma(soup):
    sec_title = "CMA related decisions and documents"
    h2 = soup.find(lambda t: t.name=="h2" and sec_title.lower() in t.get_text(" ").lower())
    if not h2: return []
    items = []
    cur_sub = ""
    for sib in h2.next_siblings:
        if getattr(sib, "name", None) == "h2": break
        if getattr(sib, "name", None) in ("h3","h4"):
            cur_sub = clean(sib.get_text(" ")); continue
        for a in getattr(sib, "find_all", lambda *a,**k: [])("a", href=True):
            txt = clean(a.get_text(" "))
            href = a.get("href","")
            if not href: continue
            if not ("/FCCC/PA/CMA/" in href or txt.startswith("FCCC/PA/CMA") or href.lower().endswith(".pdf")):
                continue
            url = urljoin(BASE, href)

            if "guidance" in cur_sub.lower() and ("2024/17/Add.1" in url or "2024/17/Add.1" in txt):
                items.append({
                    "title":"Decision 5/CMA.6 (Guidance on Article 6.4)", "url":url+"#5CMA6",
                    "symbol":"5/CMA.6","version":"","date":"2024","type":"CMA decision",
                    "section":sec_title,"subsection":"CMA guidance on Article 6.4","notes":""
                })
                items.append({
                    "title":"Decision 6/CMA.6 (Guidance on Article 6.4)", "url":url+"#6CMA6",
                    "symbol":"6/CMA.6","version":"","date":"2024","type":"CMA decision",
                    "section":sec_title,"subsection":"CMA guidance on Article 6.4","notes":""
                })
                continue

            if _bad_title_rx.match(txt) or _version_rx.match(txt):
                continue  # don't bring in junk CMA anchors
            items.append({
                "title": txt or "CMA document", "url": url, "symbol": "", "version":"", "date":"",
                "type": "CMA decision" if "guidance" in cur_sub.lower() else "CMA report",
                "section": sec_title, "subsection": cur_sub, "notes": ""
            })
    seen=set(); out=[]
    for r in items:
        k=(r["url"], r["title"].lower())
        if k in seen: continue
        seen.add(k); out.append(r)
    return out

def main():
    soup = BeautifulSoup(fetch(URL), "lxml")
    recs = []
    recs += parse_cma(soup)
    for tb in soup.find_all("table"):
        sec, sub = nearest_headings(tb)
        if "forms" in sec.lower() or "forms" in sub.lower(): continue
        if "cma related decisions and documents" in sec.lower(): continue
        recs += parse_current_table(tb)

    # De-duplicate by URL (full) — preserves CMA entries with #fragments
    dedup = {}
    for r in recs:
        url = r["url"]
        if url not in dedup:
            dedup[url] = r
        else:
            # prefer the entry whose title is longer (less likely to be generic)
            if len(r.get("title","")) > len(dedup[url].get("title","")):
                dedup[url] = r

    out = list(dedup.values())
    out.sort(key=lambda x: (x.get("section",""), x.get("subsection",""), x.get("symbol",""), x.get("title","")))

    import os
    os.makedirs("data", exist_ok=True)
    with open("data/a64_catalogue.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[scrape] wrote {len(out)} records to data/a64_catalogue.json")

if __name__ == "__main__":
    main()
