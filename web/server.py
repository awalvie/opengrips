"""opengrips configurator: pick a housing and an insert, preview them, download STL files.

Run from the repo root inside the dev shell:
    python3 web/server.py                 # http://localhost:8000
    python3 web/server.py --host 0.0.0.0  # reachable from other devices on the network

Renders run OpenSCAD on opengrips.scad and are cached in .cache/stl by their parameters.
"""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
import posixpath
import re
import subprocess
import threading
import zipfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import catalog

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = ROOT / "web" / "static"
CACHE = ROOT / ".cache" / "stl"
SCAD = ROOT / "opengrips.scad"

def source_hash():
    """Changes whenever any OpenSCAD source changes, so the cache never serves an old shape."""
    h = hashlib.sha256()
    for f in sorted([SCAD, *ROOT.glob("src/**/*.scad")]):
        h.update(f.read_bytes())
    return h.hexdigest()[:12]


renders = threading.BoundedSemaphore(4)       # OpenSCAD runs at the same time
key_locks: dict[str, threading.Lock] = {}
key_locks_guard = threading.Lock()


class BadRequest(Exception):
    pass


def clean_params(query):
    """Keep known parameters with values inside their range. Everything else is an error."""
    out = {}
    params = catalog.all_params()
    for name, values in query.items():
        if name in ("part", "parts", "download"):
            continue
        spec = params.get(name)
        if spec is None:
            raise BadRequest(f"unknown parameter: {name}")
        value = values[-1]
        if spec["type"] == "number":
            try:
                v = float(value)
            except ValueError:
                raise BadRequest(f"{name} must be a number")
            if not spec["min"] <= v <= spec["max"]:
                raise BadRequest(f"{name} must be between {spec['min']} and {spec['max']}")
            if v != spec["default"]:   # defaults are left out, so equal shapes share one cache entry
                out[name] = int(v) if v == int(v) else v
        else:
            if value not in [o["value"] for o in spec["options"]]:
                raise BadRequest(f"{name} has no option {value}")
            if value != spec["default"]:
                out[name] = value
    if "pocket_n" in out or "pocket_w" in out or "pocket_gap" in out:
        p = {q["name"]: q["default"] for q in catalog.INSERTS[1]["params"]}
        p.update(out)
        span = p["pocket_n"] * p["pocket_w"] + (p["pocket_n"] - 1) * p["pocket_gap"]
        if span > catalog.INSERTS[1]["max_span"]:
            raise BadRequest("The pockets are wider than the insert. Use fewer or narrower pockets.")
    return out


def render(part, params):
    """Return the path of the STL for this part and these parameters, rendering it if needed."""
    if part not in catalog.part_names():
        raise BadRequest(f"unknown part: {part}")
    key_src = json.dumps([source_hash(), part, sorted(params.items())])
    key = hashlib.sha256(key_src.encode()).hexdigest()[:20]
    path = CACHE / f"{key}.stl"
    with key_locks_guard:
        lock = key_locks.setdefault(key, threading.Lock())
    with lock:
        if path.exists():
            return path
        CACHE.mkdir(parents=True, exist_ok=True)
        args = ["openscad", "-q", "--export-format", "binstl", "-D", f'part="{part}"']
        for name, value in params.items():
            args += ["-D", f'{name}="{value}"' if isinstance(value, str) else f"{name}={value}"]
        tmp = path.with_suffix(".tmp")
        with renders:
            proc = subprocess.run(args + ["-o", str(tmp), str(SCAD)], capture_output=True, text=True, timeout=300)
        if proc.returncode != 0 or not tmp.exists():
            raise RuntimeError(proc.stderr.strip()[-500:] or "OpenSCAD failed")
        tmp.rename(path)
        return path


def file_name(part, params):
    bits = [part] + [f"{k}{v}" for k, v in sorted(params.items())]
    return "-".join(str(b).replace(".", "p") for b in bits)[:120] + ".stl"


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

    def send_json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, ctype, name=None):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if name:
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path.startswith("/api/"):
            importlib.reload(catalog)   # catalog edits go live without a restart
        try:
            if url.path == "/api/catalog":
                return self.send_json(catalog.catalog())
            if url.path == "/api/stl":
                part = query.get("part", [""])[-1]
                params = clean_params(query)
                path = render(part, params)
                name = file_name(part, params) if "download" in query else None
                return self.send_bytes(path.read_bytes(), "model/stl", name)
        except BadRequest as e:
            return self.send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)
        except Exception as e:   # OpenSCAD failure or timeout
            return self.send_json({"error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        return super().do_GET()

    def do_POST(self):
        """POST /api/kit with {"items": [{"name", "parts": [...], "params": {...}}]}: one zip, a folder per item."""
        if urlparse(self.path).path != "/api/kit":
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        importlib.reload(catalog)
        try:
            size = int(self.headers.get("Content-Length", 0))
            if size > 65536:
                raise BadRequest("the kit is too big")
            items = json.loads(self.rfile.read(size) or b"{}").get("items", [])
            if not 1 <= len(items) <= 20:
                raise BadRequest("a kit holds 1 to 20 items")
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for n, item in enumerate(items, 1):
                    params = clean_params({k: [str(v)] for k, v in item.get("params", {}).items()})
                    folder = f"{n:02d}-" + re.sub(r"[^A-Za-z0-9]+", "-", str(item.get("name", "item"))).strip("-")[:40]
                    for part in item.get("parts", []):
                        own = {k: v for k, v in params.items() if k in catalog.params_for(part)}
                        z.write(render(part, own), f"{folder}/{part}.stl")
            return self.send_bytes(buf.getvalue(), "application/zip", "opengrips-kit.zip")
        except BadRequest as e:
            return self.send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)
        except (ValueError, AttributeError):
            return self.send_json({"error": "the kit is not valid JSON"}, HTTPStatus.BAD_REQUEST)
        except Exception as e:
            return self.send_json({"error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def end_headers(self):
        # the page and its script change often while the project grows; never serve a stale copy
        if not self.path.startswith("/api/"):
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
