#!/usr/bin/env python3
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

def clean_space(s):
    return " ".join((s or "").split())

def nearest_heading_text(el):
    sec = sub = ""
    for prev in el.find_all_previous(["h2","h3","h4"]):
        tag = prev.name.lower()
        txt = " ".join(prev.get_text(" ", strip=True).split())
        if tag == "h2" and not sec:
            sec = txt
        elif tag in ("h3","h4") and not sub:
            sub = txt
        if sec and sub:
            break
    return sec, sub

def parse_current_version_table(table):
    head = [clean_space(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
    if not any("current version" in h for h in head):
        return []
    rows = []
    for tr in table.find_all("tr"):
        tds = tr.find_all(["td","th"])
        if len(tds) < 3:
            continue
        cells = [clean_space(td.get_text(" ", strip=True)) for td in tds]
        # link to current version
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

        # title
        try:
            idx_title = next(i for i,h in enumerate(head) if h.startswith("title"))
            title = clean_space(tds[idx_title].get_text(" ", strip=True))
        except StopIteration:
            title = ""

        # symbol number
        symbol = ""
        try:
            idx_sym = next(i for i,h in enumerate(head) if "symbol" in h)
            symbol = clean_space(tds[idx_sym].get_text(" ", strip=True))
        except StopIteration:
            pass

        # entry into force / publication date
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
            "type": "",        # to be filled from headings
            "category": "",    # to be filled from headings
            "notes": "",
            "is_current": True,
            "source_section": "Rules & Regulations (Current versions)"
        })
    return rows

def parse_cma_table(table):
    # This table lives under heading "CMA related decisions and documents"
    # Its headers do NOT include "Current version"; typically includes Title and Symbol columns.
    head = [clean_space(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
    if any("current version" in h for h in head):
        return []
    # Must at least have "title" and "symbol" or a link column
    if not any("title" in h for h in head):
        return []
    rows = []
    for tr in table.find_all("tr"):
        tds = tr.find_all(["td","th"])
        if len(tds) < 2:
            continue
        cells = [clean_space(td.get_text(" ", strip=True)) for td in tds]
        # map columns loosely
        title = ""
        symbol = ""
        link = None
        date = ""
        # title + link (prefer link from title cell)
        try:
            idx_title = next(i for i,h in enumerate(head) if h.startswith("title"))
            title_td = tds[idx_title]
            title = clean_space(title_td.get_text(" ", strip=True))
            a = title_td.find("a", href=True)
            if a:
                link = urljoin(RULES_URL, a["href"])
        except StopIteration:
            pass
        # symbol
        try:
            idx_sym = next(i for i,h in enumerate(head) if "symbol" in h)
            symbol = clean_space(tds[idx_sym].get_text(" ", strip=True))
        except StopIteration:
            pass
        # if no link yet, look for any link in the row
        if not link:
            a2 = tr.find("a", href=True)
            if a2:
                link = urljoin(RULES_URL, a2["href"])

        if not title and not link:
            continue

        rows.append({
            "title": title or symbol or "CMA document",
            "version": "",  # CMA docs are static
            "symbol": symbol,
            "date": date,
            "url": link or "",
            "type": "CMA decision",
            "category": "CMA",
            "notes": "",
            "is_current": False,
            "source_section": "CMA related decisions and documents"
        })
    return rows

def merge(old, new):
    by_url = {r.get("url"): r for r in old if r.get("url")}
    for r in new:
        if r["url"] in by_url:
            cur = by_url[r["url"]]
            for k,v in r.items():
                if not cur.get(k) and v not in (None, ""):
                    cur[k] = v
        else:
            by_url[r["url"]] = r
    return list(by_url.values())

def main():
    html = fetch(RULES_URL)
    soup = BeautifulSoup(html, "lxml")

    records = []
    # Parse all tables; classify by nearest headings
    for tb in soup.find_all("table"):
        sec, sub = nearest_heading_text(tb)
        sec_l = (sec or "").lower()
        # CMA table: under h2/h3 that contains "cma related decisions"
        if "cma related decisions" in sec_l or "cma related documents" in sec_l:
            cma_rows = parse_cma_table(tb)
            if cma_rows:
                records.extend(cma_rows)
                continue
        # Current version tables
        rows = parse_current_version_table(tb)
        if rows:
            # set types/categories from headings
            for r in rows:
                if "standard" in sec_l:
                    r["type"] = "Standard"
                elif "procedure" in sec_l:
                    r["type"] = "Procedure"
                elif "tool" in sec_l:
                    r["type"] = "Tool"
                elif "information" in sec_l:
                    r["type"] = "Information note"
                elif "form" in sec_l:
                    r["type"] = "Form"
                elif "report" in sec_l:
                    r["type"] = "Report"
                # category
                sub_l = (sub or "").lower()
                if "methodolog" in sub_l:
                    r["category"] = "Methodologies"
                elif any(k in sub_l for k in ["activity","registration","issuance","renewal","validation","verification","programmes"]):
                    r["category"] = "Activity Cycle"
                elif "accredit" in sub_l:
                    r["category"] = "Accreditation"
                elif "govern" in sub_l:
                    r["category"] = "Governance"
                elif any(k in sub_l for k in ["removal","reversal","non-perman"]):
                    r["category"] = "Removals"
                elif "transition" in sub_l:
                    r["category"] = "Transition"
                else:
                    r["category"] = sub or r.get("category") or ""
            records.extend(rows)

    # Merge with existing file to preserve manual notes
    try:
        with open(OUT_JSON, "r", encoding="utf-8") as f:
            old = json.load(f)
    except Exception:
        old = []

    merged = merge(old, records)
    # Tidy
    for r in merged:
        for k in list(r.keys()):
            if isinstance(r[k], str):
                r[k] = r[k].strip()
        r.setdefault("notes","")
        r.setdefault("type","")
        r.setdefault("category","")

    merged.sort(key=lambda x: (x.get("type",""), x.get("category",""), x.get("symbol",""), x.get("title","").lower()))
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print(f"[done] wrote {OUT_JSON} with {len(merged)} records (current + CMA).")

if __name__ == "__main__":
    main()
