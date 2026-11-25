"""Serve the static site with portable JavaScript and WebAssembly MIME types."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".js": "text/javascript",
                      ".wasm": "application/wasm"}

    def end_headers(self):
        if "/vendor/" in self.path:
            self.send_header("Cache-Control", "public, max-age=604800")
        super().end_headers()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bench", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    directory = root if args.bench else root / "site"
    print(f"Serving {directory} at http://127.0.0.1:{args.port}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=directory)).serve_forever()
