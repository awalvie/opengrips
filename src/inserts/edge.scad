// Edge insert: a slot through the insert. The grip is the slot ceiling.
// The lip is flush with the front.

slot_w = 92; slot_h = 22; slot_d = 20; slot_r = 4;   // slot width, height at the lip, edge depth, floor corner radius
rail_t = 6;                                  // insert rail above the slot, at its thinnest
grip_r = 3;                                  // roundover on the lip
edge_angle = 0;                              // ceiling angle: + incut (rises toward the back), - sloper
ergo = 0;                                    // ergonomic curve: the lip sits this far back in the middle, 0 at the ends
edge_sb = 0;                                 // lip set back from the front (0 = flush)
skin = 2.4;                                  // wall kept under the slot floor

ins_top = floor_t + pk_h - clear;            // top of the insert
lip_t = grip_r / tan((90 - edge_angle) / 2);  // how far the lip roundover runs up the face
// ceiling height at the lip: an incut ceiling rises toward the back, and a big roundover runs up
// the face, so start lower to keep the rail. A pocket rounds its whole mouth: that round runs its
// full radius up the face at any angle, and the full rail stays above it. Where the slot needs the
// room (steep or deep), the round gives way before the slot height.
pk_round_room = ins_top - rail_t - abs(slot_d * tan(edge_angle)) - (floor_t + clear + skin) - slot_h;
slot_ceil = ins_top - max(rail_t + min(grip_r, max(0, pk_round_room)), lip_t + 1) - max(0, slot_d * tan(edge_angle));
mouth_r = min(grip_r, ins_top - rail_t - slot_ceil);   // pocket mouth round
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
// The sweep reads its settings from $ variables. They default to the settings above; a part with
// more than one edge sets them again around each one.
$e_d = slot_d; $e_r = grip_r; $e_angle = edge_angle; $e_ergo = ergo; $e_h = slot_h;
$e_floor_min = floor_t + clear + skin;      // lowest the slot floor goes
$p_floor = pk_floor; $p_ceil = slot_ceil; $p_mouth = mouth_r;   // pocket floor, ceiling at the lip, mouth round
back_r = 3;                                  // inside corner at the back of the slot
ergo_r = 0.5;                                // ergo: the lip radius at the ends grows by this share
sl_th = 60;                                  // sloper curve: share of the ellipse used, in degrees
function ergo_f(x, w) = $e_ergo > 0 ? max(0, 1 - pow(2 * x / w, 2)) : 0;   // 1 in the middle, 0 at the ends
function e_depth(f) = $e_d + min($e_ergo, $e_d / 2) * (f - 0.5);
function e_rad(f) = $e_r * (1 + ($e_ergo > 0 ? ergo_r * (1 - f) : 0));
function e_br(dep) = min(back_r, dep / 3);  // a short slot gets a smaller back corner
function e_dmax() = e_depth($e_ergo > 0 ? 1 : 0.5);
function e_dmin() = e_depth($e_ergo > 0 ? 0 : 0.5);
// lip radius of the sloper curve at the face is Bv^2 / A = D tan^2(angle) / 1.5
function sloper() = $e_angle < 0 && e_dmin() * pow(tan(-$e_angle), 2) / 1.5 >= $e_r;
function e_lip_t() = sloper() ? 0 : e_rad(0) / tan((90 - $e_angle) / 2);
// heights: the ceiling at the lip (round lip) or the top of the curve on the face (sloper)
function e_ceil() = ins_top - max(rail_t, e_lip_t() + 1) - e_dmax() * max(0, tan($e_angle));
function e_back_top() = e_ceil() + e_dmax() * tan($e_angle);    // lowest top of the back wall
// the slot floor keeps one skin above the insert bottom; a steep or deep edge gets a lower slot instead
function e_floor() = max($e_floor_min, min(e_ceil(), e_back_top()) - $e_h);
e_top = ins_top + 1;

function arc(c, r, a0, a1, n) = [for (i = [0 : n]) c + r * [cos(a0 + (a1 - a0) * i / n), sin(a0 + (a1 - a0) * i / n)]];
function unit(v) = v / norm(v);

// rounded inside corner of radius r at the top of the back wall: B is the corner, a the ceiling slope there
function back_fillet(B, a, r, n = 6) = let(u = [-cos(a), -sin(a)], phi = 90 - a)
    arc(B + unit(u + [0, -1]) * r / sin(phi / 2), r, 0, 90 + a, n);

// side profile of the slot for one slice: f is the ergo weight (1 in the middle), s how far back the lip is.
// Counterclockwise in (y, z), lip at y = s, open to the front.
function e_prof(f, n = 16) = let(s = $e_ergo * f, dep = e_depth(f), D = dep + s, br = e_br(dep),
                                 e_ceil = e_ceil(), e_floor = e_floor(), edge_angle = $e_angle)
    sloper() ? let(
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
    n = $e_ergo > 0 ? 32 : 1;
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
    xz(-2, pk_d + 4) translate([0, e_floor()]) slot_prof(w, e_top - e_floor() + 2);
}

// slot cross-section, floor at z = 0: flat sides, rounded floor corners, square top corners
// open_r > 0 (pockets): every corner rounded by open_r instead
module slot_prof(w, h) translate([0, h/2]) {
    rrect(w, h, slot_r);
    translate([0, h/4]) square([w, h/2], center = true);
}

// pocket slot, one solid: rounded openings from the face to the back. Toward the face the opening
// grows by a quarter circle of mouth_r, the mouth round. One loft, because a union of hulls leaves
// slivers in the browser's renderer. Like the edge sweep, it reads its settings from $ variables.
module pocket_loft(w, open_r) {
    floor_z = $p_floor; h = $p_ceil - floor_z; slot_d = $e_d; edge_angle = $e_angle;
    n = 8; m = 12;                           // rings in the mouth round; steps in each corner arc
    r = max(0, $p_mouth);
    e = function(y) y < 0 ? r : y >= r ? 0 : r - sqrt(r*r - (r - y)*(r - y));   // mouth offset at y
    ceil_at = function(y) h + (y + 1) / (slot_d + 1) * slot_d * tan(edge_angle);   // tilted ceiling: h at y = -1, h + slot_d tan at the back
    // ring at y: the opening offset by o, ceiling at hc above the floor; counterclockwise, corner arcs of m steps
    function ring(y, o, hc) = let(a = w/2 + o, zb = floor_z - o, zt = floor_z + hc + o,
                                  rr = min(open_r + o, a - eps, (zt - zb)/2 - eps))
        [for (c = [[a - rr, zt - rr, 0], [-a + rr, zt - rr, 90], [-a + rr, zb + rr, 180], [a - rr, zb + rr, 270]], j = [0 : m])
            let(q = c[2] + 90 * j / m) [c[0] + rr * cos(q), y, c[1] + rr * sin(q)]];
    // the mouth rings keep the higher of the round and the tilted ceiling; behind the round, the
    // tilted ceiling alone (a small step where a sloper ceiling drops below the round)
    mouth = [for (y = concat([-1], r > 0 ? [for (i = [0 : n]) r * i / n] : [])) ring(y, e(y), max(h, ceil_at(y) - e(y)))];
    rings = concat(mouth, slot_d > r + 2*eps ? [ring(r + eps, 0, ceil_at(r + eps)), ring(slot_d, 0, ceil_at(slot_d))] : []);
    k = 4 * (m + 1); last = len(rings) - 1;
    polyhedron([for (g = rings) each g], concat(
        [[for (j = [k - 1 : -1 : 0]) j]], [[for (j = [0 : k - 1]) last*k + j]],
        [for (i = [0 : last - 1]) for (j = [0 : k - 1]) let(p = i*k + j, q = i*k + (j + 1) % k)
            each [[p, q, q + k], [p, q + k, p + k]]]));
}

// plan shape of a pocket: square front, round back (a half circle for a mono, a half ellipse when wider)
module pocket_plan(w) {
    e = min(w/2, $e_d * 0.6);
    hull() {
        translate([-w/2, -5]) square([w, 5 + $e_d - e]);
        translate([0, $e_d - e]) scale([w/2, e]) circle(r = 1, $fn = 96);
    }
}

// pocket of width w: rounded opening, round back
module slot_shape(w, open_r) intersection() {
    pocket_loft(w, open_r);
    translate([0, 0, $e_floor_min]) linear_extrude(ins_top) pocket_plan(w);   // the mouth round stops at the lowest floor
}

// edges: the swept slot. Pockets (open_r > 0): the straight slot cut to the pocket plan.
module slot_cut(w = slot_w, open_r = 0) translate([0, edge_sb, 0]) {
    if (open_r > 0) slot_shape(w, open_r);
    else edge_slot(w);
}

module insert_blank() xz(0, pk_d - clear) translate([0, floor_t + pk_h/2]) rrect(pk_w - 2*clear, pk_h - 2*clear, r_in - clear);

// size mark centred on the band below the slot. The letters are about size tall and sit a little
// high; they shrink to keep 1.5 mm of band above and below, and a band too low for size 4 gets no mark.
module size_mark(label, floor_z = pk_floor) {
    mark_z = (floor_t + clear + floor_z) / 2;
    size = min(len(label) > 6 ? 7 : 9, floor_z - floor_t - clear - 3.5);
    if (size >= 4) translate([0, -eps, mark_z]) rotate([90, 0, 0]) mirror([0, 0, 1])
        linear_extrude(1) text(label, size = size, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

function angle_label() = edge_angle > 0 ? str(" +", edge_angle, "°") : edge_angle < 0 ? str(" ", edge_angle, "°") : "";

module insert_edge() {
    difference() {
        insert_blank();
        slot_cut();
        size_mark(str(slot_d, " mm", angle_label()), e_floor());
        latch_relief();
    }
    latch_arm();
}
