// Housing: a box around the pocket, with an anchor under it.

anchor = "pyramid";        // "pyramid" or "keel". Every anchor holds the carabiner on the anchor plane.

style = "truss";           // "truss": triangle windows in the back wall; "solid"
win_t = 5;                 // web between the windows

r_out = 2.5;               // round on every body edge
corner = 6;                // corner radius in the front view
bevel = 1.5;               // bevel around the pocket opening, also a lead-in for the insert

// Pyramid anchor (Lanta style): four flat bars from the bottom corners meet in one
// point under the anchor plane. Bars rise at 25 degrees.
leg_x = W/2 - 6; leg_z = 3;                  // bar roots, inside the floor
leg_yf = 5; leg_yb = D - 4.5;                // front and back bar centrelines at the root
bar_tf = 7; bar_wf = 10;                     // front bars: thickness (front view) x depth
bar_tb = 6; bar_wb = 7;                      // back bars
bar_angle = 25;
bar_r = 1.5;                                 // edge round on bars and apex node
node_len = 8;                                // apex node: hull of the last node_len mm of every bar
tri_apex = leg_z - leg_x * tan(bar_angle);   // the point
tri_rod_z = tri_apex + 12.35;                // carabiner seat: highest with the bend hooked over the node and no overlap (found by a fit search at 25 degrees)

function pyramid_legs() = [for (sx = [-1, 1], l = [[leg_yf, bar_tf, bar_wf], [leg_yb, bar_tb, bar_wb]])
    [[sx*leg_x, l[0], leg_z], l[1], l[2]]];

module anchor_pyramid() {
    p = [0, grip_y, tri_apex];
    for (l = pyramid_legs()) bar(l[0], p, l[1], l[2], bar_r);
    // the node is 2*eps fatter than the bars, so their faces never meet exactly
    hull() for (l = pyramid_legs())
        bar(p + (l[0] - p) * node_len / norm(l[0] - p), p, l[1] + 2*eps, l[2] + 2*eps, bar_r);
}

// Keel: a full-width triangle plate under the housing, with a hole through it. It carries the
// load straight out to the side walls, like the pyramid. The carabiner rests on the bottom of
// the hole, right under the anchor plane.
keel_t = 10;                                 // plate thickness (front to back)
keel_hole = 16;                              // hole diameter
keel_wall = 7;                               // material around the hole
keel_hz = -(keel_hole/2 + 6);                // hole centre height

keel_xe = W/2 - 3; keel_rb = keel_hole/2 + keel_wall;
module keel_profile() hull() {
    translate([-keel_xe, 0]) square([2*keel_xe, 3]);
    translate([0, keel_hz]) circle(r = keel_rb, $fn = 64);
}

// triangle windows, one each side, for less plastic and the look of the pyramid
module keel_windows() {
    zs = keel_hz - keel_rb;
    for (m = [0, 1]) mirror([m, 0])
        offset(r = 2) offset(delta = -2)
            polygon([[keel_rb + 4, -3], [keel_xe - 18, -3], [keel_rb + 4, zs * (1 - (keel_rb + 4) / keel_xe) + 7]]);
}

module anchor_keel() difference() {
    hull() {
        xz(grip_y - keel_t/2 + 1, keel_t - 2) keel_profile();
        xz(grip_y - keel_t/2, keel_t) offset(-1) keel_profile();
    }
    xz(grip_y - keel_t/2 - 1, keel_t + 2) keel_windows();
    translate([0, grip_y, keel_hz]) rotate([90, 0, 0]) cylinder(d = keel_hole, h = keel_t + 2, center = true, $fn = 64);
}

module anchor_any() {
    if (anchor == "pyramid") anchor_pyramid();
    if (anchor == "keel") anchor_keel();
}

// height of the carabiner rod centreline at the top of its bend
function seat_z() = anchor == "keel" ? keel_hz - keel_hole/2 + 5.5 + (16 - sqrt(16*16 - keel_t*keel_t/4))   // bend drops at the fin faces
                  : tri_rod_z;

module housing_shell() {
    minkowski() {
        xz(r_out, D - 2*r_out) translate([0, H/2]) rrect(W - 2*r_out, H - 2*r_out, corner - r_out);
        sphere(r = r_out, $fn = 24);
    }
}

module pocket_cut() {
    xz(-1, pk_d + 1) translate([0, floor_t + pk_h/2]) rrect(pk_w, pk_h, r_in);
    hull() {
        xz(-1, 1 + eps) translate([0, floor_t + pk_h/2]) rrect(pk_w + 2*bevel, pk_h + 2*bevel, r_in + bevel);
        xz(bevel, eps) translate([0, floor_t + pk_h/2]) rrect(pk_w, pk_h, r_in);
    }
}

// triangle windows through the back wall, and the name on top
module housing_style_cut() {
    zs0 = floor_t + 3; zs1 = H - top_t - 3;
    L = zs1 - zs0;
    bw = pk_w - 8;
    xz(pk_d - 1, back_t + 2) translate([-bw/2, zs0]) truss_windows(bw, L, win_t);
    translate([0, D/2, H - 0.6]) linear_extrude(1)
        text("opengrips", size = 8, spacing = 1.15, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

module housing() {
    difference() {
        union() {
            housing_shell();
            anchor_any();
        }
        pocket_cut();
        latch_windows();
        if (style == "truss") housing_style_cut();
    }
}
