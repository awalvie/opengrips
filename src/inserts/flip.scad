// Flip insert: two edges in one insert. The top edge is the grip; the bottom edge hangs upside
// down under it. Turn the insert over, front still to the front, to swap them. The housing has
// latch windows at the top and the bottom, so it clicks in either way up.
// Each edge is the edge-insert sweep, flat or ergo, with its floor on the web in the middle.

top_d = 20; top_r = 3; top_ergo = 0;         // top edge: depth, lip roundover, ergo curve
bot_d = 10; bot_r = 2; bot_ergo = 0;         // bottom edge
flip_web = 6.4;                              // wall between the two slot floors
flip_zc = floor_t + pk_h/2;                  // middle of the insert height
lbl_t = 0.6;                                 // label depth in the back wall of the slot

// one edge in the top half: slot and label. The slot takes all the room down to the web.
module flip_edge(d, r, e) let($e_d = d, $e_r = r, $e_angle = 0, $e_ergo = e, $e_h = pk_h, $e_floor_min = flip_zc + flip_web/2) {
    edge_slot(slot_w);
    // label on the flat band of the back wall, under the round corner at its top. Cut by the slot
    // moved lbl_t back, so it keeps its depth on the curved back wall of an ergo edge.
    z0 = e_floor(); z1 = e_ceil() - e_br(e_dmin());
    intersection() {
        translate([0, lbl_t, 0]) e_sweep(slot_w);
        translate([0, pk_d, (z0 + z1) / 2]) rotate([90, 0, 0])
            linear_extrude(pk_d) text(str(d, " mm"), size = 7, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    }
}

// turned over: 180 degrees about the front-back axis, through the middle of the insert
module turned() translate([0, 0, flip_zc]) rotate([0, 180, 0]) translate([0, 0, -flip_zc]) children();

module insert_flip() {
    difference() {
        insert_blank();
        flip_edge(top_d, top_r, top_ergo);
        turned() flip_edge(bot_d, bot_r, bot_ergo);
        latch_relief(band = true);
    }
    latch_arm(band = true);
}
