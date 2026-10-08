// Insert interface: every housing has this pocket, every insert fits it.
// The pocket opens to the front. Inserts slide in from the front.

pk_w = 114; pk_h = 52; pk_d = 48; r_in = 4;  // pocket envelope: room for a 28 mm roller and the fingers around it
clear = 0.3;                                 // gap between insert and pocket, per side

// Anchor plane: the anchor sits under it, so the edge stays flat under load.
// Lip + 8 mm, near where the finger pads load (a guess, to be tested). The roller axle sits on it.
grip_y = 8;

// Housing walls around the pocket. Every housing shares these, so every housing takes every insert.
floor_t = 8; side_t = 4; top_t = 8; back_t = 3;
W = pk_w + 2*side_t; H = floor_t + pk_h + top_t; D = pk_d + back_t;
