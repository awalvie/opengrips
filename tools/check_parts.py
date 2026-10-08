"""Render parts across the catalog and check that each one can be printed and used.

Usage: python3 tools/check_parts.py [-j JOBS]

Cases: every anchor, every preset, and the corners of the edge and pocket ranges in web/catalog.py.
Checks: one watertight body. Edges and pockets also keep their depth, a floor under the slot that
does not break into the core, a wall under the size mark, and a wall between the slot end and the
latch arm. Exits 1 if any check fails.
"""
import argparse
import itertools
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


def check_slot(mesh, solid, part, params):
    """Problems with the slot of an edge or pocket insert. solid is the same part with a solid core:
    the slot floor must sit at the same height in both, or the slot breaks into the core."""
    spec = catalog.all_params()
    v = {n: params.get(n, spec[n]["default"]) for n in spec}
    bottom, top = mesh.bounds[0][2], mesh.bounds[1][2]
    problems = []
    # the first pocket from the left, or the middle of an edge
    x = 0
    if part == "insert_pocket":
        w = v["pocket_w"]
        x = (w - (v["pocket_n"] * w + (v["pocket_n"] - 1) * v["pocket_gap"])) / 2
    # depth: the deepest opening seen from the front
    depth = max((hits(mesh, np.array([x, -5, z]), np.array([0, 1, 0])) or [0])[0] - 5
                for z in np.arange(bottom + 0.25, top, 0.25))
    if depth < v["slot_d"] - 0.5:
        problems.append(f"slot {depth:.1f} mm deep, asked {v['slot_d']}")
    # floor: under the front half of the slot, where the lip and the mouth round cut deepest. In the
    # solid render the last two surfaces down are the floor and the bottom; the core may not reach the floor.
    for y in np.arange(1.5, max(depth / 2, 2), 1):
        d, ds = down(mesh, x, y), down(solid, x, y)
        if len(ds) == 2 and ds[0] > top - 0.05:
            continue   # solid from top to bottom, no slot here: the lip of an ergo edge sits further back
        if len(ds) < 2 or abs(ds[-1] - bottom) > 0.05 or ds[-2] - bottom < MIN_WALL:
            return problems + [f"no floor under the slot at y={y:.1f}"]
        floor = ds[-2]
        if not any(abs(z - floor) < 0.05 for z in d):
            return problems + [f"the slot breaks into the core at y={y:.1f}"]
        wall = floor - max(z for z in d if z < floor - 0.01)
        if wall < MIN_WALL:
            return problems + [f"floor {wall:.1f} mm at y={y:.1f}"]
    # front: the size mark is cut 1 mm into the face under the slot; the wall under it is the last one down
    for xf in np.arange(-25, 25.5, 1):
        d = down(mesh, xf, 0.5)
        if len(d) >= 2 and d[-2] - d[-1] < MIN_WALL:
            return problems + [f"front wall {d[-2] - d[-1]:.1f} mm under the size mark at x={xf:.0f}"]
    # ends: the wall from the slot end out to the latch relief, half way up the opening
    ds = down(solid, x, depth / 2)
    ceiling = min((z for z in ds if z > ds[-2] + 0.01), default=None)
    if len(ds) < 3 or ceiling is None:
        return problems + ["no slot half way back"]
    side = hits(mesh, np.array([x, depth / 2, (ds[-2] + ceiling) / 2]), np.array([-1, 0, 0]))
    if len(side) < 2 or side[1] - side[0] < MIN_WALL:
        problems.append("no slot end wall" if len(side) < 2 else f"slot end wall {side[1] - side[0]:.1f} mm")
    return problems


def check(part, params, mesh, solid):
    problems = []
    bodies = mesh.split(only_watertight=False)
    if len(bodies) != 1:
        problems.append(f"{len(bodies)} bodies")
    if not mesh.is_watertight:
        problems.append("not watertight")
    if solid is not None:
        problems += check_slot(mesh, solid, part, params)
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-j", "--jobs", type=int, default=8)
    a = ap.parse_args()
    todo = cases()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(a.jobs) as pool:
        meshes = pool.map(lambda c: render(c[0], c[1], tmp), todo)
        # edges and pockets again with a solid core, to find the slot floor without the core cavities
        slotted = [c if c[0] in ("insert_edge", "insert_pocket") else None for c in todo]
        solids = pool.map(lambda c: c and render(c[0], {**c[1], "core": "solid"}, tmp), slotted)
        for (part, params), mesh, solid in zip(todo, meshes, solids):
            problems = check(part, params, mesh, solid)
            failed += bool(problems)
            label = " ".join([part] + [f"{k}={v}" for k, v in params.items()])
            print(f"{'FAIL' if problems else 'ok  '} {label}" + (f": {'; '.join(problems)}" if problems else ""))
    print(f"{len(todo) - failed} of {len(todo)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
