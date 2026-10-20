"""Parse the MPF wiki tables (MediaWiki API JSON) -> name -> {resources, amount, seconds, totals}."""
import json
import sys
from html.parser import HTMLParser

src, dst = sys.argv[1], sys.argv[2]
html = json.load(open(src, encoding="utf-8"))["parse"]["text"]


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.depth = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = {"tag": tag, "text": "", "imgs": []}
        elif tag == "img" and self.cell is not None:
            self.cell["imgs"].append(a.get("alt") or "")
        elif tag == "br" and self.cell is not None:
            self.cell["text"] += "\n"

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"] += data


p = P()
p.feed(html)
out = {}
for r in p.rows:
    if len(r) < 6 or r[0]["tag"] != "td":
        continue
    name = r[0]["text"].strip()
    time = r[2]["text"].strip()
    if ":" not in time:
        continue
    h, m, s = (int(x) for x in time.split(":"))
    res = []
    for alt in r[3]["imgs"]:
        alt = alt.replace(".png", "").strip()
        if alt and alt not in res:
            res.append(alt)
    cols = [[int(x) for x in c["text"].split() if x.strip().isdigit()] for c in r[4:]]
    out[name] = {
        "amount": int(r[1]["text"].strip() or 0),
        "seconds": h * 3600 + m * 60 + s,
        "resources": res,
        "totals": {str(i + 3): col for i, col in enumerate(cols)},
    }
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(out))
