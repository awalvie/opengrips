// Fit test: a thin ring of the housing pocket and a thin insert outline, full size, so a
// printer that prints wide or flares the first layer shows it before the full kit.

fit_d = 8;                                   // depth of both parts
fit_t = 3;                                   // ring top and floor; the sides keep side_t
fit_wall = 2.4;                              // frame wall

// the pocket with its front bevel, in a ring
module fit_ring() difference() {
    xz(0, fit_d) translate([0, floor_t + pk_h/2]) rrect(W, pk_h + 2*fit_t, corner);
    pocket_cut();
}

// the insert outline, open in the middle
module fit_frame() xz(0, fit_d) translate([0, floor_t + pk_h/2]) difference() {
    rrect(pk_w - 2*clear, pk_h - 2*clear, r_in - clear);
    rrect(pk_w - 2*clear - 2*fit_wall, pk_h - 2*clear - 2*fit_wall, 1);
}

// Latch tester: one insert cheek with the real latch arm, in a short channel with the real window.
fit_cw = lt_t + lt_gap + 4;                   // cheek width: arm, flex room, 4 mm wall
fit_cz0 = lt_z0 - 3; fit_cz1 = lt_z1 + 3;      // cheek height
fit_cwall = 3;                                 // channel top, floor, inner wall and back
fit_tab = 12;                                 // pull tab in front of the cheek

module fit_cheek() {
    xo = pk_w/2 - clear;
    difference() {
        intersection() {
            insert_blank();
            translate([xo - fit_cw, -1, fit_cz0]) cube([fit_cw + 1, pk_d + 1, fit_cz1 - fit_cz0]);
        }
        latch_relief(band = true);
    }
    intersection() { latch_arm(band = true); translate([0, -1, 0]) cube([W, D, H]); }   // the right arm only
    translate([xo - fit_cw, -fit_tab, fit_cz0]) cube([4, fit_tab + eps, fit_cz1 - fit_cz0]);
}

// the side wall with its window, and a channel that holds the cheek against it with the insert gap
module fit_channel() {
    x0 = pk_w/2 - 2*clear - fit_cw; z0 = fit_cz0 - clear; z1 = fit_cz1 + clear;
    difference() {
        translate([x0 - fit_cwall, 0, z0 - fit_cwall]) cube([W/2 - x0 + fit_cwall, D, z1 - z0 + 2*fit_cwall]);
        translate([x0, -1, z0]) cube([pk_w/2 - x0, pk_d + 1, z1 - z0]);
        hull() {   // lead-in for the cheek and its button, like the housing bevel
            translate([x0 - bevel, -1, z0 - bevel]) cube([pk_w/2 - x0 + 2*bevel, 1 + eps, z1 - z0 + 2*bevel]);
            translate([x0, bevel, z0]) cube([pk_w/2 - x0, eps, z1 - z0]);
        }
        latch_windows();
    }
}
