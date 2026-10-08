"""opengrips configurator for local development: serves the site the way GitHub Pages does.

Run from the repo root:
    python3 web/server.py                 # http://localhost:8000
    python3 web/server.py --host 0.0.0.0  # reachable from other devices on the network

The page renders the parts itself with OpenSCAD in WebAssembly. This serves web/static, plus
opengrips.scad and src/ at the same paths the Pages deploy copies them to.
"""
import argparse
import pathlib
import posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = ROOT / "web" / "static"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".wasm": "application/wasm", ".js": "text/javascript", ".mjs": "text/javascript", ".scad": "text/plain"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def translate_path(self, path):
        # the render worker reads the OpenSCAD sources next to the page, where the Pages deploy puts them
        p = posixpath.normpath(unquote(urlparse(path).path))
        self.directory = str(ROOT if p == "/opengrips.scad" or p.startswith("/src/") else STATIC)
        return super().translate_path(path)

    def end_headers(self):
        # the page, its scripts and the sources change often while the project grows; never serve a stale copy
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    print(f"opengrips configurator on http://{a.host}:{a.port}")
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
