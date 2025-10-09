# scripts/cleanup_meeting_subsections.py
import json, pathlib
DATA = pathlib.Path("data")
CAT  = DATA / "a64_catalogue.json"
def load_json(p, default): return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default
def save_json(p, data): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
def main():
    cat = load_json(CAT, []); changed=0
    for row in cat:
        if (row.get("section") or "").strip() == "Meeting reports of the Supervisory Body":
            if "subsection" in row: row.pop("subsection", None); changed+=1
    save_json(CAT, cat); print(f"Removed subsection from {changed} meeting report rows. Total rows: {len(cat)}.")
if __name__ == "__main__": main()
