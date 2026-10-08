# opengrips

A 3D-printable no-hang lift block for finger training. One housing hangs from a carabiner, and the grip inserts slide in and click into place: edges, pockets and rollers. Every housing takes every insert.

**Configurator:** https://awalvie.github.io/opengrips/ — pick a housing and inserts, change the shape, and download the STL files.

| A 20 mm edge in the pyramid housing | A two-finger pocket in the keel housing |
| --- | --- |
| ![The configurator with a 20 mm edge](docs/img/configurator-edge.png) | ![The configurator with a two-finger pocket](docs/img/configurator-pocket.png) |

> **Status: prototype. Load ratings are not tested yet.** Print and use it at your own risk. Check every part and the carabiner before each session, and stop using a part that cracks or creeps.

## What you can make

- **Edges** from 6 to 35 mm deep: flat, ergo (curved for longer middle fingers), incut up to 20°, or sloper down to 45°.
- **Pockets**: mono, two-finger, three-finger, or a row of up to three.
- **Rollers**: unlevel (necks near the ends) or straight.
- **Housings** with three anchors under the grip:
  - **Pyramid**: four bars meet in one point.
  - **Keel**: a plate with a hole.
  - **Bolt**: a steel bolt through four legs. The inner legs keep the carabiner in the middle.

Every anchor holds the carabiner right under the grip, so the edge should stay level when you pull. This is not measured yet.

## Print it

Print every part in PETG. The housing prints on its back, the inserts upside down. A housing and one edge insert take about 265 g of filament.

[PRINTING.md](PRINTING.md) has the settings, the orientation of every part with pictures, where supports go, and a fit check.

## You also need

- A steel screwgate carabiner, and a loading pin or sling for the weights.
- Bolt anchor only: a steel bolt and nut, at least 90 mm long, in the diameter you chose.
- Roller only: a 12 mm steel rod or dowel as the axle, or the printed axle.

## Put it together

1. Roller only: put the roller between the cheeks, then push the axle through both cheeks and the roller.
2. Slide the insert into the housing until both side buttons click.
3. To swap inserts, pinch both buttons and pull the insert out by the grip.
4. Clip the carabiner to the anchor under the housing.

## Work on it

The model is OpenSCAD: `opengrips.scad` and `src/`. Every parameter can be set from the command line:

```sh
nix develop                      # OpenSCAD and the Python tools; or install OpenSCAD and python3 with trimesh
openscad -D 'part="insert_edge"' -D slot_d=15 -o edge.stl opengrips.scad
python3 web/server.py            # the configurator on http://localhost:8000
python3 tools/check_parts.py     # renders every preset and range corner, and checks the parts
```

`web/catalog.py` lists what the configurator offers: parameters, ranges and presets.

Found a problem, or printed one? [Open an issue](https://github.com/awalvie/opengrips/issues).

## License

CERN-OHL-S-2.0. See [LICENSE](LICENSE).
