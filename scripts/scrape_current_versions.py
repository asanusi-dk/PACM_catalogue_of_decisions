#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scrape the UNFCCC A6.4 Rules & Regulations page and produce data/a64_catalogue.json.
Rules:
- Use only "Current version" (or the main link for CMA/CMA reports).
- Ignore everything under any "Forms" section.
- Prefer English links where multiple languages are listed.
- Capture section (H2) and subsection (H3/H4) labels exactly.
- Create separate rows for CMA decisions 5/CMA.6 and 6/CMA.6 even if they share a PDF.
"""
import re, json, sys, os, time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE = "https://unfccc.int"
URL = BASE + "/process-and-meetings/bodies/constituted-bodies/article-64-supervisory-body/rules-and-regulations"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "PACM-catalogue-bot/1.0 (+github action)"})
TIMEOUT = 30

def fetch(url):
    r = SESSION.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text

def clean(s):
    if s is None: return ""
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def parse_symbol(text):
    # Try to locate A6.4-* or FCCC/PA/CMA references
    m = re.search(r'(A6\.4-[A-Z/-]+-\d{3,}|\bFCCC/PA/CMA/\d{4}/[\w./-]+)', text, flags=re.I)
    return m.group(1) if m else ""

def only_english_link(a):
    # Prefer links labeled (ENG) or English; otherwise take the link itself
    t = (a.get_text(" ") or "").lower()
    href = a.get("href") or ""
    if "(eng)" in t or "english" in t:
        return href
    return href

def heading_hierarchy_for(node):
    # Find nearest h2, then between nearest h3/h4 after that
    sec = sub = ""
    # nearest h2 above
    h2 = node.find_previous('h2')
    if h2: sec = clean(h2.get_text(" "))
    # then nearest h3/h4 above
    h3 = node.find_previous(['h3','h4'])
    if h3 and (not h2 or getattr(h3, 'sourceline', 0) > getattr(h2, 'sourceline', 0)):
        sub = clean(h3.get_text(" "))
    return sec, sub

def table_rows_to_records(table):
    recs = []
    sec, sub = heading_hierarchy_for(table)
    # skip any table under Forms
    if "forms" in (sec or "").lower() or "forms" in (sub or "").lower():
        return recs

    for tr in table.select("tr"):
        links = tr.select("a")
        if not links: 
            continue

        def is_current(a):
            txt = (a.get_text(" ") or "").strip().lower()
            href = a.get("href") or ""
            if "click here" in txt: return False
            if href.lower().endswith((".doc",".docx",".xls",".xlsx")): return False
            if "other language versions" in txt: return False
            if "(word)" in txt.lower() or "(excel)" in txt.lower(): return False
            return True

        candidates = [a for a in links if is_current(a)]
        if not candidates: 
            continue

        a = candidates[0]
        href = only_english_link(a)
        url = urljoin(BASE, href)

        # Extract row text blocks for meta
        tds = [clean(td.get_text(" ")) for td in tr.find_all(["td","th"])]
        rowtxt = " | ".join(tds)
        title = clean(a.get_text(" "))
        if not title or title.lower().startswith("ver"):
            if tds: title = tds[0]

        symbol = parse_symbol(rowtxt + " " + url)
        version = ""
        ver_m = re.search(r'ver\.?\s*([0-9.]+)', rowtxt, flags=re.I)
        if ver_m:
            version = ver_m.group(1)
        date = ""
        date_m = re.search(r'(\d{1,2}\s\w+\s\d{4}|\d{1,2}\s\w+\.?\s\d{4}|[0-9]{1,2}\s\w+\.\s[0-9]{4}|[0-9]{1,2}\s\w+\s?[0-9]{4})', rowtxt)
        if date_m:
            date = date_m.group(1)

        sec_norm = (sec or "").lower()
        if "standard" in sec_norm: typ = "Standard"
        elif "procedure" in sec_norm: typ = "Procedure"
        elif "tool" in sec_norm: typ = "Tool"
        elif "information note" in sec_norm: typ = "Information note"
        elif "regular reports" in sec_norm: typ = "Regular report"
        else: typ = ""

        recs.append({
            "title": title,
            "url": url,
            "symbol": symbol,
            "version": version,
            "date": date,
            "type": typ,
            "section": sec,
            "subsection": sub,
            "notes": ""
        })
    return recs

def cma_blocks(soup):
    recs = []
    h2 = soup.find(lambda t: t.name in ['h2'] and "CMA related decisions and documents" in t.get_text())
    if not h2: 
        return recs

    section_nodes = []
    for sib in h2.next_siblings:
        if getattr(sib, "name", None) == "h2": break
        section_nodes.append(sib)

    cur_sub = ""
    for node in section_nodes:
        if getattr(node, "name", None) in ["h3","h4"]:
            cur_sub = clean(node.get_text(" "))
            continue
        for a in getattr(node, "select", lambda x: [])("a"):
            href = a.get("href") or ""
            text = clean(a.get_text(" "))
            if not href: 
                continue
            if not ("/FCCC/PA/CMA/" in href or text.startswith("FCCC/PA/CMA") or href.lower().endswith(".pdf")):
                continue
            url = urljoin(BASE, href)
            symbol = parse_symbol(text + " " + url)
            title = text or symbol or "CMA document"

            # Special: 2024 Add.1 hosting both 5/CMA.6 and 6/CMA.6
            if "CMA guidance" in cur_sub:
                if "2024/17/Add.1" in url or "2024/17/Add.1" in symbol:
                    recs.append({
                        "title": "Decision 5/CMA.6 (Guidance on Article 6.4)",
                        "url": url + "#5CMA6",
                        "symbol": "5/CMA.6",
                        "version": "",
                        "date": "2024",
                        "type": "CMA decision",
                        "section": "CMA related decisions and documents",
                        "subsection": "CMA guidance on Article 6.4",
                        "notes": ""
                    })
                    recs.append({
                        "title": "Decision 6/CMA.6 (Guidance on Article 6.4)",
                        "url": url + "#6CMA6",
                        "symbol": "6/CMA.6",
                        "version": "",
                        "date": "2024",
                        "type": "CMA decision",
                        "section": "CMA related decisions and documents",
                        "subsection": "CMA guidance on Article 6.4",
                        "notes": ""
                    })
                    continue

            recs.append({
                "title": title,
                "url": url,
                "symbol": symbol,
                "version": "",
                "date": "",
                "type": "CMA decision" if "guidance" in cur_sub.lower() else "CMA report",
                "section": "CMA related decisions and documents",
                "subsection": cur_sub,
                "notes": ""
            })
    out = []
    seen = set()
    for r in recs:
        key = (r["title"], r["url"])
        if key in seen: 
            continue
        seen.add(key)
        out.append(r)
    return out

def main():
    html = fetch(URL)
    soup = BeautifulSoup(html, "lxml")

    records = []
    records.extend(cma_blocks(soup))

    for table in soup.find_all("table"):
        sec, sub = heading_hierarchy_for(table)
        if "forms" in (sec or "").lower() or "forms" in (sub or "").lower():
            continue
        if "CMA related decisions and documents".lower() in (sec or "").lower():
            continue
        records.extend(table_rows_to_records(table))

    for r in records:
        r["title"] = clean(r["title"])
        r["section"] = clean(r["section"])
        r["subsection"] = clean(r["subsection"])

    os.makedirs("data", exist_ok=True)
    with open("data/a64_catalogue.json","w",encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(records)} records to data/a64_catalogue.json")

if __name__ == "__main__":
    main()
