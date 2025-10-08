# scripts/merge_meetings.py
import json, pathlib, re

DATA = pathlib.Path("data")
CAT  = DATA / "a64_catalogue.json"
MEET = DATA / "meetings.json"

def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def normalize_symbol(s):
    if not s: return s
    s = s.strip().replace("–","-").replace("—","-")
    s = s.upper()
    return s

def derive_subsection(symbol):
    if symbol and "SBM" in symbol.upper():
        return "SBM"
    return "SB"

def default_title(symbol, existing_title=""):
    if existing_title: return existing_title
    return f"{symbol} — Meeting report"

def to_pdf_url(u):
    if isinstance(u, str) and u.lower().endswith(".pdf"):
        return u
    return u

def key_order(d):
    order = ["title","url","symbol","version","date","section","subsection","notes"]
    return {**{k:d[k] for k in order if k in d}, **{k:v for k,v in d.items() if k not in order}}

def merge_records(catalog, meetings):
    by_url   = {d.get("url"): d for d in catalog if d.get("url")}
    by_sig   = {(d.get("symbol"), d.get("title")): d for d in catalog if d.get("symbol") and d.get("title")}
    by_title = {d.get("title"): d for d in catalog if d.get("title")}

    def find_old(n):
        if n.get("url") and n["url"] in by_url: return by_url[n["url"]]
        key = (n.get("symbol"), n.get("title"))
        if key in by_sig: return by_sig[key]
        return by_title.get(n.get("title"))

    clean_meet = []
    for m in meetings:
        m = dict(m)
        m["url"] = to_pdf_url(m.get("url",""))
        m["symbol"] = normalize_symbol(m.get("symbol",""))
        m["title"] = default_title(m.get("symbol",""), m.get("title"))
        m["section"] = "Meeting reports of the Supervisory Body"
        m["subsection"] = m.get("subsection") or derive_subsection(m.get("symbol",""))
        clean_meet.append(m)

    next_cat = []
    used_urls = set()
    for d in catalog:
        rep = next((m for m in clean_meet if m.get("url")==d.get("url")), None)
        if rep:
            used_urls.add(rep["url"])
            if d.get("notes") and not rep.get("notes"):
                rep["notes"] = d["notes"]
            next_cat.append(key_order({**d, **rep}))
        else:
            next_cat.append(d)

    for m in clean_meet:
        if m.get("url") not in used_urls:
            old = find_old(m)
            if old and old.get("notes") and not m.get("notes"):
                m["notes"] = old["notes"]
            next_cat.append(key_order(m))

    return next_cat

def main():
    cat  = load_json(CAT, [])
    meet = load_json(MEET, [])
    merged = merge_records(cat, meet)
    save_json(CAT, merged)
    print(f"Merged {len(meet)} meeting reports into catalogue ({len(merged)} total rows).")

if __name__ == "__main__":
    main()
