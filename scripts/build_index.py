#!/usr/bin/env python3
"""
Builds a simple full‑text index from the PDFs listed in data/a64_catalogue.json.
Requirements on GitHub Actions runner:
  - poppler-utils (for 'pdftotext')
Steps:
  1) Read data/a64_catalogue.json
  2) Download each PDF (skipping if 404)
  3) Extract text with pdftotext
  4) Normalize & truncate to keep index small
  5) Write search_index.json (array of {url, title, text})
"""

import json, os, subprocess, tempfile, urllib.request, sys, re

DATA_JSON = "data/a64_catalogue.json"
OUT_JSON = "search_index.json"
MAX_CHARS = 200000  # cap per doc to keep index size reasonable

def fetch(url, dest):
  try:
    with urllib.request.urlopen(url) as r, open(dest, "wb") as f:
      f.write(r.read())
    return True
  except Exception as e:
    print(f"[warn] failed to download {url}: {e}", file=sys.stderr)
    return False

def pdf_to_text(pdf_path):
  txt_path = pdf_path + ".txt"
  try:
    subprocess.check_call(["pdftotext", "-layout", pdf_path, txt_path])
    with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
      return f.read()
  except Exception as e:
    print(f"[warn] pdftotext failed on {pdf_path}: {e}", file=sys.stderr)
    return ""

def clean_text(s):
  # collapse whitespace and strip control chars
  s = re.sub(r"[ \t\r\f\v]+", " ", s)
  s = re.sub(r"\n+", " ", s)
  s = s.strip()
  return s

def main():
  with open(DATA_JSON, "r", encoding="utf-8") as f:
    docs = json.load(f)

  out = []
  with tempfile.TemporaryDirectory() as tmp:
    for d in docs:
      url = d.get("url")
      title = d.get("title","")
      if not url: 
        continue
      pdf_path = os.path.join(tmp, "doc.pdf")
      ok = fetch(url, pdf_path)
      if not ok:
        continue
      text = pdf_to_text(pdf_path)
      if not text:
        continue
      text = clean_text(text)[:MAX_CHARS]
      out.append({"url": url, "title": title, "text": text})
      print(f"[ok] indexed: {title[:80]}")

  with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

  print(f"[done] wrote {OUT_JSON} with {len(out)} documents.")

if __name__ == "__main__":
  main()
