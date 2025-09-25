#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scrape UNFCCC A6.4 Rules & Regulations (ENG, Current version only; ignore Forms).
- Precisely targets the "Current version" column per table header.
- Captures exact H2/H3/H4 headings (section/subsection).
- CMA section handled separately to ensure 5/CMA.6 and 6/CMA.6 both appear.
"""
import json, re, sys, os
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
    # Prefer links labeled (ENG) or "English" if present; else first href
    eng = [a for a in a_tags if "eng" in (a.get_text(" ") or "").lower() or "english" in (a.get_text(" ") or "").lower()]
    if eng: return eng[0]
    return a_tags[0] if a_tags else None

def parse_current_table(table):
    sec, sub = nearest_headings(table)
    if "forms" in sec.lower() or "forms" in sub.lower():  # ignore Forms
        return []

    # Build header map
    header_cells = table.find("tr")
    if not header_cells: return []
    headers = [clean(th.get_text(" ")) for th in header_cells.find_all(["th","td"])]
    # Find column indices
    def col_idx(*keys):
        keys = [k.lower() for k in keys]
        for i, h in enumerate(headers):
            hlow = h.lower()
            for k in keys:
                if k in hlow:
                    return i
        return -1

    idx_cv   = col_idx("current version")
    idx_ttl  = col_idx("title", "document")
    idx_sym  = col_idx("symbol", "doc symbol")
    idx_date = col_idx("entry into force", "publication date", "date of entry into force")

    rows = []
    for tr in table.find_all("tr")[1:]:  # skip header row
        tds = tr.find_all(["td","th"])
        if not tds: continue
        # If we have a proper Current version column, only look there
        link = None
        if idx_cv != -1 and idx_cv < len(tds):
            link_tags = tds[idx_cv].find_all("a", href=True)
            if link_tags:
                link = english_link(link_tags)
        else:
            # Fallback for odd tables: take first link in row
            link_tags = tr.find_all("a", href=True)
            if link_tags:
                link = english_link(link_tags)
        if not link: 
            continue

        href = link.get("href","")
        if not href: continue
        if href.lower().endswith((".doc",".docx",".xls",".xlsx")):  # skip forms
            continue
        url = urljoin(BASE, href)

        title = ""
        if idx_ttl != -1 and idx_ttl < len(tds):
            title = clean(tds[idx_ttl].get_text(" "))
        if not title:
            title = clean(link.get_text(" "))

        symbol = ""
        if idx_sym != -1 and idx_sym < len(tds):
            symbol = clean(tds[idx_sym].get_text(" "))

        date = ""
        if idx_date != -1 and idx_date < len(tds):
            date = clean(tds[idx_date].get_text(" "))

        # Deduce type from section name
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
            cur_sub = clean(sib.get_text(" "))
            continue
        for a in getattr(sib, "find_all", lambda *a,**k: [])("a", href=True):
            txt = clean(a.get_text(" "))
            href = a.get("href","")
            if not href: continue
            # Only accept UN doc refs or PDFs
            if not ("/FCCC/PA/CMA/" in href or txt.startswith("FCCC/PA/CMA") or href.lower().endswith(".pdf")):
                continue
            url = urljoin(BASE, href)

            # Special handling: Add two rows for 5/CMA.6 and 6/CMA.6 (same Add.1)
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

            items.append({
                "title": txt or "CMA document",
                "url": url,
                "symbol": "", "version":"", "date":"",
                "type": "CMA decision" if "guidance" in cur_sub.lower() else "CMA report",
                "section": sec_title, "subsection": cur_sub, "notes": ""
            })
    # de-dupe same (title,url)
    seen=set(); out=[]
    for r in items:
        k=(r["title"], r["url"])
        if k in seen: continue
        seen.add(k); out.append(r)
    return out

def main():
    html = fetch(URL)
    soup = BeautifulSoup(html, "lxml")

    recs = []
    # CMA
    recs += parse_cma(soup)

    # Tables: current-version only
    for tb in soup.find_all("table"):
        sec, sub = nearest_headings(tb)
        if "forms" in sec.lower() or "forms" in sub.lower():
            continue
        if "cma related decisions and documents" in sec.lower():
            continue  # handled above
        recs += parse_current_table(tb)

    # Write
    os.makedirs("data", exist_ok=True)
    with open("data/a64_catalogue.json","w",encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, indent=2)
    print(f"[scrape] wrote {len(recs)} records to data/a64_catalogue.json")

if __name__ == "__main__":
    main()
