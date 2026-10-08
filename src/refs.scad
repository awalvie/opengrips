// Reference models for renders and fit checks. Not printed.

module finger() {
    // comes down the front face, fingertip hooks up into the slot
    fx = 20; r = 7.5; tipz = e_ceil - r;
    seg([fx, edge_sb + slot_d - 1 - r, tipz], [fx, -9, tipz], 15);
    seg([fx, -9, tipz], [fx, -10, H + 4], 16);
    seg([fx, -10, H + 4], [fx, -26, H + 40], 18);
}

// zt: rod centreline at the top of the bend; rot: turn about Z (90 = carabiner plane across the width)
module carabiner(zt, rot = 0) translate([0, grip_y, 0]) rotate([0, 0, rot]) translate([0, -grip_y, 0]) {
    rod = 10; y0 = grip_y; L = 75; R = 16;
    for (yy = [y0 - R, y0 + R]) seg([0, yy, zt - R], [0, yy, zt - L + R], rod);
    for (b = [[zt - R, 1], [zt - L + R, -1]]) translate([0, y0, b[0]]) intersection() {
        rotate([0, 90, 0]) rotate_extrude() translate([R, 0]) circle(d = rod);
        translate([-rod, -R - rod, b[1] > 0 ? 0 : -R - rod]) cube([2*rod, 2*(R + rod), R + rod]);
    }
}

module loading_pin(zt, rot = 0) translate([0, grip_y, 0]) rotate([0, 0, rot]) translate([0, -grip_y, 0]) {
    zb = zt - 75 + 2;
    translate([0, grip_y, zb - 14]) rotate([90, 0, 0]) rotate_extrude() translate([14, 0]) circle(d = 8);
    translate([0, grip_y, zb - 28]) rotate([180, 0, 0]) cylinder(d = 30, h = 220);
    translate([0, grip_y, zb - 28 - 40]) rotate([180, 0, 0]) cylinder(d = 120, h = 8);
}
