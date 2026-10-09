// Flip insert: two grips in one insert, each an edge or a pocket. The top grip is in use; the
// bottom one hangs upside down under it. Turn the insert over, front still to the front, to swap
// them. The housing has latch windows at the top and the bottom, so it clicks in either way up.
// Each grip has its floor on the web in the middle. An edge is the edge-insert sweep, flat or
// ergo; a pocket is one pocket of the pocket insert.

top_kind = "edge"; top_d = 20; top_r = 3; top_ergo = 0;   // top grip: "edge", "mono", "two" or "three"; depth, lip roundover, ergo curve (edge only)
bot_kind = "edge"; bot_d = 10; bot_r = 2; bot_ergo = 0;   // bottom grip
flip_web = 6.4;                              // wall between the two slot floors
flip_zc = floor_t + pk_h/2;                  // middle of the insert height
lbl_t = 0.6;                                 // label depth in the back wall of the slot

function pocket_kind_w(kind) = kind == "mono" ? 22 : kind == "two" ? 40 : 58;

// one grip in the top half, with its label. The slot takes all the room down to the web.
// A pocket has the ceiling of an edge with the same lip; its mouth round runs up the face like a lip.
module flip_grip(kind, d, r, e)
    let($e_d = d, $e_r = r, $e_angle = 0, $e_ergo = kind == "edge" ? e : 0, $e_h = pk_h, $e_floor_min = flip_zc + flip_web/2)
    let($p_floor = e_floor(), $p_ceil = e_ceil(), $p_mouth = r) {
    z0 = e_floor(); z1 = e_ceil();
    if (kind == "edge") {
        edge_slot(slot_w);
        // label on the flat band of the back wall, under the round corner at its top. Cut by the slot
        // moved lbl_t back, so it keeps its depth on the curved back wall of an ergo edge.
        intersection() {
            translate([0, lbl_t, 0]) e_sweep(slot_w);
            translate([0, pk_d, (z0 + z1 - e_br(e_dmin())) / 2]) rotate([90, 0, 0])
                linear_extrude(pk_d) text(str(d, " mm"), size = 7, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
        }
    } else {
        w = pocket_kind_w(kind);
        slot_shape(w, pocket_r);
        // label on the front face beside the pocket (its back is round), clear of the latch relief
        x0 = w/2 + r + 2; x1 = pk_w/2 - clear - lt_t - lt_gap - 2;
        translate([(x0 + x1) / 2, -eps, (z0 + z1) / 2]) rotate([90, 0, 0]) mirror([0, 0, 1])
            linear_extrude(1) text(str(d), size = 7, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    }
}

// turned over: 180 degrees about the front-back axis, through the middle of the insert
module turned() translate([0, 0, flip_zc]) rotate([0, 180, 0]) translate([0, 0, -flip_zc]) children();

module insert_flip() {
    difference() {
        insert_blank();
        flip_grip(top_kind, top_d, top_r, top_ergo);
        turned() flip_grip(bot_kind, bot_d, bot_r, bot_ergo);
        latch_relief(band = true);
    }
    latch_arm(band = true);
}
