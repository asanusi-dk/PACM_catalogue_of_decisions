#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, json, re
import requests
from io import BytesIO
from pdfminer.high_level import extract_text
from pdfminer.pdfparser import PDFSyntaxError

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "PACM-indexer/1.0 (+github action)"})

def is_pdf_url(u):
    u = u.lower()
    return u.endswith(".pdf") or "/FCCC/" in u

def fetch_pdf_text(url):
    try:
        r = SESSION.get(url, timeout=60)
        r.raise_for_status()
        data = r.content
        return extract_text(BytesIO(data))
    except Exception:
        return ""

def main():
    with open("data/a64_catalogue.json","r",encoding="utf-8") as f:
        docs = json.load(f)

    by_url = {}
    for d in docs:
        u = d.get("url","")
        if not is_pdf_url(u): 
            continue
        if u not in by_url:
            by_url[u] = {"url": u, "title": d.get("title",""), "text": ""}

    for i, (u, rec) in enumerate(by_url.items(), 1):
        print(f"[{i}/{len(by_url)}] {u}")
        rec["text"] = fetch_pdf_text(u)

    out = [{"url": v["url"], "title": v["title"], "text": v["text"]} for v in by_url.values()]
    with open("search_index.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

    print(f"Wrote {len(out)} docs to search_index.json")

if __name__ == "__main__":
    main()
