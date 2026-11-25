"""Check vendored assets and static document references before publishing."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent / "site"
HASHES = {
    "modnet.onnx": "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9",
    "u2netp.onnx": "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    "ort.wasm.min.mjs": "6ef726f355b791129f7ddf3f62e7877a16b9b777abe87004b8ab306e6b9cf265",
    "ort-wasm-simd-threaded.mjs": "30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8",
    "ort-wasm-simd-threaded.wasm": "71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4",
}

class Links(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.page = page

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in ("src", "href") or not value:
                continue
            url = urlsplit(value)
            if url.scheme or not url.path:
                continue
            if url.path.startswith("/"):
                raise ValueError(f"Root-relative link in {self.page}: {value}")
            target = self.page.parent / url.path
            if target.is_dir():
                target = target / "index.html"
            if not target.is_file():
                raise FileNotFoundError(target)

if __name__ == "__main__":
    for name, expected in HASHES.items():
        if sha256((ROOT / "vendor" / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Checksum mismatch: {name}")
    for page in ROOT.rglob("*.html"):
        Links(page).feed(page.read_text(encoding="utf-8-sig"))
    print("Static links and five inference assets verified.")

