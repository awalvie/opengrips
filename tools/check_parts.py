"""Render parts across the catalog and check that each one can be printed and used.

Usage: python3 tools/check_parts.py [-j JOBS]

Cases: every anchor, every preset, the corners of the edge, pocket and flip ranges in web/catalog.py,
and the fit test.
Checks: one watertight body. Edges and pockets also keep their depth, a floor under the slot, a
rail over the slot at the face, a wall under the size mark, and a wall between the slot end and
the latch arm. Each edge of a flip insert gets the edge checks and keeps room for the fingers.
Exits 1 if any check fails.
"""
import argparse
import itertools
import json
import pathlib
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import trimesh

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "web"))
import catalog  # noqa: E402

MIN_WALL = 1.5   # thinnest wall a check accepts: under the slot and at the slot ends
MIN_RAIL = 3     # thinnest rail over the slot at the face: half of rail_t, as an edge's lip round climbs into it
MIN_ROOM = 16    # least finger room in a flip insert slot: the lowest slot_h an edge insert takes
FLIP_ZC = 34     # middle of the flip insert height: floor_t + pk_h / 2 in src/config.scad


def cases():
    """(part, params) pairs to render."""
    out = []
    anchor = next(p for p in catalog.HOUSING["params"] if p["name"] == "anchor")
    for o in anchor["options"]:
        out.append(("housing", {"anchor": o["value"]}))
    for ins in catalog.INSERTS:
        for part in ins["parts"]:
            out.append((part["part"], {}))
    for preset in catalog.PRESETS:
        ins = next(i for i in catalog.INSERTS if i["id"] == preset["insert"])
        for part in ins["parts"]:
            out.append((part["part"], preset["values"]))
    # the corners of the slot shape: the extremes meet here
    spec = catalog.all_params()
    ranges = [(n, (spec[n]["min"], spec[n]["max"])) for n in ("edge_angle", "slot_d", "slot_h", "grip_r")]
    for values in itertools.product(*(r for _, r in ranges)):
        params = dict(zip((n for n, _ in ranges), values))
        out.append(("insert_edge", params))
        out.append(("insert_pocket", params))
    out.append(("insert_edge", {"slot_w": spec["slot_w"]["max"]}))
    out += [("fit_ring", {}), ("fit_frame", {}), ("fit_channel", {}), ("fit_cheek", {})]
    # flip: every corner of the top edge, with the bottom edge at the opposite corner
    flip = {p["name"]: p for p in catalog.FLIP["params"]}
    for values in itertools.product(*((flip[f"top_{n}"]["min"], flip[f"top_{n}"]["max"]) for n in ("d", "r", "ergo"))):
        top = dict(zip(("top_d", "top_r", "top_ergo"), values))
        bot = {k.replace("top", "bot"): flip[k]["min"] + flip[k]["max"] - v for k, v in top.items()}
        out.append(("insert_flip", top | bot))
    pocket = next(i for i in catalog.INSERTS if i["id"] == "pocket")
    out.append(("insert_pocket", {"pocket_w": pocket["max_span"]}))
    return out


def render(part, params, tmp):
    stl = pathlib.Path(tmp) / f"{abs(hash((part, tuple(sorted(params.items())))))}.stl"
    args = ["openscad", "-q", "--export-format", "binstl", "-D", f'part="{part}"']
    for k, v in params.items():
        args += ["-D", f'{k}="{v}"' if isinstance(v, str) else f"{k}={v}"]
    subprocess.run(args + ["-o", str(stl), str(ROOT / "opengrips.scad")], check=True, capture_output=True)
    return trimesh.load(stl)


def hits(mesh, origin, direction):
    """Distances along the ray to every surface it crosses, nearest first. A ray through a mesh
    edge hits both faces there; keep one."""
    loc, _, _ = mesh.ray.intersects_location([origin], [direction], multiple_hits=True)
    out = []
    for d in sorted(float(np.dot(p - origin, direction)) for p in loc):
        if not out or d - out[-1] > 1e-3:
            out.append(d)
    return out


def down(mesh, x, y):
    """Heights of the surfaces met going straight down at (x, y), top first."""
    top = mesh.bounds[1][2] + 5
    return [top - d for d in hits(mesh, np.array([x, y, top]), np.array([0, 0, -1]))]


def check_slot(mesh, part, params):
    """Problems with the slot of an edge or pocket insert."""
    spec = catalog.all_params()
    v = {n: params.get(n, spec[n]["default"]) for n in spec}
    bottom, top = mesh.bounds[0][2], mesh.bounds[1][2]
    problems = []
    # the first pocket from the left, or the middle of an edge
    x, w, r = 0, v["slot_w"], 4   # r: slot_r in src/inserts/edge.scad
    if part == "insert_pocket":
        w, r = v["pocket_w"], v["pocket_r"]
        x = (w - (v["pocket_n"] * w + (v["pocket_n"] - 1) * v["pocket_gap"])) / 2
    # depth: the deepest opening seen from the front
    depth = max((hits(mesh, np.array([x, -5, z]), np.array([0, 1, 0])) or [0])[0] - 5
                for z in np.arange(bottom + 0.25, top, 0.25))
    if depth < v["slot_d"] - 0.5:
        problems.append(f"slot {depth:.1f} mm deep, asked {v['slot_d']}")
    # floor: under the front half of the slot, where the lip and the mouth round cut deepest. The last
    # two surfaces down are the floor and the bottom. Probe off-centre too, out to where the floor corners start.
    off = max(0, w / 2 - r - 1)
    for xp, y in itertools.product((x - off, x, x + off), np.arange(1.5, max(depth / 2, 2), 1)):
        d = down(mesh, xp, y)
        if len(d) == 2 and d[0] > top - 0.05 and abs(d[1] - bottom) < 0.05:
            continue   # solid from top to bottom, no slot here: the lip of an ergo edge sits further back
        at = f"x={xp:.1f} y={y:.1f}"
        if len(d) < 2 or abs(d[-1] - bottom) > 0.05 or d[-2] - bottom < MIN_WALL:
            return problems + [f"no floor under the slot at {at}"]
    # rail: the band over the slot, just behind the face, where the lip or mouth round climbs into it
    for xp in (x - off, x, x + off):
        face = hits(mesh, np.array([xp, -5, top - 0.5]), np.array([0, 1, 0]))
        d = down(mesh, xp, face[0] - 5 + 0.5) if face else []
        if len(d) > 2 and d[0] - d[1] < MIN_RAIL:
            return problems + [f"rail {d[0] - d[1]:.1f} mm over the slot at x={xp:.1f}"]
    # front: the size mark is cut 1 mm into the face under the slot; the wall under it is the last one down
    for xf in np.arange(-25, 25.5, 1):
        d = down(mesh, xf, 0.5)
        if len(d) >= 2 and d[-2] - d[-1] < MIN_WALL:
            return problems + [f"front wall {d[-2] - d[-1]:.1f} mm under the size mark at x={xf:.0f}"]
    # ends: the wall from the slot end out to the latch relief, half way up the opening
    ds = down(mesh, x, depth / 2)
    ceiling = min((z for z in ds if z > ds[-2] + 0.01), default=None)
    if len(ds) < 3 or ceiling is None:
        return problems + ["no slot half way back"]
    side = hits(mesh, np.array([x, depth / 2, (ds[-2] + ceiling) / 2]), np.array([-1, 0, 0]))
    if len(side) < 2 or side[1] - side[0] < MIN_WALL:
        problems.append("no slot end wall" if len(side) < 2 else f"slot end wall {side[1] - side[0]:.1f} mm")
    return problems


def check_flip(mesh, params):
    """Problems with the two edges of a flip insert: each half is checked as an edge insert, and
    each slot keeps MIN_ROOM for the fingers."""
    v = {p["name"]: params.get(p["name"], p["default"]) for p in catalog.FLIP["params"]}
    turn = trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0], [0, 0, FLIP_ZC])
    box = trimesh.creation.box(bounds=[[-100, -10, FLIP_ZC], [100, 100, 100]])
    problems = []
    for key in ("top", "bot"):
        m = mesh.copy()
        if key == "bot":
            m.apply_transform(turn)
        half = trimesh.boolean.intersection([m, box], engine="manifold")
        found = check_slot(half, "insert_edge", {"slot_d": v[f"{key}_d"]})
        # room under the grip, half way back in the middle, where the ergo lip sits furthest back
        ds = down(half, 0, v[f"{key}_ergo"] + v[f"{key}_d"] / 2)
        if len(ds) != 4:
            found.append("no slot half way back")
        elif ds[1] - ds[2] < MIN_ROOM:
            found.append(f"finger room {ds[1] - ds[2]:.1f} mm")
        problems += [f"{key}: {p}" for p in found]
    return problems


def check(part, params, mesh):
    problems = []
    bodies = mesh.split(only_watertight=False)
    if len(bodies) != 1:
        problems.append(f"{len(bodies)} bodies")
    if not mesh.is_watertight:
        problems.append("not watertight")
    if part in ("insert_edge", "insert_pocket"):
        problems += check_slot(mesh, part, params)
    if part == "insert_flip":
        problems += check_flip(mesh, params)
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-j", "--jobs", type=int, default=8)
    a = ap.parse_args()
    if json.loads((ROOT / "web/static/catalog.json").read_text()) != json.loads(json.dumps(catalog.catalog())):
        sys.exit("web/static/catalog.json is out of date: python3 web/catalog.py > web/static/catalog.json")
    todo = cases()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(a.jobs) as pool:
        meshes = pool.map(lambda c: render(c[0], c[1], tmp), todo)
        for (part, params), mesh in zip(todo, meshes):
            problems = check(part, params, mesh)
            failed += bool(problems)
            label = " ".join([part] + [f"{k}={v}" for k, v in params.items()])
            print(f"{'FAIL' if problems else 'ok  '} {label}" + (f": {'; '.join(problems)}" if problems else ""))
    print(f"{len(todo) - failed} of {len(todo)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
