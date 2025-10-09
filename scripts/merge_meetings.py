# scripts/merge_meetings.py
import json, pathlib
DATA = pathlib.Path("data")
CAT  = DATA / "a64_catalogue.json"
MEET = DATA / "meetings.json"

def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def normalize_symbol(s):
    return s.strip().replace("–","-").replace("—","-").upper() if s else s

def key_order(d):
    order = ["title","url","symbol","version","date","section","notes"]
    return {**{k:d[k] for k in order if k in d}, **{k:v for k,v in d.items() if k not in order}}

def merge_records(catalog, meetings):
    by_url = {d.get("url"): d for d in catalog if d.get("url")}
    by_sig = {d.get("symbol"): d for d in catalog if d.get("symbol")}
    clean = []
    for m in meetings:
        m = dict(m)
        m["symbol"] = normalize_symbol(m.get("symbol",""))
        m["section"] = "Meeting reports of the Supervisory Body"
        m.pop("subsection", None)
        clean.append(m)

    next_cat = []
    seen = set()
    for row in catalog:
        rep = None
        if row.get("url") in by_url:
            rep = next((m for m in clean if m.get("url")==row.get("url")), None)
        elif row.get("symbol") in by_sig:
            rep = next((m for m in clean if m.get("symbol")==row.get("symbol")), None)
        if rep:
            seen.add(rep.get("url"))
            if row.get("notes") and not rep.get("notes"):
                rep["notes"] = row["notes"]
            merged = {**row, **rep}
            merged.pop("subsection", None)
            next_cat.append(key_order(merged))
        else:
            next_cat.append(row)

    for m in clean:
        if m.get("url") not in seen and m.get("symbol") not in by_sig:
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
