// Pocket insert: one to three pockets side by side, cut with the edge slot.
// Mono: 1 x 22 mm. Two-finger: 1 x 40 mm. Three-finger: 1 x 58 mm. Or several pockets in a row.
// The pockets share the edge settings: depth (slot_d), lip roundover, angle.

pocket_n = 1;                                // number of pockets
pocket_w = 58;                               // width of each pocket
pocket_gap = 10;                             // wall between pockets
pocket_r = 8;                                // corner radius of the opening, seen from the front; the back is round

module insert_pocket() {
    span = row_span(pocket_n, pocket_w, pocket_gap);
    mouth_z = max(ins_bot + skin, pk_floor - mouth_r);  // the mouth round reaches mouth_r under the floor
    difference() {
        insert_blank();
        for (i = [0 : pocket_n - 1])
            translate([-span/2 + pocket_w/2 + i * (pocket_w + pocket_gap), 0, 0])
                slot_cut(pocket_w, pocket_r);
        size_mark(str(slot_d, " mm", angle_label()), mouth_z);
        latch_relief();
    }
    latch_arm();
}
