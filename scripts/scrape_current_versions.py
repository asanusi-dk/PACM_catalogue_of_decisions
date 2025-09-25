#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Regression-safe scraper for UNFCCC A6.4 catalogue:
- ENG-only, Current version only, ignore Forms
- Exclude A6.4-FORM-AC-014 / -013 / -002 instruction docs
- Robust title selection, symbol inference
- CMA decisions kept explicitly (Baku 5/6, Glasgow 3, Sharm 7)
- Dedupe only when BOTH full URL and title are identical (keeps distinct CMA rows)
"""
import json, re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE = "https://unfccc.int"
URL  = BASE + "/process-and-meetings/bodies/constituted-bodies/article-64-supervisory-body/rules-and-regulations"

S = requests.Session()
S.headers.update({"User-Agent": "PACM-catalogue/1.3 (+github actions)"})
TIMEOUT = 60

FORM_EXCLUDE_RE = re.compile(r'(A6\.4-?FORM-AC-(014|013|002))', re.I)
BAD_TITLE_RE    = re.compile(r'^(instructions?|english|click here|ver\.|version)\b', re.I)
VERSION_RE      = re.compile(r'^\s*(ver\.|version)\s*[.:]?\s*\d+(?:\.\d+)*\s*$', re.I)

A64_SYMBOL_RE   = re.compile(r'(A6\.4-[A-Z]+(?:-[A-Z]+)*-\d{3})', re.I)
UN_DOC_RE       = re.compile(r'(FCCC/PA/CMA/\d{4}/[\w./-]+)', re.I)
DECISION_CODE_RE= re.compile(r'(\d+/CMA\.\d)', re.I)

def fetch(url):
    r = S.get(url, timeout=TIMEOUT)
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

def best_title(cells, idx_title, link):
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

def infer_symbol(symbol_text, url, title):
    st = clean(symbol_text or "")
    if st and st not in {"-", "—", "N/A", "n/a"}:
        return st
    blob = " ".join([url or "", title or ""])
    m = A64_SYMBOL_RE.search(blob)
    if m: return m.group(1)
    m = UN_DOC_RE.search(blob)
    if m: return m.group(1)
    m = A64_SYMBOL_RE.search(title or "")
    if m: return m.group(1)
    return st

def clean_symbol_text(sym):
    s = clean(sym or "")
    m = A64_SYMBOL_RE.search(s) or UN_DOC_RE.search(s)
    if m: s = m.group(1)
    s = re.sub(r'\s*\(ENG\).*$', '', s, flags=re.I)
    s = s.replace("other language versions","").strip(" -–—")
    return s

def normalize_titles(record):
    t = record["title"]
    u = record["url"]
    t = re.sub(r',\s*decision', ', Decision', t, flags=re.I)

    if "2024/17/Add.1" in u:
        m = DECISION_CODE_RE.search(t + " " + u)
        if m: t = f"Baku, Decision {m.group(1)}"

    for city in ("Glasgow","Sharm el-Sheikh"):
        m = re.match(r'^\s*(' + re.escape(city) + r'),\s*Decision\s*(\d+/CMA\.\d).*$',
                     re.sub(r'\s+', ' ', t), flags=re.I)
        if m: t = f"{m.group(1)}, Decision {m.group(2)}"

    m = re.match(r'^\s*([^,]+),\s*decision\s*(\d+/CMA\.\d).*$',
                 record["title"], flags=re.I)
    if m and not any(city in t for city in ["Baku", "Glasgow", "Sharm el-Sheikh"]):
        t = f"{clean(m.group(1))}, Decision {m.group(2)}"

    t = re.sub(r'\s*\(\s*\d{1,2}\s+\w+\s*-\s*\d{1,2}\s+\w+\s+\d{4}\s*\)\s*$', '', t)

    if t.lower().startswith("article 6.4 sustainable development tool"):
        t = re.split(r'\bAccompanying forms:\b', t, flags=re.I)[0].rstrip(" *—-–— ")

    record["title"] = t
    record["symbol"] = clean_symbol_text(record.get("symbol",""))
    return record

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
    for tr in table.find_all("tr")[1:]:
        cells = tr.find_all(["td","th"])
        if not cells: continue

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
            continue
        url = urljoin(BASE, href)

        title = best_title(cells, idx_ttl, link)
        if not title or VERSION_RE.match(title) or BAD_TITLE_RE.match(title):
            continue

        sym_cell = clean(cells[idx_sym].get_text(" ")) if (idx_sym is not None and idx_sym < len(cells)) else ""
        symbol = infer_symbol(sym_cell, url, title)

        if FORM_EXCLUDE_RE.search(" ".join([title, symbol, url])):
            continue

        date   = clean(cells[idx_date].get_text(" ")) if (idx_date is not None and idx_date < len(cells)) else ""

        sec_low = sec.lower()
        if "standard" in sec_low: typ = "Standard"
        elif "procedure" in sec_low: typ = "Procedure"
        elif "tool" in sec_low: typ = "Tool"
        elif "information note" in sec_low: typ = "Information note"
        elif "regular reports" in sec_low: typ = "Regular report"
        else: typ = ""

        rows.append(normalize_titles({
            "title": title, "url": url, "symbol": symbol, "version": "", "date": date,
            "type": typ, "section": sec, "subsection": sub, "notes": ""
        }))
    return rows

def parse_cma(soup):
    sec_title = "CMA related decisions and documents"
    h2 = soup.find(lambda t: t.name=="h2" and "cma related" in t.get_text(" ").lower())
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
                items.append(normalize_titles({
                    "title":"Baku, Decision 5/CMA.6", "url":url+"#5CMA6",
                    "symbol":"5/CMA.6","version":"","date":"2024","type":"CMA decision",
                    "section":sec_title,"subsection":"CMA guidance on Article 6.4","notes":""
                }))
                items.append(normalize_titles({
                    "title":"Baku, Decision 6/CMA.6", "url":url+"#6CMA6",
                    "symbol":"6/CMA.6","version":"","date":"2024","type":"CMA decision",
                    "section":sec_title,"subsection":"CMA guidance on Article 6.4","notes":""
                }))
                continue

            symbol = ""
            m = UN_DOC_RE.search(url + " " + txt)
            if m: symbol = m.group(1)

            items.append(normalize_titles({
                "title": txt or "CMA document", "url": url, "symbol": symbol, "version":"", "date":"",
                "type": "CMA decision" if "guidance" in cur_sub.lower() else "CMA report",
                "section": sec_title, "subsection": cur_sub, "notes": ""
            }))
    # Only collapse exact duplicates (same URL AND same title)
    seen=set(); out=[]
    for r in items:
        k=(r["url"], r["title"])
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

    # Dedupe very conservatively: same full URL AND same title
    seen=set(); out=[]
    for r in recs:
        k=(r["url"], r["title"])
        if k in seen: continue
        seen.add(k); out.append(r)

    out.sort(key=lambda x: (x.get("section",""), x.get("subsection",""), x.get("symbol",""), x.get("title","")))

    import os
    os.makedirs("data", exist_ok=True)
    with open("data/a64_catalogue.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[scrape] wrote {len(out)} records to data/a64_catalogue.json")

if __name__ == "__main__":
    main()
