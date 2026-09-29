import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
meta_text = (ROOT / "data" / "produce-meta.js").read_text(encoding="utf-8")
meta_prefix = "window.PRODUCE_DATA = "
assert meta_text.startswith(meta_prefix)
payload = json.loads(meta_text[len(meta_prefix):].rstrip().rstrip(";"))
items = []
for n in range(1, 5):
    text = (ROOT / "data" / f"produce-{n}.js").read_text(encoding="utf-8").strip()
    prefix = "window.PRODUCE_DATA.items.push(..."
    assert text.startswith(prefix) and text.endswith(");")
    items.extend(json.loads(text[len(prefix):-2]))

assert len(items) == 211, f"expected 211 chart rows, got {len(items)}"
assert all(re.fullmatch(r"\d{4,5}", x["plu"]) for x in items)
assert all(x["unit"] in {"KG", "EA"} for x in items)
assert all(x["name"] for x in items)

yucca = [x for x in items if x["name"] == "YUCCA ROOT"]
assert len(yucca) == 1
assert yucca[0]["plu"] == "4819"
assert yucca[0]["unit"] == "KG"
assert "cassava" in yucca[0]["aliases"]
assert any(x["plu"] == "0434" and x["name"] == "PUMPKIN, CUT" for x in items)
assert any(x["plu"] == "0222" and x["name"] == "YELLOW TURMERIC" for x in items)
print("OK: dataset validation passed")

barcode_text = (ROOT / "data" / "barcodes.js").read_text(encoding="utf-8")
prefix = "window.BARCODE_DATA = "
assert barcode_text.startswith(prefix)
barcode_payload = json.loads(barcode_text[len(prefix):].rstrip().rstrip(";"))
assert isinstance(barcode_payload.get("mappings"), list)
ids = {x["id"] for x in items}
for row in barcode_payload["mappings"]:
    assert row.get("barcode"), row
    assert row.get("itemId") in ids, row
print("OK: barcode mapping configuration valid")
