"""What the configurator offers: housings, inserts and their parameters.

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


# The editor shows each housing or insert as cards: a title, an optional line under it, and the
# settings in it. "choice": the card also holds the one-tap choice (Shape, Fingers or Roller).
# A new setting goes in a card here; the page needs no change.
def card(title, params, sub="", choice=False, choice_after=""):
    return {"title": title, "sub": sub, "params": [p["name"] if isinstance(p, dict) else p for p in params], "choice": choice,
            "choice_after": choice_after}


EDGE_SHAPE = [
    num("slot_d", "Edge depth", 6, 35, 1, 20, help="From the lip to the back of the slot.", simple=True),
    num("grip_r", "Lip radius", 0.5, 12, 0.5, 3, help="Roundover on the lip. Small is sharp, big is friendly. Slopers have no lip."),
    num("edge_angle", "Edge angle", -45, 20, 1, 0, unit="°",
        help="Positive: incut, the grip tilts in for traction (Tension uses 10°). Negative: sloper, one round curve (20° to 45°)."),
    num("slot_h", "Slot height", 16, 30, 1, 22, help="Room for the fingers under the grip, where it is lowest. A steep or deep edge can leave less room, because the insert floor must stay."),
]

# Pockets share the edge shape, but their depth is a pocket depth.
POCKET_SHAPE = [num("slot_d", "Pocket depth", 6, 35, 1, 20, help="From the lip to the back of the pocket.", simple=True)] + EDGE_SHAPE[1:]

# Widest slot or pocket row: one skin (2.4 mm) of wall stays between its ends and the latch arms.
# 2 * (pk_w/2 - clear - lt_t - lt_gap - skin) = 93.8
MAX_W = 93

INSERT_SUPPORTS = "supports under the slot floor"
SOLID = "3 walls · 15% gyroid"

HOUSING = {
    "id": "housing",
    "name": "Housing",
    "parts": [{"part": "housing", "name": "Housing",
               "supports": "supports under the anchor", "settings": SOLID}],
    "params": [
        choice("anchor", "Anchor", [
            {"value": "pyramid", "label": "Pyramid (four bars to a point)"},
            {"value": "keel", "label": "Keel (plate with a hole)"},
        ], "pyramid", help="Every anchor holds the carabiner right under the grip, so the edge should stay level. Not measured yet.", simple=True),
        num("bar_angle", "Bar angle", 20, 40, 1, 25, unit="°", help="How steep the pyramid bars rise."),
        num("keel_hole", "Hole size", 13, 20, 0.5, 16, help="Carabiner hole diameter in the keel."),
        choice("style", "Look", [
            {"value": "truss", "label": "Truss windows (lighter)"},
            {"value": "solid", "label": "Solid walls"},
        ], "truss", help="Triangle windows in the back wall."),
        num("top_t", "Top wall", 6, 12, 0.5, 8, help="The insert presses up on it. Thicker is stiffer and heavier."),
        num("floor_t", "Floor", 8, 12, 0.5, 8, help="Ties the anchor to the walls."),
        num("corner", "Corner radius", 3, 12, 0.5, 6, help="Rounding of the housing corners, seen from the front."),
    ],
    "show_if": {"bar_angle": ["anchor", "pyramid"], "keel_hole": ["anchor", "keel"]},
    "cards": [card("Hanging", ["anchor", "bar_angle", "keel_hole"], "how the housing holds the carabiner"),
              card("Walls", ["style", "top_t", "floor_t", "corner"], "the box the inserts slide into")],
}

# Flip insert: two grips, one on top and one turned over under it. Each is a flat or ergo edge,
# or a row of pockets. Each slot has 16.5 mm of room down to the web, so no angle and no slot
# height; the lip radius stops at 3.5 so an ergo lip keeps 16 mm. No roller: it does not fit in
# half the insert.
FLIP_SPAN = 86   # widest pocket row: its mouth round stays clear of the latch relief on the bottom half


def flip_grip(key, which, depth, radius):
    return [
        choice(f"{key}_kind", "Type", [
            {"value": "edge", "label": "Edge"},
            {"value": "pocket", "label": "Pockets"},
        ], "edge", simple=True),
        num(f"{key}_d", f"{which} depth", 6, 30, 1, depth, help="From the lip to the back of the slot or pocket.", simple=True),
        num(f"{key}_r", f"{which} lip radius", 0.5, 3.5, 0.5, radius, help="Roundover on the lip. Small is sharp, big is friendly."),
        num(f"{key}_ergo", f"{which} ergo curve", 0, 8, 0.5, 0, help="The lip curves this far back in the middle for the longer middle fingers."),
        num(f"{key}_w", f"{which} edge width", 40, MAX_W, 1, 92),
        num(f"{key}_pn", f"{which} pockets", 1, 3, 1, 1, unit=""),
        num(f"{key}_pw", f"{which} pocket width", 18, FLIP_SPAN, 1, 58, help="Mono about 22, two fingers about 40, three fingers about 58."),
        num(f"{key}_pgap", f"{which} wall between", 6, 20, 1, 10),
        num(f"{key}_pr", f"{which} opening corner radius", 2, 11, 0.5, 8, help="Rounding of the pocket opening, seen from the front."),
    ]


def flip_show_if(key):
    return {f"{key}_{n}": [f"{key}_kind", "edge"] for n in ("ergo", "w")} | \
           {f"{key}_{n}": [f"{key}_kind", "pocket"] for n in ("pn", "pw", "pgap", "pr")}


FLIP = {
    "id": "flip",
    "name": "Two-sided",
    "blurb": "two grips, turn it over",
    # the page shows no Flip type: an edge or pocket insert set to two sides becomes this one
    "two_sided_of": ["edge", "pocket"],
    "parts": [{"part": "insert_flip", "name": "Two-sided insert", "supports": "no supports", "settings": SOLID}],
    "params": flip_grip("top", "Top", 20, 3) + flip_grip("bot", "Bottom", 10, 2),
    "show_if": flip_show_if("top") | flip_show_if("bot"),
    "spans": [{"names": [f"{k}_pn", f"{k}_pw", f"{k}_pgap"], "max": FLIP_SPAN} for k in ("top", "bot")],
    "cards": [card("Top grip", flip_grip("top", "", 0, 0), "faces up", choice=True),
              card("Bottom grip", flip_grip("bot", "", 0, 0), "on the underside: turn the insert over to use it", choice=True,
                   choice_after="bot_kind")],
    # each grip's one-tap choice, by its kind; the values are the grip's own, without its top_ or bot_
    "side_choices": {
        "edge": {"label": "Shape", "help": "Two-sided grips are flat or ergo: any angle takes finger room away.", "options": [
            {"label": "Flat", "blurb": "classic edge", "values": {"ergo": 0, "r": 3}},
            {"label": "Ergo", "blurb": "curved for longer middle fingers", "values": {"ergo": 5, "r": 3.5}},
        ]},
        "pocket": {"label": "Fingers", "options": [
            {"label": "Mono", "blurb": "one finger", "values": {"pn": 1, "pw": 22}},
            {"label": "Two", "blurb": "two fingers", "values": {"pn": 1, "pw": 40}},
            {"label": "Three", "blurb": "three fingers", "values": {"pn": 1, "pw": 58}},
        ]},
    },
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
                   "supports": INSERT_SUPPORTS, "settings": SOLID}],
        "params": EDGE_SHAPE + [
            num("slot_w", "Edge width", 40, MAX_W, 1, 92),
            num("ergo", "Ergo curve", 0, 8, 0.5, 0, help="The lip curves this far back in the middle for the longer middle fingers. The middle gets deeper, the ends shallower and rounder."),
        ],
        "cards": [card("Edge", ["slot_d", "grip_r", "edge_angle", "slot_h", "slot_w", "ergo"], choice=True)],
    },
    FLIP,
    {
        "id": "pocket",
        "name": "Pockets",
        "blurb": "mono to three fingers",
        "simple_choice": {"label": "Fingers", "options": [
            {"label": "Mono", "blurb": "one finger", "values": {"pocket_n": 1, "pocket_w": 22}},
            {"label": "Two", "blurb": "two fingers", "values": {"pocket_n": 1, "pocket_w": 40}},
            {"label": "Three", "blurb": "three fingers", "values": {"pocket_n": 1, "pocket_w": 58}},
        ]},
        "parts": [{"part": "insert_pocket", "name": "Pocket insert",
                   "supports": INSERT_SUPPORTS, "settings": SOLID}],
        "params": [
            num("pocket_n", "Pockets", 1, 3, 1, 1, unit=""),
            num("pocket_w", "Pocket width", 18, MAX_W, 1, 58, help="Mono about 22, two fingers about 40, three fingers about 58."),
            num("pocket_gap", "Wall between", 6, 20, 1, 10),
            num("pocket_r", "Opening corner radius", 2, 11, 0.5, 8, help="Rounding of the pocket opening, seen from the front."),
        ] + POCKET_SHAPE,
        # a pocket row must fit: count * width + (count - 1) * wall <= max
        "spans": [{"names": ["pocket_n", "pocket_w", "pocket_gap"], "max": MAX_W}],
        "cards": [card("Pockets", ["slot_d", "pocket_n", "pocket_w", "pocket_gap", "pocket_r", "grip_r", "edge_angle", "slot_h"], choice=True)],
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
            {"part": "insert_roller", "name": "Roller frame", "supports": "supports under the cheeks", "settings": SOLID},
            {"part": "roller", "name": "Roller", "supports": "no supports", "settings": "3 walls · 20% infill"},
            {"part": "axle", "name": "Axle", "supports": "no supports, or use a 12 mm steel rod", "settings": "4 walls · 100% infill"},
        ],
        "params": [
            choice("roll_type", "Roller", [
                {"value": "unlevel", "label": "Unlevel (necks near the ends)"},
                {"value": "straight", "label": "Straight"},
            ], "unlevel"),
            num("roll_d", "Diameter", 24, 32, 1, 28),
        ],
        "cards": [card("Roller", ["roll_type", "roll_d"], choice=True)],
    },
]

# Common commercial edges (Tension Pro Edge: 8, 10, 15, 20, 25 mm, ergo, pocket, mono). tools/check_parts.py renders
# each of them; the page does not show them.
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

# Print before the kit: the pocket gap and the latch, on your printer. Downloaded as one zip.
FIT_TEST = [{"part": "fit_ring", "name": "Ring"}, {"part": "fit_frame", "name": "Frame"},
            {"part": "fit_channel", "name": "Latch channel"}, {"part": "fit_cheek", "name": "Latch cheek"}]


def catalog():
    return {"housing": HOUSING, "inserts": INSERTS, "refs": REFS, "fit_test": FIT_TEST}


def all_params():
    out = {p["name"]: p for p in HOUSING["params"]}
    for ins in INSERTS:
        out.update({p["name"]: p for p in ins["params"]})
    return out


if __name__ == "__main__":
    print(json.dumps(catalog(), indent=1, ensure_ascii=False))
