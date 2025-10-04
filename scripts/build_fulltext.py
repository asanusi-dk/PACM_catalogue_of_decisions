#!/usr/bin/env python3
import json, os, sys, subprocess, tempfile, urllib.request, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CATALOG = DATA / 'a64_catalogue.json'
OUT = DATA / 'search_index.json'

def is_pdf_url(u: str) -> bool:
    return u.lower().split('?')[0].endswith('.pdf')

def fetch(url: str, dest: pathlib.Path, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                dest.write_bytes(r.read())
            return True
        except Exception as e:
            time.sleep(2*(i+1))
    return False

def pdf_to_text(pdf_path: pathlib.Path) -> str:
    txt_path = pdf_path.with_suffix('.txt')
    try:
        subprocess.run(['pdftotext','-layout','-nopgbrk', str(pdf_path), str(txt_path)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return txt_path.read_text(errors='ignore')
    except Exception as e:
        return ""

def main():
    if not CATALOG.exists():
        print(f"ERROR: {CATALOG} not found", file=sys.stderr)
        sys.exit(1)
    docs = json.loads(CATALOG.read_text())
    out = []
    tmpdir = pathlib.Path(tempfile.mkdtemp())
    for d in docs:
        url = d.get('url','')
        if not url or not is_pdf_url(url):
            continue
        title = d.get('title','') or '(untitled)'
        symbol = d.get('symbol','')
        section = d.get('section','')
        subsection = d.get('subsection','')
        pdf_path = tmpdir / 'doc.pdf'
        ok = fetch(url, pdf_path)
        if not ok:
            continue
        text = pdf_to_text(pdf_path)
        if not text.strip():
            continue
        out.append({
            'url': url, 'title': title, 'symbol': symbol,
            'section': section, 'subsection': subsection,
            'text': text
        })
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"Wrote {len(out)} records to {OUT}")

if __name__ == '__main__':
    main()
