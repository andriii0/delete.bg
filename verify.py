"""Check vendored assets and static document references before publishing."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import argparse
import re
from shutil import copytree
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

def package(destination):
    sources = sorted([*ROOT.rglob("*.html"), *ROOT.glob("js/*.js"), ROOT / "style.css"])
    digest = sha256()
    for source in [*sources, *sorted((ROOT / "assets").glob("*"))]:
        digest.update(source.relative_to(ROOT).as_posix().encode())
        digest.update(source.read_bytes())
    version = digest.hexdigest()[:16]
    copytree(ROOT, destination)
    # Keep stable paths for bookmarks, draft storage and older cached pages.
    # Stamp entry points and transitive imports, including the worker URL.
    reference = re.compile(r'(["\'])([^"\'\s]+\.(?:js|css|webp|svg|woff2))\1')
    for source in sources:
        output = destination / source.relative_to(ROOT)
        text = reference.sub(lambda m: f'{m[1]}{m[2]}?v={version}{m[1]}', source.read_text(encoding="utf-8"))
        output.write_text(text, encoding="utf-8")
    return destination

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", type=Path)
    args = parser.parse_args()
    root = package(args.release) if args.release else ROOT
    for name, expected in HASHES.items():
        if sha256((root / "vendor" / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Checksum mismatch: {name}")
        if name.endswith((".onnx", ".wasm")) and expected not in (root / "js/inference.js").read_text(encoding="utf-8"):
            raise ValueError(f"Missing client checksum: {name}")
    for page in root.rglob("*.html"):
        Links(page).feed(page.read_text(encoding="utf-8-sig"))
    print("Static links and five inference assets verified.")

