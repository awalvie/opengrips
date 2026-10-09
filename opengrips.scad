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
include <src/inserts/flip.scad>
include <src/refs.scad>

// for_print = true turns a printed part to the orientation in its print note and puts it on z = 0.
// The parts are modelled where they sit in the assembled block.
for_print = false;
module on_bed() {
    if (!for_print) children();
    else if (part == "housing") translate([0, 0, D]) rotate([-90, 0, 0]) children();   // back face down, pocket opening up
    else if (part == "insert_edge" || part == "insert_pocket")
        translate([0, 0, floor_t + pk_h - clear]) rotate([180, 0, 0]) children();      // top face down
    else if (part == "insert_flip") translate([0, 0, pk_d - clear]) rotate([-90, 0, 0]) children();   // on its back, front up
    else if (part == "insert_roller") translate([0, 0, -floor_t - clear]) children();  // floor down
    else if (part == "roller" || part == "roller_straight")
        translate([0, 0, roll_len/2]) rotate([0, 90, 0]) translate([0, -grip_y, -roll_z]) children();   // on one end
    else if (part == "axle") translate([0, -grip_y, axle_d/2 - roll_z]) children();     // lying down
    else children();
}

on_bed() {
    if (part == "housing") housing();
    if (part == "insert_edge") insert_edge();
    if (part == "insert_pocket") insert_pocket();
    if (part == "insert_flip") insert_flip();
    if (part == "insert_roller") insert_roller();
    if (part == "roller") roller_any();
    if (part == "roller_straight") roller_straight();
    if (part == "axle") axle();
}
if (part == "finger") finger();
if (part == "carabiner") carabiner(seat_z(), seat_rot());
if (part == "pin") loading_pin(seat_z(), seat_rot());
if (part == "cfit") carabiner(zfit, seat_rot());
