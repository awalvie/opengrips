// opengrips: a 3D-printable no-hang lift block with swappable inserts.
// Render one part: openscad -D 'part="housing"' -o housing.stl opengrips.scad
// Any parameter in src/ can be overridden the same way, for example -D slot_d=25.

part = "housing";
$fn = 48;
zfit = 0;   // carabiner height for the seat fit search (part "cfit")

include <src/lib.scad>
include <src/config.scad>
include <src/latch.scad>
include <src/housing.scad>
include <src/inserts/edge.scad>
include <src/inserts/pocket.scad>
include <src/inserts/roller.scad>
include <src/refs.scad>

if (part == "housing") housing();
if (part == "insert_edge") insert_edge();
if (part == "insert_pocket") insert_pocket();
if (part == "insert_roller") insert_roller();
if (part == "roller") roller_any();
if (part == "roller_straight") roller_straight();
if (part == "axle") axle();
if (part == "finger") finger();
if (part == "carabiner") { carabiner(seat_z(), seat_rot()); if (anchor == "bar") bar_bolt(); }
if (part == "pin") loading_pin(seat_z(), seat_rot());
if (part == "cfit") carabiner(zfit, seat_rot());
