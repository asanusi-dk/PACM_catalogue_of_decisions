#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scrape UNFCCC A6.4 Rules & Regulations (ENG, Current version only; ignore Forms).
Extra filter (per user request): exclude any row related to
  A6.4-FORM-AC-014, A6.4-FORM-AC-013, A6.4-FORM-AC-002
even if they are PDFs and not under the Forms section.
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

# Match any of the three form codes anywhere (title, symbol, URL)
FORM_EXCLUDE_RE = re.compile(r'(A6\.4-?FORM-AC-(014|013|002))', re.I)
BAD_TITLE_RE = re.compile(r'^(instructions?|english|click here|ver\.|version)\b', re.I)
VERSION_RE   = re.compile(r'^\s*(ver\.|version)\s*[.:]?\s*\d+(?:\.\d+)*\s*$', re.I)

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

def best_title(cells, idx_title, link):
    # Prefer Title/Document column, then first meaningful cell, then link text
    title = ""
    if idx_title is not None and 0 <= idx_title < len(cells):
        title = clean(cells[idx_title].get_text(" "))
    if not title or VERSION_RE.match(title) or BAD_TITLE_RE.match(title):
        for td in cells:
            t = clean(td.get_text(" "))
            if t and not VERSION_RE.match(t) and not BAD_TITLE_RE.match(t):
                title = t; break
    if (not title or VERSION_RE.match(title) or BAD_TITLE_RE.match(title)) and link is not None:
        t = clean(link.get_text(" "))
        if t and not VERSION_RE.match(t) and not BAD_TITLE_RE.match(t):
            title = t
    return title

def should_exclude_form(title, symbol, url):
    blob = " ".join([title or "", symbol or "", url or ""])
    return bool(FORM_EXCLUDE_RE.search(blob))

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
        # skip obvious office docs
        if href.lower().endswith((".doc",".docx",".xls",".xlsx")):
            continue
        url = urljoin(BASE, href)

        title = best_title(cells, idx_ttl, link)
        if not title or VERSION_RE.match(title) or BAD_TITLE_RE.match(title):
            continue

        symbol = clean(cells[idx_sym].get_text(" ")) if (idx_sym is not None and idx_sym < len(cells)) else ""
        date   = clean(cells[idx_date].get_text(" ")) if (idx_date is not None and idx_date < len(cells)) else ""

        # NEW: exclude specific form-instruction docs even if PDFs
        if should_exclude_form(title, symbol, url):
            continue

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
            # Exclusion does not apply here (CMA decisions/reports are not forms)

            # special handling for 2024 Add.1 – split 5/CMA.6 and 6/CMA.6
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

            if BAD_TITLE_RE.match(txt) or VERSION_RE.match(txt):
                continue
            items.append({
                "title": txt or "CMA document", "url": url, "symbol": "", "version":"", "date":"",
                "type": "CMA decision" if "guidance" in cur_sub.lower() else "CMA report",
                "section": sec_title, "subsection": cur_sub, "notes": ""
            })
    # de-dupe
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

    # De-duplicate by full URL (keeps CMA #fragments as separate items)
    dedup = {}
    for r in recs:
        u = r["url"]
        if u not in dedup:
            dedup[u] = r
        else:
            if len(r.get("title","")) > len(dedup[u].get("title","")):
                dedup[u] = r

    out = list(dedup.values())
    out.sort(key=lambda x: (x.get("section",""), x.get("subsection",""), x.get("symbol",""), x.get("title","")))

    import os
    os.makedirs("data", exist_ok=True)
    with open("data/a64_catalogue.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[scrape] wrote {len(out)} records to data/a64_catalogue.json")

if __name__ == "__main__":
    main()
