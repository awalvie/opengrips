// Squeeze latch: one flex arm in each insert side wall. Its button snaps into a window
// in the housing side wall, near the front. Pinch both buttons to release.

lt_z0 = floor_t + 6; lt_z1 = floor_t + 18;   // arm band above the pocket floor, clear of the slot and the axle
lt_len = 40;                                 // arm length, root at the back, free end at the front
lt_t = 2.4; lt_gap = 5;                      // arm thickness; room to flex in past the housing wall
lt_y0 = 4; lt_y1 = 16;                       // button: front face square (catch), back edge ramped (lead-in)
lt_ramp = 5;

// housing side: the buttons sit flush in these windows. A second pair, mirrored about the
// middle of the pocket, takes the buttons of an insert that is turned over.
module latch_windows() {
    for (m = [0, 1], t = [0, 1]) mirror([m, 0, 0])
        translate([0, 0, floor_t + pk_h/2]) mirror([0, 0, t]) translate([0, 0, -floor_t - pk_h/2])
            translate([pk_w/2 - 1, lt_y0 - clear, lt_z0 + 1 - clear]) cube([side_t + 3, lt_y1 - lt_y0 + 2*clear, lt_z1 - lt_z0 - 2 + 2*clear]);
}

// The arm must start on the print bed. Inserts that print upside down (top on the bed) run
// the arm up to the insert top; inserts that print upright (down = true) run it down to the floor.
lt_bot = floor_t + clear;                    // insert bottom
lt_top = floor_t + pk_h - clear;             // insert top

// insert side: room for the arms to flex. extra widens it inward, so a thin cheek leaves no sliver.
module latch_relief(extra = 0, down = false) {
    xo = pk_w/2 - clear;
    z0 = down ? lt_bot - 1 : lt_z0 - 1;
    z1 = down ? lt_z1 + 1 : lt_top + 1;
    for (m = [0, 1]) mirror([m, 0, 0])
        translate([xo - lt_t - lt_gap - extra, -1, z0]) cube([lt_t + lt_gap + extra + 1, lt_len + 1, z1 - z0]);
}

// insert side: arms and buttons. The button side that faces the bed has a 45 degree chamfer.
module latch_arm(down = false) {
    xo = pk_w/2 - clear; bh = W/2 - xo - 0.3;   // button face just inside the housing side
    z0 = down ? lt_bot : lt_z0;
    z1 = down ? lt_z1 : lt_top;
    b0 = lt_z0 + 1; b1 = lt_z1 - 1;             // button height
    for (m = [0, 1]) mirror([m, 0, 0]) {
        intersection() {   // the insert has rounded corners; keep the arm inside them
            translate([xo - lt_t, 0, z0]) cube([lt_t, lt_len + 1, z1 - z0]);
            insert_blank();
        }
        hull() {
            translate([0, 0, down ? b0 + bh : b0]) linear_extrude(b1 - b0 - bh) button_2d(xo, bh);
            translate([0, 0, b0]) linear_extrude(b1 - b0) intersection() {
                button_2d(xo, bh);
                translate([xo - 1, -100]) square([1.01, 200]);
            }
        }
    }
}

module button_2d(xo, bh) polygon([[xo - 0.5, lt_y0], [xo + bh, lt_y0], [xo + bh, lt_y1 - lt_ramp], [xo, lt_y1], [xo - 0.5, lt_y1]]);
