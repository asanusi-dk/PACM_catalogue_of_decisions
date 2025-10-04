#!/usr/bin/env python3
"""
Builds a full-text search index for the PACM site, with OCR fallback.

Reads:  data/a64_catalogue.json        (list of documents with url, title, symbol, section, subsection)
Writes: data/search_index.json         (array of {url,title,symbol,section,subsection,text})

Baseline: use pdftotext.
If pdftotext returns little/no text, try OCR using ocrmypdf (Tesseract) then pdftotext again.

Requirements on runner:
- poppler-utils (pdftotext)
- ocrmypdf (which pulls tesseract-ocr)
"""
import json, os, sys, subprocess, tempfile, urllib.request, pathlib, time, shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CATALOG = DATA / 'a64_catalogue.json'
OUT = DATA / 'search_index.json'

TIMEOUT_FETCH = 90
MIN_TEXT_CHARS = 200
OCR_LANG = os.environ.get("PACM_OCR_LANG", "eng")

def is_pdf_url(u: str) -> bool:
    return u.lower().split('?')[0].endswith('.pdf')

def fetch(url: str, dest: pathlib.Path, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_FETCH) as r:
                dest.write_bytes(r.read())
            return True
        except Exception as e:
            time.sleep(2*(i+1))
    return False

def have_cmd(cmd: str) -> bool:
    return shutil.which(cmd) is not None

def run_pdftotext(pdf_path: pathlib.Path, txt_path: pathlib.Path) -> str:
    try:
        subprocess.run(
            ["pdftotext", "-layout", "-nopgbrk", str(pdf_path), str(txt_path)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return txt_path.read_text(errors="ignore")
    except Exception:
        return ""

def run_ocr(input_pdf: pathlib.Path, output_pdf: pathlib.Path) -> bool:
    if not have_cmd("ocrmypdf"):
        return False
    try:
        subprocess.run(
            ["ocrmypdf", "--force-ocr", "--language", OCR_LANG, "--optimize", "1",
             "--jobs", "2", "--quiet", str(input_pdf), str(output_pdf)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return output_pdf.exists() and output_pdf.stat().st_size > 0
    except Exception:
        return False

def index_pdf(url: str, meta: dict, tmpdir: pathlib.Path):
    pdf_path = tmpdir / "doc.pdf"
    txt_path = tmpdir / "doc.txt"
    ok = fetch(url, pdf_path)
    if not ok:
        return None

    text = run_pdftotext(pdf_path, txt_path)
    if len(text.strip()) < MIN_TEXT_CHARS and have_cmd("ocrmypdf"):
        ocr_pdf = tmpdir / "doc_ocr.pdf"
        if run_ocr(pdf_path, ocr_pdf):
            text = run_pdftotext(ocr_pdf, txt_path)

    if not text.strip():
        return None

    return {
        "url": url,
        "title": meta.get("title") or "(untitled)",
        "symbol": meta.get("symbol", ""),
        "section": meta.get("section", ""),
        "subsection": meta.get("subsection", ""),
        "text": text,
    }

def main():
    if not CATALOG.exists():
        print(f"ERROR: {CATALOG} not found", file=sys.stderr)
        sys.exit(1)

    docs = json.loads(CATALOG.read_text())
    out = []
    tmpdir = pathlib.Path(tempfile.mkdtemp())
    try:
        for d in docs:
            url = d.get("url", "")
            if not url or not is_pdf_url(url):
                continue
            rec = index_pdf(url, d, tmpdir)
            if rec:
                out.append(rec)
    finally:
        pass

    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"Wrote {len(out)} records to {OUT}")

if __name__ == "__main__":
    main()
