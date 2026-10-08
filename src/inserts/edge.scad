// Edge insert: a slot through the insert. The grip is the slot ceiling.
// The lip is flush with the front.

slot_w = 92; slot_h = 22; slot_d = 20; slot_r = 4;   // slot width, height at the lip, edge depth, floor corner radius
rail_t = 6;                                  // insert rail above the slot, at its thinnest
grip_r = 3;                                  // roundover on the lip
edge_angle = 0;                              // ceiling angle: + incut (rises toward the back), - sloper
ergo = 0;                                    // ergonomic curve: the lip sits this far back in the middle, 0 at the ends
edge_sb = 0;                                 // lip set back from the front (0 = flush)
core = "truss";                              // "truss": hollow core of triangle cavities, open at the back; "solid"
skin = 2.4;                                  // wall kept around the core

ins_top = floor_t + pk_h - clear;            // top of the insert
lip_t = grip_r / tan((90 - edge_angle) / 2);  // how far the lip roundover runs up the face
// ceiling height at the lip: an incut ceiling rises toward the back, and a big roundover runs up
// the face, so start lower to keep the rail
slot_ceil = ins_top - max(rail_t, lip_t + 1) - max(0, slot_d * tan(edge_angle));
slot_zc = slot_ceil - slot_h/2;              // middle of the slot at the lip
// pocket floor: slot_h of room where the ceiling is lowest, one skin above the insert bottom
pk_floor = max(floor_t + clear + skin, min(slot_ceil, slot_ceil + slot_d * tan(edge_angle)) - slot_h);

// Edge slot, seen from the side: one profile swept across the width.
// Flat, incut or shallow sloper: round lip, straight ceiling that rises toward the back by edge_angle.
// Steep sloper: no lip, one curve, tight at the face and flatter toward the back. The average
//   slope from the face to the back is -edge_angle. A sloper uses the curve only when the curve
//   is at least as round at the face as grip_r; a shallow one keeps the round lip.
// Ergo (after the Lattice MXEdge): the lip curves back in the middle by ergo, the middle is
//   deeper and the ends shallower (by up to a quarter of the depth), and the ends get a bigger lip radius.
// Every edge has a rounded inside corner at the back, so the fingertips sit on no sharp corner.
back_r = 3;                                  // inside corner at the back of the slot
ergo_r = 0.5;                                // ergo: the lip radius at the ends grows by this share
sl_th = 60;                                  // sloper curve: share of the ellipse used, in degrees
function ergo_f(x, w) = ergo > 0 ? max(0, 1 - pow(2 * x / w, 2)) : 0;   // 1 in the middle, 0 at the ends
function e_depth(f) = slot_d + min(ergo, slot_d / 2) * (f - 0.5);
function e_rad(f) = grip_r * (1 + (ergo > 0 ? ergo_r * (1 - f) : 0));
function e_br(dep) = min(back_r, dep / 3);  // a short slot gets a smaller back corner
e_dmax = e_depth(ergo > 0 ? 1 : 0.5);
e_dmin = e_depth(ergo > 0 ? 0 : 0.5);
// lip radius of the sloper curve at the face is Bv^2 / A = D tan^2(angle) / 1.5
sloper = edge_angle < 0 && e_dmin * pow(tan(-edge_angle), 2) / 1.5 >= grip_r;
e_lip_t = sloper ? 0 : e_rad(0) / tan((90 - edge_angle) / 2);
// heights: the ceiling at the lip (round lip) or the top of the curve on the face (sloper)
e_ceil = ins_top - max(rail_t, e_lip_t + 1) - e_dmax * max(0, tan(edge_angle));
e_back_top = e_ceil + e_dmax * tan(edge_angle);    // lowest top of the back wall
// the slot floor keeps one skin above the insert bottom; a steep or deep edge gets a lower slot instead
e_floor = max(floor_t + clear + skin, min(e_ceil, e_back_top) - slot_h);
e_top = ins_top + 1;

function arc(c, r, a0, a1, n) = [for (i = [0 : n]) c + r * [cos(a0 + (a1 - a0) * i / n), sin(a0 + (a1 - a0) * i / n)]];
function unit(v) = v / norm(v);

// rounded inside corner of radius r at the top of the back wall: B is the corner, a the ceiling slope there
function back_fillet(B, a, r, n = 6) = let(u = [-cos(a), -sin(a)], phi = 90 - a)
    arc(B + unit(u + [0, -1]) * r / sin(phi / 2), r, 0, 90 + a, n);

// side profile of the slot for one slice: f is the ergo weight (1 in the middle), s how far back the lip is.
// Counterclockwise in (y, z), lip at y = s, open to the front.
function e_prof(f, n = 16) = let(s = ergo * f, dep = e_depth(f), D = dep + s, br = e_br(dep))
    sloper ? let(
        A = dep / (1 - cos(sl_th)), Bv = dep * tan(-edge_angle) / sin(sl_th),
        slope = atan(-Bv * cos(sl_th) / (A * sin(sl_th))),
        fil = back_fillet([D, e_ceil - Bv * sin(sl_th)], slope, br),
        th0 = acos(1 - (fil[len(fil) - 1][0] - s) / A))
        concat([[-1, e_floor], [D, e_floor]], fil,
               [for (i = [1 : n]) let(th = th0 * (1 - i / n)) [s + A * (1 - cos(th)), e_ceil - Bv * sin(th)]],
               [[s, e_top], [-1, e_top]])
    : let(
        th = 90 - edge_angle,
        tb = br / tan((90 - edge_angle) / 2),
        r = min(e_rad(f), (dep - tb - 0.5) * tan(th / 2)),   // the lip and the back corner must fit the depth
        u = [cos(edge_angle), sin(edge_angle)],
        c = [s, e_ceil] + unit([0, 1] + u) * r / sin(th / 2))
        concat([[-1, e_floor], [D, e_floor]], back_fillet([D, e_ceil + dep * tan(edge_angle)], edge_angle, br),
               arc(c, r, edge_angle - 90, -180, n),
               [[s, e_top], [-1, e_top]]);

// the profiles swept across the width as one solid, smooth along the ergo curve
module e_sweep(w) {
    n = ergo > 0 ? 32 : 1;
    xs = [for (i = [0 : n]) -w/2 - 1 + (w + 2) * i / n];
    profs = [for (x = xs) e_prof(ergo_f(x, w))];
    m = len(profs[0]);
    pts = [for (i = [0 : n]) for (p = profs[i]) [xs[i], p[0], p[1]]];
    sides = [for (i = [0 : n - 1]) for (j = [0 : m - 1]) let(a = i*m + j, b = i*m + (j + 1) % m)
                each [[a, a + m, b + m], [a, b + m, b]]];
    polyhedron(pts, concat([[for (j = [0 : m - 1]) j]], [[for (j = [m - 1 : -1 : 0]) n*m + j]], sides));
}

// edge slot of width w: the sweep, with rounded floor corners at the two ends
module edge_slot(w) intersection() {
    e_sweep(w);
    xz(-2, pk_d + 4) translate([0, e_floor]) slot_prof(w, e_top - e_floor + 2);
}

// slot cross-section, floor at z = 0: flat sides, rounded floor corners, square top corners
// open_r > 0 (pockets): every corner rounded by open_r instead
module slot_prof(w, h, open_r = 0) translate([0, h/2]) {
    if (open_r > 0) rrect(w, h, min(open_r, w/2 - 0.01, h/2 - 0.01));
    else {
        rrect(w, h, slot_r);
        translate([0, h/4]) square([w, h/2], center = true);
    }
}

// lip roundover in the YZ plane for a corner between the vertical face and the tilted ceiling
module lip_round_2d() {
    th = 90 - edge_angle;                    // material angle at the lip
    t = grip_r / tan(th/2);
    u = [cos(edge_angle), sin(edge_angle)];  // along the ceiling
    bis = ([0, 1] + u) / norm([0, 1] + u);
    p1 = [0, slot_ceil + t]; p2 = [0, slot_ceil] + t*u;
    c = [0, slot_ceil] + bis * grip_r / sin(th/2);
    difference() {
        polygon([[-1, slot_ceil - 1], [-1, p1[1]], p1, c, p2, p2 - [0, 1]]);
        translate(c) circle(r = grip_r, $fn = 64);
    }
}

// one straight slot of width w, lip at y = 0, ceiling tilted by edge_angle
module slot_straight(w, open_r = 0) {
    floor_z = pk_floor; h = slot_ceil - floor_z;
    hull() {
        xz(-1, 0.01) translate([0, floor_z]) slot_prof(w, h, open_r);
        xz(slot_d - 0.01, 0.01) translate([0, floor_z]) slot_prof(w, h + slot_d * tan(edge_angle), open_r);
    }
    if (grip_r <= 0) { }
    else if (open_r <= 0) translate([-w/2, 0, 0]) rotate([90, 0, 90]) linear_extrude(w) lip_round_2d();
    else {
        // pockets: round the whole mouth, in thin layers that grow the opening by a quarter circle
        n = 8;
        for (i = [0 : n - 1]) {
            y0 = grip_r * i / n; y1 = grip_r * (i + 1) / n;
            e0 = grip_r - sqrt(grip_r*grip_r - (grip_r - y0)*(grip_r - y0));
            e1 = grip_r - sqrt(grip_r*grip_r - (grip_r - y1)*(grip_r - y1));
            hull() {
                xz(y0 - (i == 0 ? 1 : 0), 0.01 + (i == 0 ? 1 : 0)) translate([0, floor_z]) offset(r = e0) slot_prof(w, h, open_r);
                xz(y1, 0.01) translate([0, floor_z]) offset(r = e1) slot_prof(w, h, open_r);
            }
        }
    }
}

// plan shape of a pocket: square front, round back (a half circle for a mono, a half ellipse when wider)
module pocket_plan(w) {
    e = min(w/2, slot_d * 0.6);
    hull() {
        translate([-w/2, -5]) square([w, 5 + slot_d - e]);
        translate([0, slot_d - e]) scale([w/2, e]) circle(r = 1, $fn = 96);
    }
}

// slot of width w; open_r > 0 makes a pocket: rounded opening, round back
module slot_shape(w, open_r = 0) {
    if (open_r > 0) intersection() {
        slot_straight(w, open_r);
        translate([0, 0, floor_t + clear + skin]) linear_extrude(ins_top) pocket_plan(w);   // the mouth round stops one skin above the bottom
    }
    else slot_straight(w);
}

// edges: the swept slot. Pockets (open_r > 0): the straight slot cut to the pocket plan.
module slot_cut(w = slot_w, open_r = 0) translate([0, edge_sb, 0]) {
    if (open_r > 0) slot_shape(w, open_r);
    else edge_slot(w);
}

// Hollow core: triangle cavities open at the back. One band below the slot floor, one behind
// the slot. The rail above the slot stays solid: it presses straight on the housing top wall.
// floor_z, back_ceil, depth: slot floor, top of its back wall, and its depth (pockets by default)
module insert_core_cut(floor_z = pk_floor, back_ceil = slot_ceil + slot_d * tan(edge_angle), depth = slot_d) {
    xi = pk_w/2 - clear - lt_t - lt_gap - skin;     // stay clear of the latch arms
    z0 = floor_t + clear + skin;
    ytop = edge_sb + depth + skin;                   // behind the slot
    if (floor_z - skin - z0 > 6)
        xz(skin, pk_d) translate([-xi, z0]) truss_windows(2*xi, floor_z - skin - z0, 3);
    if (back_ceil - floor_z > 6 && pk_d - clear - ytop > 4)
        xz(ytop, pk_d) translate([-xi, floor_z]) truss_windows(2*xi, back_ceil - floor_z, 3);
}

module insert_blank() xz(0, pk_d - clear) translate([0, floor_t + pk_h/2]) rrect(pk_w - 2*clear, pk_h - 2*clear, r_in - clear);

// size mark centred on the band below the slot. The letters are about size tall and sit a little
// high; they shrink to keep 1.5 mm of band above and below, and a band too low for size 4 gets no mark.
module size_mark(label, floor_z = pk_floor) {
    mark_z = (floor_t + clear + floor_z) / 2;
    size = min(len(label) > 6 ? 7 : 9, floor_z - floor_t - clear - 3.5);
    if (size >= 4) translate([0, -0.01, mark_z]) rotate([90, 0, 0]) mirror([0, 0, 1])
        linear_extrude(1) text(label, size = size, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

function angle_label() = edge_angle > 0 ? str(" +", edge_angle, "°") : edge_angle < 0 ? str(" ", edge_angle, "°") : "";

module insert_edge() {
    difference() {
        insert_blank();
        slot_cut();
        size_mark(str(slot_d, " mm", angle_label()), e_floor);
        latch_relief();
        if (core == "truss") insert_core_cut(e_floor, e_back_top, e_dmax + ergo);
    }
    latch_arm();
}
