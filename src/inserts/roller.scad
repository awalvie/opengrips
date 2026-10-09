// Roller insert: a U frame (floor + two cheeks) that carries an axle and a roller.
// The axle runs through both cheeks. The housing side walls keep it from sliding out.

ins_floor = 7;                               // insert floor
cheek_t = 8;                                 // side cheeks that carry the axle
cheek_nose = 16;                             // cheek nose around the axle: thick wall in front of it, sticks out 8 mm
// Unlevel roller: profile measured from a reference photo (both halves averaged, so it is
// mirrored about its middle), scaled to a 28 mm body. Deep necks about 12% in from each
// end (18 mm), lips just under the body width (26 mm). Profile as [fraction of length, diameter].
roll_profile = [[0, 25.04], [0.025, 26.02], [0.05, 24.21], [0.075, 21.25], [0.1, 18.94], [0.125, 18.28], [0.15, 19.6], [0.175, 20.75], [0.2, 21.91], [0.225, 22.56], [0.25, 23.55], [0.275, 24.38], [0.3, 25.04], [0.325, 25.86], [0.35, 26.19], [0.375, 26.85], [0.4, 27.01], [0.425, 27.67], [0.45, 27.67], [0.475, 28.0], [0.5, 28.0], [0.525, 28.0], [0.55, 27.67], [0.575, 27.67], [0.6, 27.01], [0.625, 26.85], [0.65, 26.19], [0.675, 25.86], [0.7, 25.04], [0.725, 24.38], [0.75, 23.55], [0.775, 22.56], [0.8, 21.91], [0.825, 20.75], [0.85, 19.6], [0.875, 18.28], [0.9, 18.94], [0.925, 21.25], [0.95, 24.21], [0.975, 26.02], [1, 25.04]];
roll_type = "unlevel";                       // "unlevel" (profile above) or "straight"
roll_d = 28;                                 // body diameter; the unlevel profile scales with it
axle_d = 12; spin_clear = 0.5; end_gap = 0.5;
roll_top_gap = 2;                            // under the housing top wall, at the big lip
roll_z = ins_top - roll_top_gap - roll_d/2;
roll_len = pk_w - 2*clear - 2*cheek_t - 2*end_gap;
bore = axle_d + spin_clear;

module insert_roller() {
    z0 = ins_bot; iw = pk_w - 2*clear; id = pk_d - clear; ih = pk_h - 2*clear;
    difference() {
        intersection() {   // clipped to the rounded insert outline
            union() {
                translate([-iw/2, 0, z0]) cube([iw, id, ins_floor]);
                for (s = [-1, 1]) translate([s > 0 ? iw/2 - cheek_t : -iw/2, 0, z0]) cube([cheek_t, id, ih + 1]);   // past the top: the clip cuts it
                for (s = [-1, 1])
                    translate([s > 0 ? iw/2 - cheek_t : -iw/2, grip_y, roll_z]) rotate([0, 90, 0]) cylinder(r = cheek_nose, h = cheek_t, $fn = 96);
            }
            xz(min(0, grip_y - cheek_nose), id - min(0, grip_y - cheek_nose)) translate([0, floor_t + pk_h/2]) rrect(iw, ih, r_in - clear);
        }
        translate([0, grip_y, roll_z]) rotate([0, 90, 0]) cylinder(d = axle_d + clear, h = iw + 2, center = true);
        latch_relief(extra = cheek_t - lt_t - lt_gap + 1, down = true);
        // size mark on the front of the floor, in the middle
        translate([0, -eps, z0 + ins_floor/2]) rotate([90, 0, 0]) mirror([0, 0, 1])
            linear_extrude(1) text(str("roller ", roll_d, " mm"), size = 4, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    }
    latch_arm(down = true);
}

module roller() {   // unlevel
    translate([0, grip_y, roll_z]) rotate([0, 90, 0]) translate([0, 0, -roll_len/2])
        rotate_extrude($fn = 64) polygon(concat(
            [[bore/2, 0]],
            [for (p = roll_profile) [p[1]/2 * roll_d/28, p[0]*roll_len]],
            [[bore/2, roll_len]]));
}

module roller_any() {
    if (roll_type == "straight") roller_straight(); else roller();
}

module roller_straight() {
    translate([0, grip_y, roll_z]) rotate([0, 90, 0]) difference() {
        cylinder(d = roll_d, h = roll_len, center = true, $fn = 64);
        cylinder(d = bore, h = roll_len + 2, center = true);
    }
}

module axle() {
    translate([0, grip_y, roll_z]) rotate([0, 90, 0]) cylinder(d = axle_d, h = pk_w - 2*clear - 0.5, center = true);
}
