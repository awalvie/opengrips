# Printing opengrips

These settings are a starting point. They are not load-tested yet: see the status note in the [README](README.md).

## Material

Print every part in **PETG**. PLA is brittle in the cold and creeps when it is warm, for example in a car.

## Settings

| Part | Walls | Infill |
| --- | --- | --- |
| Housing, edge and pocket inserts, roller frame | 4 | 40% gyroid |
| Roller | 3 | 20% |
| Printed axle | 4 | 100% |

Nozzle 0.4 mm, layer height 0.2 mm. These parts carry your pull, so do not cut walls or infill to save time.

## Orientation and supports

Every part has one right way up. It keeps the load along the layers and the grip smooth.

| Part | How it goes on the bed | Supports |
| --- | --- | --- |
| Housing | Back face down, pocket opening up | Automatic, under the anchor |
| Edge or pocket insert | Upside down, top face down | Under the slot floor only. Block them inside the hollow core: the core roofs bridge. |
| Roller frame | Upright, floor down | Under the two cheeks, where the latch arms are cut away |
| Roller | Standing on one end | None |
| Printed axle | Lying down | None |

| Housing | Edge insert | Pocket insert |
| --- | --- | --- |
| ![Housing on the bed](docs/img/print-housing.png) | ![Edge insert on the bed](docs/img/print-insert_edge.png) | ![Pocket insert on the bed](docs/img/print-insert_pocket.png) |

| Roller frame | Roller | Axle |
| --- | --- | --- |
| ![Roller frame on the bed](docs/img/print-insert_roller.png) | ![Roller on the bed](docs/img/print-roller.png) | ![Axle on the bed](docs/img/print-axle.png) |

To turn a part to this orientation when you render it yourself, add `-D for_print=true`:

```sh
openscad -D 'part="housing"' -D for_print=true -o housing.stl opengrips.scad
```

## Filament

PrusaSlicer 2.9.6 with the settings above, PETG at 1.27 g/cm³, default parts, without supports:

| Part | Filament |
| --- | --- |
| Housing, pyramid anchor | 128 g |
| Housing, keel anchor | 127 g |
| Housing, bolt anchor | 129 g |
| Edge insert, 20 mm | 135 g |
| Pocket insert, three-finger | 149 g |
| Roller frame | 54 g |
| Roller, unlevel | 25 g |
| Roller, straight | 30 g |
| Printed axle | 17 g |

Automatic supports add about 18 g to the pyramid housing and about 6 g to the roller frame. A housing and one edge insert need about 265 g, so one 1 kg spool makes a housing and five or six inserts.

## Fit check

1. Slide the insert into the housing. Both side buttons must click into their windows.
2. Pinch both buttons and pull the insert out by the grip. It must come out without force.
3. If the insert binds, look at the face that was on the bed: a flared first layer ("elephant's foot") is the usual cause. Trim or sand that edge, or turn on elephant-foot compensation in your slicer.

## Before the first session

- Remove all supports, and check that none are left inside the slot or the latch windows.
- Look for split layers at the anchor, around the latch arms and at the grip. Do not use a part with a crack.
- Hang the block from the carabiner and load it slowly, by hand, before you pull hard.
