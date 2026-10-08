"""What the configurator offers: housings, inserts, their parameters and presets.

Every parameter maps to an OpenSCAD variable in src/. The page only passes parameters
listed here, and only values inside their range, so a bad value never reaches OpenSCAD.

The page reads a copy of this as JSON. After a change, write it again:
    python3 web/catalog.py > web/static/catalog.json
"""
import json


# simple=True: also shown in Simple mode. Everything else is only in Advanced mode.
def num(name, label, lo, hi, step, default, unit="mm", help="", simple=False):
    return {"name": name, "label": label, "type": "number", "min": lo, "max": hi,
            "step": step, "default": default, "unit": unit, "help": help, "simple": simple}


def choice(name, label, options, default, help="", simple=False):
    return {"name": name, "label": label, "type": "choice", "options": options,
            "default": default, "help": help, "simple": simple}


EDGE_SHAPE = [
    num("slot_d", "Edge depth", 6, 35, 1, 20, help="From the lip to the back of the slot.", simple=True),
    num("grip_r", "Lip radius", 0.5, 12, 0.5, 3, help="Roundover on the lip. Small is sharp, big is friendly. Slopers have no lip."),
    num("edge_angle", "Edge angle", -45, 20, 1, 0, unit="°",
        help="Positive: incut, the grip tilts in for traction (Tension uses 10°). Negative: sloper, one round curve (20° to 45°)."),
    num("slot_h", "Slot height", 16, 30, 1, 22, help="Room for the fingers under the grip, where it is lowest. A steep or deep edge can leave less room, because the insert floor must stay."),
]

# Pockets share the edge shape, but their depth is a pocket depth.
POCKET_SHAPE = [num("slot_d", "Pocket depth", 6, 35, 1, 20, help="From the lip to the back of the pocket.", simple=True)] + EDGE_SHAPE[1:]

CORE = choice("core", "Core", [
    {"value": "truss", "label": "Hollow truss core (less filament)"},
    {"value": "solid", "label": "Solid"},
], "truss", help="Triangle cavities inside, open at the back. The grip and the latch keep full walls.")

# Widest slot or pocket row: one skin (2.4 mm) of wall stays between its ends and the latch arms.
# 2 * (pk_w/2 - clear - lt_t - lt_gap - skin) = 93.8
MAX_W = 93

INSERT_PRINT = "Print upside down, top face on the bed: the grip comes out smooth. Supports only under the slot floor."

HOUSING = {
    "id": "housing",
    "name": "Housing",
    "parts": [{"part": "housing", "name": "Housing",
               "print": "Print with the back face on the bed, pocket opening up, so the load runs along the layers. Needs some supports. 4 walls, 40% infill. PETG only: PLA is brittle in the cold and creeps when warm."}],
    "params": [
        choice("anchor", "Anchor", [
            {"value": "pyramid", "label": "Pyramid (four bars to a point)"},
            {"value": "keel", "label": "Keel (plate with a hole)"},
            {"value": "bar", "label": "Bolt (steel bolt through four legs)"},
        ], "pyramid", help="Every anchor holds the carabiner right under the grip, so the edge should stay level. Not measured yet.", simple=True),
        num("bar_angle", "Bar angle", 20, 40, 1, 25, unit="°", help="How steep the pyramid bars rise."),
        num("keel_hole", "Hole size", 13, 20, 0.5, 16, help="Carabiner hole diameter in the keel."),
        num("rod_d", "Bolt diameter", 8, 12, 1, 10, help="A steel bolt and nut this thick, at least 90 mm long. It must fit your carabiner."),
        choice("style", "Look", [
            {"value": "truss", "label": "Truss windows (lighter)"},
            {"value": "solid", "label": "Solid walls"},
        ], "truss", help="Triangle windows in the back wall."),
        num("top_t", "Top wall", 6, 12, 0.5, 8, help="The insert presses up on it. Thicker is stiffer and heavier."),
        num("floor_t", "Floor", 8, 12, 0.5, 8, help="Ties the anchor to the walls."),
        num("corner", "Corner radius", 3, 12, 0.5, 6, help="Rounding of the housing corners, seen from the front."),
    ],
    "show_if": {"bar_angle": ["anchor", "pyramid"], "keel_hole": ["anchor", "keel"], "rod_d": ["anchor", "bar"]},
}

INSERTS = [
    {
        "id": "edge",
        "name": "Edge",
        "blurb": "flat, ergo, incut or sloper",
        # Simple mode: one short choice that sets several values at once
        "simple_choice": {"label": "Shape", "options": [
            {"label": "Flat", "blurb": "classic edge", "values": {"edge_angle": 0, "ergo": 0, "grip_r": 3}},
            {"label": "Ergo", "blurb": "curved for longer middle fingers", "values": {"edge_angle": 0, "ergo": 5, "grip_r": 4}},
            {"label": "Incut", "blurb": "tilts in 10°, better traction", "values": {"edge_angle": 10, "ergo": 0, "grip_r": 2.5}},
            {"label": "Sloper", "blurb": "round 35° curve, open hand", "values": {"edge_angle": -35, "ergo": 0, "slot_d": 25}},
        ]},
        "parts": [{"part": "insert_edge", "name": "Edge insert",
                   "print": INSERT_PRINT}],
        "params": EDGE_SHAPE + [CORE,
            num("slot_w", "Edge width", 40, MAX_W, 1, 92),
            num("ergo", "Ergo curve", 0, 8, 0.5, 0, help="The lip curves this far back in the middle for the longer middle fingers. The middle gets deeper, the ends shallower and rounder."),
        ],
    },
    {
        "id": "pocket",
        "name": "Pockets",
        "blurb": "mono to three fingers",
        "simple_choice": {"label": "Fingers", "options": [
            {"label": "Mono", "blurb": "one finger", "values": {"pocket_n": 1, "pocket_w": 22}},
            {"label": "Two", "blurb": "two fingers", "values": {"pocket_n": 1, "pocket_w": 40}},
            {"label": "Three", "blurb": "three fingers", "values": {"pocket_n": 1, "pocket_w": 58}},
            {"label": "Two pairs", "blurb": "two 2-finger pockets", "values": {"pocket_n": 2, "pocket_w": 40}},
        ]},
        "parts": [{"part": "insert_pocket", "name": "Pocket insert",
                   "print": INSERT_PRINT}],
        "params": [
            num("pocket_n", "Pockets", 1, 3, 1, 1, unit=""),
            num("pocket_w", "Pocket width", 18, MAX_W, 1, 58, help="Mono about 22, two fingers about 40, three fingers about 58."),
            num("pocket_gap", "Wall between", 6, 20, 1, 10),
            num("pocket_r", "Opening corner radius", 2, 11, 0.5, 8, help="Rounding of the pocket opening, seen from the front."),
        ] + POCKET_SHAPE + [CORE],
        "max_span": MAX_W,   # pocket_n * pocket_w + (pocket_n - 1) * pocket_gap
    },
    {
        "id": "roller",
        "name": "Roller",
        "blurb": "unlevel or straight",
        "simple_choice": {"label": "Roller", "options": [
            {"label": "Unlevel", "blurb": "necks near the ends", "values": {"roll_type": "unlevel"}},
            {"label": "Straight", "blurb": "plain cylinder", "values": {"roll_type": "straight"}},
        ]},
        "parts": [
            {"part": "insert_roller", "name": "Roller frame", "print": "Print upright, floor on the bed. Supports under the cheeks, where the latch arms are cut away."},
            {"part": "roller", "name": "Roller", "print": "Print standing on one end. No supports."},
            {"part": "axle", "name": "Axle", "print": "Use a 12 mm steel rod or dowel, or print it lying down."},
        ],
        "params": [
            choice("roll_type", "Roller", [
                {"value": "unlevel", "label": "Unlevel (necks near the ends)"},
                {"value": "straight", "label": "Straight"},
            ], "unlevel"),
            num("roll_d", "Diameter", 24, 32, 1, 28),
        ],
    },
]

# Presets after common commercial edges (Tension Pro Edge: 8, 10, 15, 20, 25 mm, ergo, pocket, mono).
PRESETS = [
    {"name": "8 mm edge", "insert": "edge", "values": {"slot_d": 8, "grip_r": 1.5}},
    {"name": "10 mm edge", "insert": "edge", "values": {"slot_d": 10, "grip_r": 2}},
    {"name": "15 mm edge", "insert": "edge", "values": {"slot_d": 15, "grip_r": 3}},
    {"name": "20 mm edge", "insert": "edge", "values": {"slot_d": 20, "grip_r": 3}},
    {"name": "25 mm edge", "insert": "edge", "values": {"slot_d": 25, "grip_r": 4}},
    {"name": "20 mm ergo", "insert": "edge", "values": {"slot_d": 20, "grip_r": 4, "ergo": 5}},
    {"name": "25 mm ergo", "insert": "edge", "values": {"slot_d": 25, "grip_r": 5, "ergo": 6}},
    {"name": "15 mm incut 10°", "insert": "edge", "values": {"slot_d": 15, "grip_r": 2, "edge_angle": 10}},
    {"name": "20 mm incut 10°", "insert": "edge", "values": {"slot_d": 20, "grip_r": 3, "edge_angle": 10}},
    {"name": "20° sloper", "insert": "edge", "values": {"slot_d": 30, "edge_angle": -20}},
    {"name": "35° sloper", "insert": "edge", "values": {"slot_d": 25, "edge_angle": -35}},
    {"name": "45° sloper", "insert": "edge", "values": {"slot_d": 20, "edge_angle": -45, "slot_h": 18}},
    {"name": "25 mm three-finger pocket", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 58}},
    {"name": "25 mm two-finger pocket", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 40}},
    {"name": "25 mm mono", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 22, "pocket_r": 8}},
    {"name": "Two 2-finger pockets", "insert": "pocket", "values": {"slot_d": 20, "pocket_n": 2, "pocket_w": 40}},
    {"name": "Unlevel roller", "insert": "roller", "values": {"roll_type": "unlevel", "roll_d": 28}},
    {"name": "Straight roller", "insert": "roller", "values": {"roll_type": "straight", "roll_d": 28}},
]

# Reference models for the preview only.
REFS = [{"part": "carabiner", "name": "Carabiner"}]


def catalog():
    return {"housing": HOUSING, "inserts": INSERTS, "presets": PRESETS, "refs": REFS}


def all_params():
    out = {p["name"]: p for p in HOUSING["params"]}
    for ins in INSERTS:
        out.update({p["name"]: p for p in ins["params"]})
    return out


if __name__ == "__main__":
    print(json.dumps(catalog(), indent=1, ensure_ascii=False))
