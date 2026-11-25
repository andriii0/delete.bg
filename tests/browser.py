"""Exercise the production pages in an isolated, CPU-only Chromium profile."""
import argparse
import json
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import shutil
import subprocess
import tempfile
from threading import Event, Thread
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", default=shutil.which("google-chrome") or shutil.which("chromium"))
    parser.add_argument("--site", type=Path, default=ROOT / "site")
    args = parser.parse_args()
    if not args.browser:
        parser.error("Pass --browser with the path to Chrome or Edge.")
    done = Event()
    result = {}

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript",
                          ".js": "text/javascript", ".wasm": "application/wasm"}
        def translate_path(self, path):
            route = Path(unquote(urlsplit(path).path).lstrip("/"))
            roots = {"tests": ROOT / "tests", "examples": ROOT / "examples", "site": args.site.resolve()}
            if not route.parts or route.parts[0] not in roots or ".." in route.parts:
                return str(ROOT / "missing-test-resource")
            return str(roots[route.parts[0]].joinpath(*route.parts[1:]))

        def do_POST(self):
            if self.path != "/result":
                self.send_error(404)
                return
            result.update(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(204)
            self.end_headers()
            done.set()

        def log_message(self, *args):
            pass

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile, ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_port}/tests/browser.html"
        command = [args.browser, "--headless", "--disable-gpu", "--disable-popup-blocking",
                   "--no-first-run", "--disable-dev-shm-usage", f"--user-data-dir={profile}", url]
        with subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)) as browser:
            try:
                if not done.wait(150):
                    raise RuntimeError("Browser scenarios timed out")
            finally:
                browser.terminate()
                server.shutdown()
    for check in result.get("passed", []):
        print("PASS", check)
    if result.get("error"):
        raise RuntimeError(result["error"])
    if not result.get("passed"):
        raise RuntimeError("Browser returned no test results")


if __name__ == "__main__":
    main()
