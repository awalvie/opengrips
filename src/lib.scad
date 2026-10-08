// Shared 2D/3D helpers. Axes: X = width, Y = depth (front at y=0, +Y to the back), Z = up.

// rounded rectangle, centred
module rrect(w, h, r) { offset(r) offset(-r) square([w, h], center = true); }

// extrude a 2D shape drawn in the XZ plane from y0 back to y0 + t
module xz(y0, t) { translate([0, y0 + t, 0]) rotate([90, 0, 0]) linear_extrude(t) children(); }

// round rod from a to b
module seg(a, b, d) { hull() { translate(a) sphere(d = d); translate(b) sphere(d = d); } }

// straight rectangular bar from a to b: t = thickness across, w = width (depth), every edge rounded by r
module bar(a, b, t, w, r = 1.5) {
    v = b - a; L = norm(v);
    translate(a) rotate([0, acos(v[2] / L), atan2(v[1], v[0])])
        hull() for (x = [-1, 1], y = [-1, 1], z = [0, L])
            translate([x*(t/2 - r), y*(w/2 - r), z]) sphere(r = r, $fn = 16);
}

// Triangle windows for a truss look, in 2D: a row of alternating triangles in an L x h strip,
// webs t thick between them, corners rounded by rc. Steep 60 degree sides print without supports.
module truss_windows(L, h, t, rc = 1) {
    n = max(1, round(2 * L / (1.155 * h)) - 1);    // triangle count, close to equilateral
    s = 2 * L / (n + 1);                           // base width
    for (i = [0 : n - 1]) {
        x0 = i * s / 2;
        tri = i % 2 == 0 ? [[x0, 0], [x0 + s, 0], [x0 + s/2, h]] : [[x0, h], [x0 + s, h], [x0 + s/2, 0]];
        offset(r = rc) offset(delta = -t/2 - rc) polygon(tri);
    }
}
