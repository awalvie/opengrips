// Reference models for renders and fit checks. Not printed.

module finger() {
    // comes down the front face, fingertip hooks up into the slot
    fx = 20; r = 7.5; tipz = e_ceil - r;
    seg([fx, edge_sb + slot_d - 1 - r, tipz], [fx, -9, tipz], 15);
    seg([fx, -9, tipz], [fx, -10, H + 4], 16);
    seg([fx, -10, H + 4], [fx, -26, H + 40], 18);
}

car_L = 105;   // carabiner length, rod centre to rod centre

// half a bend of radius r around c in the YZ plane: up = 1 the top half, -1 the bottom half
module bend(c, r, d, up) translate([0, c[0], c[1]]) intersection() {
    rotate([0, 90, 0]) rotate_extrude() translate([r, 0]) circle(d = d);
    translate([-d, -r - d, up > 0 ? 0 : -r - d]) cube([2*d, 2*(r + d), r + d]);
}

// Asymmetric D wire gate, after a reference photo. zt: rod centreline at the top of the nose end;
// rot: turn about Z (90 = carabiner plane across the width). The nose end sits on the anchor and the
// seat heights are fitted to it: keep R and rod. Then a straight spine down the back to one big
// rounded corner, a straight side up the front to the hinge, and a wire loop from there to the nose.
module carabiner(zt, rot = 0) translate([0, grip_y, 0]) rotate([0, 0, rot]) translate([0, -grip_y, 0]) {
    rod = 10; y0 = grip_y; R = 16; Rb = 18;
    p3 = function(q) [0, q[0], q[1]];
    cb = [y0 + R - Rb, zt - car_L + Rb];              // big corner: the spine runs straight into it
    hinge = [y0 - 34, zt - 62];
    nose = [y0 - R, zt - R];
    // the front side leaves the big corner on the tangent toward the hinge
    d = hinge - cb; t = atan2(d[1], d[0]) + acos(Rb / norm(d)) - 360;
    corner = [for (i = [0 : 16]) let(a = t * i / 16) cb + Rb * [cos(a), sin(a)]];
    g = (nose - hinge) / norm(nose - hinge);          // along the gate, hinge to nose
    bend([y0, zt - R], R, rod, 1);
    seg(p3([y0 + R, zt - R]), p3([y0 + R, cb[1]]), rod);   // spine
    for (i = [0 : 15]) seg(p3(corner[i]), p3(corner[i + 1]), rod);
    seg(p3(corner[16]), p3(hinge), rod);              // front side
    seg(p3(hinge), p3(hinge + 5 * g), rod);           // hinge boss
    seg(p3(nose), p3(nose - 7 * g), rod);             // nose hook
    // wire gate: two strands from the hinge, joined where they hook over the nose
    w = 2.5; wx = rod/2 + w/2;
    a = p3(hinge + 3 * g); b = p3(nose - 4 * g);
    for (s = [-1, 1]) seg(a + [s * wx, 0, 0], b + [s * wx, 0, 0], w);
    seg(a + [-wx, 0, 0], a + [wx, 0, 0], w);
    seg(b + [-wx, 0, 0], b + [wx, 0, 0], w);
    seg(p3([y0 + R, zt - R - 30]), p3(nose - 7 * g), w);   // the thin bar from the spine to the nose
}

module loading_pin(zt, rot = 0) translate([0, grip_y, 0]) rotate([0, 0, rot]) translate([0, -grip_y, 0]) {
    zb = zt - car_L + 2;
    translate([0, grip_y, zb - 14]) rotate([90, 0, 0]) rotate_extrude() translate([14, 0]) circle(d = 8);
    translate([0, grip_y, zb - 28]) rotate([180, 0, 0]) cylinder(d = 30, h = 220);
    translate([0, grip_y, zb - 28 - 40]) rotate([180, 0, 0]) cylinder(d = 120, h = 8);
}
