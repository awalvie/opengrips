// opengrips configurator front end. The kit is a list of items, each a housing or an insert.
// One item is selected: the 3D view shows it (alone or with a partner for a fit check),
// the editor below changes it.
const $ = (id) => document.getElementById(id);
const COLORS = { housing: 0xd9d3c7, insert_edge: 0x7a74e8, insert_pocket: 0x7a74e8, insert_flip: 0x7a74e8, insert_roller: 0x7a74e8,
                 roller: 0xe0a463, axle: 0xd8d8d8, carabiner: 0x8996a3 };
const LINE = 0x1d1c1a;   // outlines on sharp edges: they make the engraved text, slots and windows readable

let cat = null, framed = false, seq = 0;
let mode = "simple";
try { mode = localStorage.getItem("opengrips-mode") || "simple"; } catch (e) { /* storage blocked */ }
const kit = { items: [], sel: 0 };   // items is replaced on Undo, so nothing keeps a reference to it
const cur = () => kit.items[kit.sel];
let partnerKey = "auto";   // "none", "auto" (first match in the kit), "kit:<n>" or "std:<anchor>"

// ---------- scene
// without WebGL or three.js the page still works: the kit, the editor and the downloads need no 3D
const viewer = $("viewer");
const meshes = {};
let renderer = null, scene, camera, controls, model, loader;

function sceneColor() {
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--scene").trim());
  requestRender();
}

// draw a frame only when something changed (three.js manual, "Rendering on demand"). While the
// orbit damping eases out, controls.update() fires "change" and keeps asking for the next frame.
let renderRequested = false;
function requestRender() {
  if (!renderer || renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => { renderRequested = false; controls.update(); renderer.render(scene, camera); });
}

// the "Shown in" picker and Fit sit over the top of the view; on a short phone view they would
// cover the model, so the view is centred in the space under them and frame() fits the model there
function overlay() {
  const vb = viewer.querySelector(".vbtns");
  return vb.offsetTop + vb.offsetHeight + 6;
}

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.setViewOffset(w, h, 0, -overlay() / 2, w, h);   // also updates the projection
  requestRender();
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewer.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6a60, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95); sun.position.set(200, 400, 300); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-300, 100, -200); scene.add(fill);
  model = new THREE.Group(); model.rotation.x = -Math.PI / 2; scene.add(model);   // OpenSCAD Z-up to three Y-up
  loader = new THREE.STLLoader();
  sceneColor();
  new ResizeObserver(resize).observe(viewer);
  controls.addEventListener("change", requestRender);
} catch (e) {
  if (renderer) renderer.domElement.remove();
  renderer = null;
  viewer.classList.add("no3d");
  viewer.insertAdjacentHTML("afterbegin", `<p class="no3d-msg">3D preview unavailable. You can still build your kit and download it.</p>`);
}

function frame() {
  const box = new THREE.Box3();
  Object.values(meshes).forEach((m) => box.expandByObject(m));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const t = Math.tan((camera.fov * Math.PI) / 360), free = 1 - overlay() / viewer.clientHeight;
  const d = r / Math.min(t * free, t * camera.aspect) * 1.05;   // narrow phone screens: the width limits
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 1.2).normalize().multiplyScalar(d));
  controls.update();
}

// #status shows the progress; screen readers hear only the end of a render (#say), not every step
function status(text, err) {
  const s = $("status"); s.hidden = !text; s.textContent = text || ""; s.classList.toggle("err", !!err);
  if (err) say(text);
}
function say(text) { $("say").textContent = text; }

// the moment a setting changes, until the new parts are in: dim the model, show a spinner over it.
// A change that comes from the cache is in within a frame or two; the short delay keeps it from flashing.
let busyTimer = null;
function busy(on) {
  clearTimeout(busyTimer);
  if (on && renderer) busyTimer = setTimeout(() => { viewer.classList.add("busy"); $("busy").hidden = false; }, 120);
  else { viewer.classList.remove("busy"); $("busy").hidden = true; }
}

// ---------- catalog helpers
const insertDef = (id) => cat.inserts.find((i) => i.id === id);
const defaults = (params) => Object.fromEntries(params.map((p) => [p.name, p.default]));
const defOf = (it) => (it.type === "housing" ? cat.housing : insertDef(it.insertId));
const partsOf = (it) => defOf(it).parts;
const anchors = () => cat.housing.params.find((p) => p.name === "anchor").options;

function newHousing(values) { return { type: "housing", values: Object.assign(defaults(cat.housing.params), values || {}) }; }
function newInsert(id, values) {
  return { type: "insert", insertId: id, values: Object.assign(defaults(insertDef(id).params), values || {}) };
}

// names come from the values, so they follow every slider
function nameOf(it) {
  const v = it.values;
  if (it.type === "housing") {
    const a = anchors().find((o) => o.value === v.anchor);
    return a.label.split(" (")[0] + " housing" + (v.style === "solid" ? ", solid" : "");
  }
  const ang = v.edge_angle > 0 ? ` incut ${v.edge_angle}°` : v.edge_angle < 0 ? ` sloper ${-v.edge_angle}°` : "";
  if (it.insertId === "edge") return `${v.slot_d} mm${v.ergo ? " ergo" : ""} edge${ang}`;
  const pockets = (n, w) => `${n > 1 ? n + " × " : ""}${{ 22: "mono", 40: "two-finger", 58: "three-finger" }[w] || `${w} mm`} pocket`;
  if (it.insertId === "flip") {
    const grip = (k) => `${v[k + "_d"]} mm ${v[k + "_kind"] === "edge" ? (v[k + "_ergo"] ? "ergo edge" : "edge") : pockets(v[k + "_pn"], v[k + "_pw"])}`;
    return `Two-sided, ${grip("top")} / ${grip("bot")}`;
  }
  if (it.insertId === "pocket") {
    const name = `${pockets(v.pocket_n, v.pocket_w)}, ${v.slot_d} mm${ang}`;
    return name[0].toUpperCase() + name.slice(1);
  }
  return `${v.roll_type === "straight" ? "Straight" : "Unlevel"} roller, ${v.roll_d} mm`;
}

// only the values that differ from the defaults, so equal parts share one cache entry
function ownParams(it) {
  return Object.fromEntries(defOf(it).params.filter((p) => it.values[p.name] !== p.default).map((p) => [p.name, it.values[p.name]]));
}

// a setting of one housing or insert: two inserts can share a name with different ranges
const specIn = (def, n) => def.params.find((p) => p.name === n);
// a row of pockets fits in the insert: count * width + (count - 1) * wall <= max
const spanMax = (s, v) => Math.floor((s.max - (v[s.names[0]] - 1) * v[s.names[2]]) / v[s.names[0]]);
// make a pocket row fit: narrower pockets first, then a thinner wall once they are at their least
function fitSpan(s, v, def) {
  const [n, w, g] = s.names;
  if (v[w] > spanMax(s, v)) v[w] = Math.max(specIn(def, w).min, spanMax(s, v));
  if (v[n] > 1 && v[n] * v[w] + (v[n] - 1) * v[g] > s.max) v[g] = Math.floor((s.max - v[n] * v[w]) / (v[n] - 1));
}

// ---------- rendering: OpenSCAD runs in a worker (render.js), the STLs stay in memory
// Known parameters of this housing or insert (def), with values inside their range only, so a bad
// value never reaches OpenSCAD. Defaults are left out, so equal shapes share one cache entry.
function cleanParams(values, def) {
  const out = {};
  Object.entries(values).forEach(([name, v]) => {
    const p = specIn(def, name);
    if (!p) throw new Error(`unknown parameter: ${name}`);
    if (p.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
      if (v < p.min || v > p.max) throw new Error(`${name} must be between ${p.min} and ${p.max}`);
    } else if (!p.options.some((o) => o.value === v)) throw new Error(`${name} has no option ${v}`);
    if (v !== p.default) out[name] = v;
  });
  const q = Object.assign(defaults(def.params), out);
  (def.spans || []).forEach((s) => {
    if (q[s.names[1]] > spanMax(s, q)) throw new Error("The pockets are wider than the insert. Use fewer or narrower pockets.");
  });
  return out;
}

// the file name comes from the item name, so the list shows what lands in the downloads folder.
// An item with more than one part adds the part name.
const slug = (s) => s.toLowerCase().replaceAll("×", "x").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// a second item with the same name gets -2, and so on
function fileOf(it, p) {
  const base = slug(nameOf(it)), n = kit.items.slice(0, kit.items.indexOf(it)).filter((x) => slug(nameOf(x)) === base).length;
  return base + (n ? `-${n + 1}` : "") + (partsOf(it).length > 1 ? "-" + slug(p.name) : "") + ".stl";
}

const worker = new Worker("render.js", { type: "module" });
const waiting = {};
let jobId = 0, broken = null, warm = false;
worker.onmessage = ({ data }) => {
  const w = waiting[data.id]; delete waiting[data.id];
  if (!w) return;   // already failed by onerror
  if (data.error) w.reject(new Error(data.error)); else { warm = true; w.resolve(data.stl); }
};
// the worker script did not load (an old browser without module workers): every job fails, now and later
worker.onerror = (e) => {
  e.preventDefault();
  broken = new Error("This browser cannot run the 3D renderer. Try a current Firefox, Chrome or Safari.");
  Object.keys(waiting).forEach((id) => { waiting[id].reject(broken); delete waiting[id]; });
};

const stls = new Map();   // key: part and clean parameters; value: a promise of the STL bytes
const KEEP = 60;          // STLs kept, about 0.3 MB each: enough to go back and forth between items
// print: turn the part the way it prints and put it on the bed (for_print in opengrips.scad).
// params come from cleanParams.
async function stl(part, clean, print = false) {
  if (broken) throw broken;
  const key = JSON.stringify([part, print, Object.keys(clean).sort().map((k) => [k, clean[k]])]);
  let job = stls.get(key);
  if (!job) {
    job = new Promise((resolve, reject) => {
      waiting[++jobId] = { resolve, reject };
      worker.postMessage({ id: jobId, part, params: print ? { ...clean, for_print: true } : clean });
    }).catch((e) => { if (stls.get(key) === job) stls.delete(key); throw e; });   // a failed render is tried again next time
  }
  stls.delete(key); stls.set(key, job);   // the last used goes last, the oldest goes first
  if (stls.size > KEEP) stls.delete(stls.keys().next().value);
  return job;
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- fit-check partner: what the selected item is shown with
function partnerOptions(it) {
  // group: "kit" (your kit) or "std" (standard parts); the dropdown shows them under those headings
  const opts = [{ key: "none", label: "Nothing, just this" }];
  kit.items.forEach((x, n) => { if (x.type !== it.type) opts.push({ key: `kit:${n}`, group: "kit", label: nameOf(x), item: x }); });
  if (it.type === "insert") anchors().forEach((a) => opts.push({ key: `std:${a.value}`, group: "std", label: `${a.label.split(" (")[0]} housing`,
                                                               item: newHousing({ anchor: a.value }) }));
  else opts.push({ key: "std:edge", group: "std", label: "20 mm edge", item: newInsert("edge") });
  return opts;
}

function partnerPick(it) {
  const opts = partnerOptions(it);
  const key = partnerKey === "auto" ? (opts[1] || opts[0]).key : partnerKey;
  return opts.find((o) => o.key === key) || opts[0];
}
const partner = (it) => partnerPick(it).item || null;

function renderPartner() {
  const it = cur(), sel = $("partner");
  $("partner-box").hidden = !it; if (!it) return;
  $("partner-lbl").textContent = it.type === "insert" ? "Shown in" : "Shown with";
  const opts = partnerOptions(it), opt = (o) => `<option value="${o.key}">${o.label}</option>`;
  const group = (g, title) => { const os = opts.filter((o) => o.group === g); return os.length ? `<optgroup label="${title}">${os.map(opt).join("")}</optgroup>` : ""; };
  sel.innerHTML = opts.filter((o) => !o.group).map(opt).join("") + group("kit", "Your kit") + group("std", "Standard");
  sel.value = partnerPick(it).key;
}

// ---------- editor
function shown(p, group) {
  const rule = (group.show_if || {})[p.name];
  return !rule || cur().values[rule[0]] === rule[1];
}

// small line pictures for choices, by the catalog's "icon" name: an edge seen from the side,
// a pocket seen from the front, a housing anchor or wall
const ICON = {
  flat: '<path d="M3 7v11M3 12h14a3 3 0 0 1 3 3v3"/>',
  ergo: '<path d="M3 7v11M3 12h4q5 3 10 0a3 3 0 0 1 3 3v3"/>',
  incut: '<path d="M3 7v11M3 14l14-3a3 3 0 0 1 3 3v4"/>',
  sloper: '<path d="M3 7v11M3 9q12 0 17 9"/>',
  pyramid: '<path d="M4 5h16M4 5l8 14 8-14M9 5l3 14 3-14"/>',
  keel: '<path d="M5 5h14l-3 14H8z"/><circle cx="12" cy="11" r="2.5"/>',
  truss: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 19l6-14 6 14 6-14"/>',
  solid: '<rect x="3" y="5" width="18" height="14" rx="1.5"/>',
  mono: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="2"/>',
  two: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="7" y="9" width="10" height="6" rx="2"/>',
  three: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="5" y="9" width="14" height="6" rx="2"/>',
};
const icon = (k) => ICON[k] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>` : "";

// a setting's help line hides behind an "i" button after its label (W3C APG disclosure). The line
// opens under the label. Open lines stay open when the editor redraws, by the setting's key.
const openTips = new Set();
const tipHtml = (label, help) => help ? `<button type="button" class="info" aria-expanded="false" aria-label="About ${label}">` +
  `<span aria-hidden="true">i</span></button>` : "";
const helpHtml = (help) => help ? `<p class="help" hidden>${help}</p>` : "";
let tipN = 0;
function wireTip(wrap, key) {
  const b = wrap.querySelector(".info"), line = wrap.querySelector(".help");
  if (!b) return;
  line.id = `help-${++tipN}`; b.setAttribute("aria-controls", line.id);
  const show = (open) => { b.setAttribute("aria-expanded", open); line.hidden = !open; };
  show(openTips.has(key));
  b.onclick = () => { const open = line.hidden; open ? openTips.add(key) : openTips.delete(key); show(open); };
}

// a choice: one bar of options, [{label, blurb, icon, active, pick}]. A radio group for the keyboard
// (W3C APG radio group): Tab stops on the checked option only, the arrow keys move and pick.
// Only the picked option's line (blurb) shows, under the bar; none picked is "Custom".
let noteN = 0;
function optionButtons(label, options, help, key = label) {
  const wrap = document.createElement("div"); wrap.className = "param"; wrap.dataset.key = key;
  wrap.innerHTML = `<div class="lrow"><label>${label}</label>${tipHtml(label, help)}</div>${helpHtml(help)}` +
    `<div class="opts" role="radiogroup" aria-label="${label}"></div>` + (options.some((o) => o.blurb) ? `<p class="note"></p>` : "");
  wireTip(wrap, key);
  options.forEach((o) => {
    const b = document.createElement("button");
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", !!o.active);
    b.innerHTML = `${icon(o.icon)}<span>${o.label}</span>`;
    b.onclick = () => {
      wrap.querySelectorAll(".opts button").forEach((x) => x.setAttribute("aria-checked", x === b));
      wrap.roving();
      o.pick();
    };
    wrap.querySelector(".opts").append(b);
  });
  const bs = [...wrap.querySelectorAll(".opts button")], note = wrap.querySelector(".note");
  // a screen reader reads the note with the group, as it read the line in each button before
  if (note) { note.id = `note-${++noteN}`; wrap.querySelector(".opts").setAttribute("aria-describedby", note.id); }
  // the checked option takes the Tab stop; with none checked, the first one. The note follows it.
  wrap.roving = () => {
    const i = bs.findIndex((x) => x.getAttribute("aria-checked") === "true");
    bs.forEach((x, n) => { x.tabIndex = n === Math.max(i, 0) ? 0 : -1; });
    if (note) note.innerHTML = i < 0 ? "<b>Custom:</b> set by the sliders below." : options[i].blurb ? `<b>${options[i].label}:</b> ${options[i].blurb}.` : "";
  };
  wrap.roving();
  wrap.querySelector(".opts").addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;   // browser shortcuts, such as Alt+Left for back
    const i = bs.indexOf(document.activeElement), n = bs.length;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault();
    const b = bs[(to + n) % n];
    b.focus(); b.click();
  });
  return wrap;
}

// "Reset" next to a setting while it differs from its default
function resetButton(p, reset) {
  const b = document.createElement("button");
  b.className = "reset"; b.textContent = "Reset";
  b.setAttribute("aria-label", `Reset ${p.label}`);
  b.hidden = cur().values[p.name] === p.default;
  b.onclick = (e) => { e.preventDefault(); reset(); };
  return b;
}

function control(p, group) {
  const vals = cur().values;
  if (p.type === "choice" && p.options.length <= 3) {
    const w = optionButtons(p.label, p.options.map((o) => {
      const m = o.label.match(/^(.*?)\s*\((.*)\)$/) || [null, o.label, ""];
      return { label: m[1], blurb: m[2], icon: o.icon, active: vals[p.name] === o.value,
               pick: () => { vals[p.name] = o.value; buildEditor(); edited(); } };   // a grip kind changes the rows under it
    }), p.help);
    w.querySelector(".lrow").append(resetButton(p, () => { vals[p.name] = p.default; buildEditor(); edited(); }));
    w.dataset.name = p.name; w.hidden = !shown(p, group);
    return w;
  }
  const wrap = document.createElement("div");
  wrap.className = "param"; wrap.hidden = !shown(p, group); wrap.dataset.name = p.name;
  const id = "p-" + p.name;
  if (p.type === "number") {
    wrap.innerHTML = `<div class="lrow"><label for="${id}">${p.label}</label>${tipHtml(p.label, p.help)}<span class="val"><output></output></span></div>
      ${helpHtml(p.help)}<div class="slider"><button class="step" aria-label="Less ${p.label}">−</button>
      <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">
      <button class="step" aria-label="More ${p.label}">+</button></div>`;
    const input = wrap.querySelector("input"), out = wrap.querySelector("output");
    const [less, more] = wrap.querySelectorAll(".step");
    input.value = vals[p.name];
    const show = () => { out.textContent = `${input.value}${p.unit ? " " + p.unit : ""}`; reset.hidden = vals[p.name] === p.default; };
    const set = (v) => {
      input.value = Math.min(Number(input.max), Math.max(p.min, v));
      vals[p.name] = Number(input.value); show(); fitPockets(); edited();
    };
    const reset = resetButton(p, () => set(p.default));
    out.before(reset);
    show();
    input.addEventListener("input", () => set(Number(input.value)));
    less.onclick = () => set(Number(input.value) - p.step);
    more.onclick = () => set(Number(input.value) + p.step);
  } else {
    wrap.innerHTML = `<div class="lrow"><label for="${id}">${p.label}</label>${tipHtml(p.label, p.help)}</div>${helpHtml(p.help)}<select id="${id}">` +
      p.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("") + "</select>";
    const sel = wrap.querySelector("select");
    sel.value = vals[p.name];
    const pick = (v) => { vals[p.name] = sel.value = v; reset.hidden = v === p.default; refreshVisibility(); edited(); };
    const reset = resetButton(p, () => pick(p.default));
    wrap.querySelector(".lrow").append(reset);
    sel.addEventListener("change", () => pick(sel.value));
  }
  wireTip(wrap, p.name);
  return wrap;
}

// any later change closes an Undo offer, so Undo never brings back a kit older than the last edit
function edited() {
  if ($("toast").querySelector("button")) $("toast").hidden = true;
  syncs.forEach((f) => f());
  renderNames(); changed(); saveKit();
  const all = $("reset-all");
  if (all && cur()) all.hidden = !Object.keys(ownParams(cur())).length;
}

// pockets: the width slider's maximum follows the count and the wall, so the pockets always fit
function fitPockets() {
  const it = cur();
  if (!it) return;
  (defOf(it).spans || []).forEach((s) => {
    const v = it.values, def = defOf(it);
    fitSpan(s, v, def);
    s.names.slice(1).forEach((n) => {
      const input = document.querySelector("#p-" + n);
      if (!input) return;
      if (n === s.names[1]) input.max = Math.max(specIn(def, n).min, spanMax(s, v));
      input.value = v[n]; input.closest(".param").querySelector("output").textContent = `${v[n]} mm`;
      input.closest(".param").querySelector(".reset").hidden = v[n] === specIn(def, n).default;
    });
  });
}

function refreshVisibility() {
  document.querySelectorAll("#editor .param[data-name]").forEach((el) => {
    el.hidden = !shown(specIn(defOf(cur()), el.dataset.name), defOf(cur()));
  });
}

// the editor shows the selected item only. Simple: the main choices. Advanced: every setting.
let syncs = [];   // re-mark the Shape, Fingers or Roller buttons after a slider moves

// a rebuild replaces every control, so keyboard focus would fall back to the page. Note where it
// was (its row, and its place in the row), and put it back on the new control there.
function focusSpot() {
  const a = document.activeElement;
  if (!a || !$("editor").contains(a)) return null;
  const row = a.closest(".param");
  return { id: a.id, row: row && (row.dataset.name || row.dataset.key),
           n: row ? [...row.querySelectorAll("button, input, select")].indexOf(a) : -1 };
}
function restoreFocus(f) {
  if (!f) return;
  const box = $("editor"), seen = (el) => el && !el.hidden && el.getClientRects().length;
  const row = f.row && [...box.querySelectorAll(".param")].find((r) => (r.dataset.name || r.dataset.key) === f.row);
  // a Reset button hides once used: then the row's checked option, or its first control
  const el = [f.id && $(f.id), row && row.querySelectorAll("button, input, select")[f.n],
              row && row.querySelector('[aria-checked="true"]'), row && row.querySelector("button, input, select"),
              $("mode-switch")].find(seen);
  if (el) el.focus();
}

// the settings of one housing or insert, as the cards in its catalog entry. Simple mode shows the
// main settings; All settings adds the rest under "More settings" in each card. choiceFor(card):
// the one-tap choice (Shape, Fingers or Roller) of a card marked choice, or null; it goes first,
// or after the card's choice_after setting. skip: settings the page sets another way.
function buildCards(box, def, choiceFor, skip = () => false) {
  def.cards.forEach((c) => {
    const ps = c.params.map((n) => specIn(def, n)).filter((p) => !skip(p));
    const main = ps.filter((p) => p.simple), more = mode === "advanced" ? ps.filter((p) => !p.simple) : [];
    const choiceEl = c.choice && choiceFor ? choiceFor(c) : null;
    if (!main.length && !more.length && !choiceEl) return;
    const card = document.createElement("section");
    card.className = "ecard";
    card.innerHTML = `<h3>${c.title}${c.sub ? `<small>${c.sub}</small>` : ""}</h3>`;
    if (choiceEl && !c.choice_after) card.append(choiceEl);
    main.forEach((p) => { card.append(control(p, def)); if (choiceEl && p.name === c.choice_after) card.append(choiceEl); });
    if (more.length) {
      card.insertAdjacentHTML("beforeend", `<h4 class="more-h">More settings</h4>`);
      more.forEach((p) => card.append(control(p, def)));
    }
    box.append(card);
  });
}

function buildEditor() {
  const spot = focusSpot();
  const box = $("editor"); box.innerHTML = "";
  const it = cur();
  syncs = [];
  if (!it) { box.innerHTML = `<p class="hint">Your kit is empty. Add an insert or a housing above.</p>`; return; }
  // Simple or every setting: a switch, it applies at once (W3C APG switch pattern)
  const sw = document.createElement("button");
  sw.id = "mode-switch"; sw.className = "switch"; sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", mode === "advanced");
  sw.innerHTML = `<span class="track" aria-hidden="true"><span class="knob"></span></span>All settings`;
  sw.onclick = () => { setMode(mode === "simple" ? "advanced" : "simple"); };
  box.append(sw);
  if (it.type === "housing") buildCards(box, cat.housing);
  else buildInsertEditor(box, it);
  // every setting back to its default; an insert keeps its kind
  const all = document.createElement("button");
  all.id = "reset-all"; all.textContent = "Reset all to defaults";
  all.hidden = !Object.keys(ownParams(it)).length;
  all.onclick = () => {
    const done = undoable(`${nameOf(it)}: every setting is back to its default.`);
    kit.items[kit.sel] = it.type === "housing" ? newHousing() : newInsert(it.insertId);
    buildEditor(); edited(); done();
  };
  box.append(all);
  restoreFocus(spot);
}

// a one-tap choice (Shape, Fingers or Roller) that sets several values at once. prefix: a grip of a
// two-sided insert ("top_"), whose values carry it. Depth and lip radius are only a starting
// point: the slider changes them without changing the shape.
function oneTap(sc, prefix, key) {
  const vals = () => cur().values;
  const on = (o) => Object.entries(o.values).every(([k, v]) => ["slot_d", "grip_r", "r"].includes(k) || vals()[prefix + k] === v);
  const w = optionButtons(sc.label, sc.options.map((o) => ({ label: o.label, blurb: o.blurb, icon: o.icon, active: on(o),
    pick: () => { Object.entries(o.values).forEach(([k, v]) => { vals()[prefix + k] = v; }); buildEditor(); edited(); } })), "", key);
  if (sc.help) w.insertAdjacentHTML("beforeend", `<p class="rule">${sc.help}</p>`);
  const bs = w.querySelectorAll(".opts button");
  syncs.push(() => { sc.options.forEach((o, n) => bs[n].setAttribute("aria-checked", on(o))); w.roving(); });
  return w;
}

// the two-sided insert, and the one-sided kinds it is made from
const twoDef = () => cat.inserts.find((i) => i.two_sided_of);

// one side to two: the item's settings become the top grip's, inside the two-sided ranges.
// Returns the new item and what had to change to fit.
function toTwoSided(it) {
  const two = twoDef(), t = newInsert(two.id), v = it.values, w = t.values, cut = [];
  const say = (n, x, y) => { const p = specIn(two, n); cut.push(`${p.label.replace(/^Top /, "").toLowerCase()} ${x} to ${y}${p.unit ? " " + p.unit : ""}`); };
  const put = (n, x, quiet) => {
    const p = specIn(two, n), y = Math.min(p.max, Math.max(p.min, x));
    if (y !== x && !quiet) say(n, x, y);
    w[n] = y;
  };
  w.top_kind = it.insertId;
  put("top_d", v.slot_d); put("top_r", v.grip_r);
  if (it.insertId === "edge") { put("top_ergo", v.ergo); put("top_w", v.slot_w); }
  else {
    put("top_pn", v.pocket_n); put("top_pr", v.pocket_r); put("top_pw", v.pocket_w, true); put("top_pgap", v.pocket_gap, true);
    fitSpan(two.spans[0], w, two);
    if (w.top_pw !== v.pocket_w) say("top_pw", v.pocket_w, w.top_pw);
    if (w.top_pgap !== v.pocket_gap) say("top_pgap", v.pocket_gap, w.top_pgap);
  }
  if (v.edge_angle) cut.push(`angle ${v.edge_angle}° to 0°`);
  // each grip of a two-sided insert takes half the height
  const h = specIn(defOf(it), "slot_h");
  if (h && v.slot_h !== h.default) cut.push(`slot height ${v.slot_h} mm to half the insert`);
  return { it: t, cut };
}

// two sides to one: the top grip becomes the insert, the bottom grip goes
function toOneSided(it) {
  const v = it.values;
  return v.top_kind === "edge"
    ? newInsert("edge", { slot_d: v.top_d, grip_r: v.top_r, ergo: v.top_ergo, slot_w: v.top_w })
    : newInsert("pocket", { slot_d: v.top_d, grip_r: v.top_r, pocket_n: v.top_pn, pocket_w: v.top_pw, pocket_gap: v.top_pgap, pocket_r: v.top_pr });
}

function setSides(n) {
  const it = cur(), name = nameOf(it);
  if ((n === 2) === (it.insertId === twoDef().id)) return;
  const { it: next, cut } = n === 2 ? toTwoSided(it) : { it: toOneSided(it), cut: [] };
  const done = undoable(n === 2 ? `${name} is now two-sided.` + (cut.length ? ` To fit, the ${cut.join(", ")}.` : "")
                                : `${name} is now one-sided. The bottom grip is gone.`);
  kit.items[kit.sel] = next; buildEditor(); edited(); done();
}

function buildInsertEditor(box, it) {
  const def = insertDef(it.insertId), two = twoDef(), isTwo = it.insertId === two.id;
  const shownKind = isTwo ? it.values.top_kind : it.insertId;   // a two-sided insert shows as its top grip's kind
  const pickKind = (id) => {
    if (id === shownKind) return;
    // a two-sided insert keeps both grips when its top grip turns from edge to pockets or back
    if (isTwo && two.two_sided_of.includes(id)) { cur().values.top_kind = id; buildEditor(); edited(); return; }
    const done = undoable(`${nameOf(cur())} is now ${insertDef(id).name.toLowerCase()}.`, true);
    kit.items[kit.sel] = newInsert(id); buildEditor(); edited(); done();
  };
  const kindDef = insertDef(shownKind);
  // one short word each, in one row; the line under it says what the picked insert is
  const kinds = optionButtons("Insert", cat.inserts.filter((i) => !i.two_sided_of).map((i) => ({
    label: i.name, active: i.id === shownKind, pick: () => pickKind(i.id) })), `${kindDef.name}: ${kindDef.blurb}.`);
  const head = document.createElement("section");
  head.className = "ecard"; head.innerHTML = `<h3 class="sr">Insert</h3>`; head.append(kinds);
  if (two.two_sided_of.includes(shownKind))
    head.append(optionButtons("Sides", [{ label: "One", active: !isTwo, pick: () => setSides(1) },
                                        { label: "Two", active: isTwo, pick: () => setSides(2) }],
                              "Two adds a second grip on the underside. Turn the insert over to swap."));
  box.append(head);
  if (isTwo) {
    // each grip card has the one-tap choice of its kind; the Insert row sets the top grip's kind
    const side = (c) => c.params[0].split("_")[0];
    const choiceFor = (c) => oneTap(two.side_choices[it.values[side(c) + "_kind"]], side(c) + "_", `${side(c)}-choice`);
    buildCards(box, def, choiceFor, (p) => p.name === "top_kind");
  } else {
    const sc = def.simple_choice;
    // a choice that the buttons above already set (Unlevel or Straight) is not shown twice
    const covered = (p) => p.type === "choice" && sc && sc.options.every((o) => p.name in o.values);
    buildCards(box, def, () => (sc ? oneTap(sc, "", sc.label) : null), covered);
  }
  fitPockets();
}

// ---------- kit list
// sticky: the toast stays until the next one or until hideToast(the number toast returned).
// undo: an Undo button that calls it. An Undo offer has no time limit (WCAG 2.2.1): it stays
// until the next edit, × or Escape.
let toastTimer = null, toastNo = 0;
function toast(text, sticky, undo) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  if (undo) {
    const b = document.createElement("button"); b.textContent = "Undo";
    b.onclick = () => { undo(); closeToast(); };
    const x = document.createElement("button"); x.textContent = "×"; x.setAttribute("aria-label", "Close");
    x.onclick = closeToast;
    t.append(b, x);
  }
  clearTimeout(toastTimer); if (!sticky && !undo) toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  return ++toastNo;
}
// a toast that closes with the focus on its button would leave the focus nowhere: put it on the
// picked option in the editor
function closeToast() {
  const t = $("toast"), had = t.contains(document.activeElement);
  t.hidden = true;
  if (had) ($("editor").querySelector('[aria-checked="true"]') || $("editor").querySelector("button"))?.focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("toast").hidden) closeToast(); });
function hideToast(no) { if (no === toastNo) $("toast").hidden = true; }

// a copy of the kit before a change that loses settings, for Undo. Several insert kinds in a row on
// one item (chain), with the Undo offer still open, keep the oldest copy: Undo goes back to before
// the first change.
let undoCopy = null;
function undoable(text, chain = false) {
  const open = !$("toast").hidden && $("toast").querySelector("button");
  if (!(chain && open && undoCopy && undoCopy.chain && undoCopy.sel === kit.sel))
    undoCopy = { items: JSON.parse(JSON.stringify(kit.items)), sel: kit.sel, chain };
  const { items, sel } = undoCopy;
  return () => toast(text, false, () => { kit.items = items; kit.sel = sel; partnerKey = "auto"; buildEditor(); edited(); });
}

function select(n) { kit.sel = n; partnerKey = "auto"; buildEditor(); edited(); }

function addItem(it) {
  kit.items.push(it); kit.sel = kit.items.length - 1; partnerKey = "auto";
  buildEditor(); edited();
  // phones: the editor is far below the kit list, so go to it
  if (innerWidth < 900) $("edit-section").scrollIntoView({ behavior: "smooth" });
  toast(`Added ${nameOf(it)}.`);
}

function renderKit() {
  const box = $("kit"); box.innerHTML = "";
  kit.items.forEach((it, n) => {
    const card = document.createElement("div");
    card.className = "card" + (n === kit.sel ? " on" : "");
    const main = document.createElement("button");
    main.className = "card-main"; main.setAttribute("aria-pressed", n === kit.sel);
    main.innerHTML = `<small>${it.type === "housing" ? "Housing" : "Insert"}</small><strong>${nameOf(it)}</strong>`;
    main.title = "Show and change this item";
    main.onclick = () => select(n);
    const copy = document.createElement("button");
    copy.className = "tool"; copy.textContent = "Copy"; copy.setAttribute("aria-label", `Copy ${nameOf(it)}`);
    copy.onclick = () => addItem(JSON.parse(JSON.stringify(it)));
    const rm = document.createElement("button");
    rm.className = "tool"; rm.textContent = "×"; rm.setAttribute("aria-label", `Remove ${nameOf(it)}`);
    rm.onclick = () => {
      const done = undoable(`Removed ${nameOf(it)}.`);
      kit.items.splice(n, 1);
      kit.sel = Math.max(0, Math.min(kit.sel - (n < kit.sel ? 1 : 0), kit.items.length - 1));
      partnerKey = "auto"; buildEditor(); edited(); done();
    };
    card.append(main, copy, rm);
    box.append(card);
  });
}

// everything that shows a name or the kit: list, editor title, partner list, 3D caption, downloads
function renderNames() {
  renderKit(); renderPartner();
  const it = cur();
  $("edit-title").textContent = it ? nameOf(it) : "nothing selected";
  const p = it && partner(it);
  $("showing").textContent = !it ? "" : p ? `${nameOf(it)} ${it.type === "insert" ? "in" : "with"} ${nameOf(p)}` : nameOf(it);
  buildDownloads();
}

// ---------- preview
let timer = null;
function changed(now) {
  busy(true);
  clearTimeout(timer);
  timer = setTimeout(update, now ? 0 : 500);
}

async function loadMesh(job, my) {
  const geo = loader.parse(await stl(job.part, job.params));
  if (my !== seq) return;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS[job.part] || 0x888888, roughness: 0.75,
                                               metalness: job.part === "axle" || job.part === "carabiner" ? 0.4 : 0.05 });
  if (job.ghost) { mat.transparent = true; mat.opacity = 0.3; mat.depthWrite = false; }
  if (meshes[job.part]) drop(job.part);
  const m = new THREE.Group();
  m.add(new THREE.Mesh(geo, mat));
  // round faces meet at less than 30 degrees, so only real corners get a line
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: job.ghost ? 0.2 : 0.55 })));
  meshes[job.part] = m; model.add(m);
  requestRender();
}

function drop(k) {
  model.remove(meshes[k]);
  meshes[k].children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  delete meshes[k];
  requestRender();
}

async function update() {
  const my = ++seq, it = cur();
  const jobs = [];
  try { if (it) {
    const p = partner(it);
    const h = it.type === "housing" ? it : p;
    const ins = it.type === "insert" ? it : p;
    // the insert lines up with the floor of the housing it is shown in
    if (ins) partsOf(ins).forEach((q) => jobs.push({ part: q.part, params: Object.assign(cleanParams(ownParams(ins), defOf(ins)),
                                                                         h ? cleanParams({ floor_t: h.values.floor_t }, cat.housing) : {}) }));
    if (h) {
      const params = cleanParams(ownParams(h), cat.housing);
      jobs.push({ part: "housing", params, ghost: it.type === "insert" });   // see-through around an insert
      jobs.push({ part: "carabiner", params });
    }
  } } catch (e) { status(e.message, true); busy(false); return; }
  const keep = jobs.map((j) => j.part);
  Object.keys(meshes).forEach((k) => {
    if (!keep.includes(k)) drop(k);
  });
  if (!jobs.length || !renderer) { status(""); busy(false); return; }
  let done = 0, failed = false;   // after a failure the error stays, the parts still loading do not overwrite it
  const progress = () => status(`Rendering ${done + 1} of ${jobs.length}…` + (warm ? "" : " (the first time loads the 11 MB renderer)"));
  progress();
  try {
    await Promise.all(jobs.map((j) => loadMesh(j, my).then(() => { done++; if (my === seq && !failed && done < jobs.length) progress(); })));
    if (my !== seq) return;
    status(""); busy(false); say("Preview updated.");
    if (!framed) { frame(); framed = true; }
  } catch (e) {
    failed = true;
    if (my === seq) { status(e.message, true); busy(false); }
  }
}

// ---------- downloads
function buildDownloads() {
  const dl = $("downloads");
  dl.innerHTML = kit.items.length ? `<p class="warn">Not load-tested yet. Check every part before each session, and keep your feet clear of the weight.</p>
    <p class="hint">Ticked files go in the zip, the arrow saves one file. PETG, ready to slice.
    <a href="https://github.com/awalvie/opengrips/blob/main/PRINTING.md" target="_blank" rel="noopener">Printing guide</a></p>` : "";
  // the fit test comes before any kit, so it shows on an empty kit too
  dl.insertAdjacentHTML("beforeend", `<p class="hint">New printer? Print the <button class="inline" id="fit-dl">fit test</button> first, about 41 g.</p>`);
  $("fit-dl").onclick = downloadFitTest;
  kit.items.forEach((it) => {
    const box = document.createElement("div"); box.className = "ditem";
    it.skip = it.skip || {};   // parts left out of the zip, by part name; a plain object so that Copy keeps it
    partsOf(it).forEach((p) => {
      const row = document.createElement("div"); row.className = "dfile";
      row.innerHTML = `<label><input type="checkbox"${it.skip[p.part] ? "" : " checked"}>
        <span><strong>${fileOf(it, p)}</strong><small>${p.settings} · ${p.supports}</small></span></label>
        <button type="button" title="Download only ${fileOf(it, p)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg></button>`;
      row.querySelector("input").onchange = (e) => { it.skip[p.part] = !e.target.checked; kitButton(); };
      row.querySelector("button").onclick = (e) => downloadPart(p, it, e.currentTarget);
      box.append(row);
    });
    dl.append(box);
  });
  const nh = kit.items.filter((x) => x.type === "housing").length, ni = kit.items.length - nh;
  $("kit-summary").textContent = `Kit: ${ni} insert${ni === 1 ? "" : "s"}, ${nh} housing${nh === 1 ? "" : "s"}`;
  $("kit-count").textContent = `(${kit.items.length})`;
  kitButton();
  buildNeed();
}

// the ticked files: all of them is the whole kit, fewer is a count
function picked() { return kit.items.flatMap((it, n) => partsOf(it).filter((p) => !it.skip[p.part]).map((p) => ({ it, n, p }))); }
let zipping = false;
function kitButton() {
  if (zipping) return;
  const n = picked().length, all = kit.items.reduce((s, it) => s + partsOf(it).length, 0);
  $("b-kit").textContent = n === all ? "Download zip" : !n ? "No files picked" : `Download zip (${n} file${n === 1 ? "" : "s"})`;
  $("b-kit").disabled = !n;
}

// the button spins and ignores more taps until the file is saved
async function downloadPart(p, it, b) {
  b.disabled = true; b.classList.add("busy");
  const no = toast(`Preparing ${fileOf(it, p)}…`, true);
  try {
    const params = cleanParams(ownParams(it), defOf(it));
    saveBlob(new Blob([await stl(p.part, params, true)], { type: "model/stl" }), fileOf(it, p));
    hideToast(no);
  } catch (e) {
    toast("The file failed: " + e.message);
  } finally {
    b.disabled = false; b.classList.remove("busy");
  }
}

// the hardware and the steps for the parts in the kit only
function buildNeed() {
  const housings = kit.items.filter((x) => x.type === "housing"), inserts = kit.items.filter((x) => x.type === "insert");
  const roller = inserts.some((x) => x.insertId === "roller"), flip = inserts.some((x) => x.insertId === "flip");
  const need = ["A steel screwgate carabiner and a loading pin or sling for the weights."];
  if (roller) need.push("For the roller: a 12 mm steel rod or dowel works as the axle, or print it.");
  const steps = [];
  if (roller) steps.push("Roller: drop the roller between the cheeks, push the axle through both cheeks and the roller.");
  if (inserts.length) steps.push("Slide the insert into the housing until both side buttons click.",
                                 "To swap: pinch both buttons, pull the insert out by the grip, push the next one in.");
  if (flip) steps.push("Two-sided insert: to use the other grip, take it out, turn it over and push it back in.");
  if (housings.length) steps.push("Clip the carabiner to the anchor under the housing. Check it before every session.");
  const list = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  $("need").innerHTML = `<details><summary>Hardware and assembly</summary><strong>You also need</strong>${list(need)}`
    + (steps.length ? `<strong>Put it together</strong>${list(steps)}` : "") + `</details>`;
}

// NN-file.stl: the item number keeps equal parts of two items apart
async function downloadKit() {
  const b = $("b-kit");
  zipping = true; b.disabled = true; b.textContent = "Preparing…";
  const no = toast("Preparing the zip. New parts take a moment each.", true);
  try {
    const files = picked().map(({ it, n, p }) => {
      const name = String(n + 1).padStart(2, "0") + "-" + fileOf(it, p);
      return stl(p.part, cleanParams(ownParams(it), defOf(it)), true).then((data) => ({ name, data: new Uint8Array(data) }));
    });
    saveBlob(await makeZip(await Promise.all(files)), "opengrips-kit.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    zipping = false; kitButton();
  }
}

// the fit test parts, as they print, in one zip
let fitting = false;
async function downloadFitTest() {
  if (fitting) return;
  fitting = true;
  const no = toast("Preparing the fit test zip…", true);
  try {
    const files = cat.fit_test.map((p) => stl(p.part, {}, true).then((data) => ({ name: `fit-test-${slug(p.name)}.stl`, data: new Uint8Array(data) })));
    saveBlob(await makeZip(await Promise.all(files)), "opengrips-fit-test.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    fitting = false;
  }
}

// ---------- the kit in the page link: a reload keeps it, and a copied link shares it
// #k= holds the selected index and each item with only the values that differ from the defaults
// a slider calls this on every step, so the link is written once the steps stop
let saveTimer = null;
function saveKit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const items = kit.items.map((it) => (it.type === "housing" ? { h: ownParams(it) } : { i: it.insertId, v: ownParams(it) }));
    try { history.replaceState(null, "", "#k=" + encodeURIComponent(JSON.stringify({ s: kit.sel, items }))); } catch (e) { /* the link is a convenience */ }
  }, 300);
}
// a link that does not parse or has a bad value gives the default kit
function loadKit() {
  try {
    const m = location.hash.match(/^#k=(.+)$/);
    if (!m) return false;
    const k = JSON.parse(decodeURIComponent(m[1]));
    if (!k.items.length || k.items.length > 30) return false;
    // each item takes only its own settings, each inside its range
    const items = k.items.map((x) => {
      const it = x.h ? newHousing() : newInsert(x.i), own = defOf(it).params.map((p) => p.name);
      // older flip links name one pocket by its fingers
      if (x.i === "flip") ["top", "bot"].forEach((s) => {
        const w = { mono: 22, two: 40, three: 58 }[x.v?.[s + "_kind"]];
        if (w) { x.v[s + "_kind"] = "pocket"; x.v[s + "_pw"] = w; }
      });
      // a setting the page no longer has (from an older link) is dropped, the rest of the kit stays
      Object.entries(x.h || x.v || {}).forEach(([n, v]) => { if (own.includes(n)) it.values[n] = v; });
      cleanParams(it.values, defOf(it));
      return it;
    });
    kit.items.push(...items); kit.sel = Math.min(Math.max(0, k.s | 0), items.length - 1);
    return true;
  } catch (e) { return false; }
}
$("b-link").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied. It opens this kit."); }
  catch (e) { toast("Copy the address from the address bar. It holds this kit."); }
};

// ---------- start
$("partner").onchange = (e) => { partnerKey = e.target.value; renderNames(); framed = false; changed(true); };
$("b-fit").onclick = frame;
// phones: the 3D view takes 35% of the screen, or 70% for a closer look; the model is framed again in the new size
$("b-big").onclick = (e) => {
  const big = viewer.classList.toggle("big");
  e.currentTarget.textContent = big ? "Smaller" : "Bigger";
  setTimeout(() => { if (renderer) { resize(); frame(); } }, 50);
};
$("b-kit").onclick = downloadKit;
$("b-jump").onclick = () => $("dl-section").scrollIntoView({ behavior: "smooth" });
$("add-ins").onclick = () => addItem(newInsert("edge"));
$("add-hou").onclick = () => addItem(newHousing());

function setMode(m) {
  mode = m;
  try { localStorage.setItem("opengrips-mode", m); } catch (e) { /* storage blocked */ }
  if (cat) buildEditor();
}

// the theme button flips between light and dark; until it is pressed, the page follows the system
const SUN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>`;
const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
function themeButton() {
  const dark = isDark(), b = $("theme");
  b.innerHTML = dark ? SUN : MOON;
  b.title = dark ? "Switch to the light theme" : "Switch to the dark theme";
  b.setAttribute("aria-label", b.title);
  if (scene) sceneColor();
}
$("theme").onclick = () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("opengrips-theme", t); } catch (e) { /* storage blocked */ }
  themeButton();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeButton);
themeButton();

fetch("catalog.json").then((r) => r.json()).then((c) => {
  cat = c;
  if (!loadKit()) kit.items.push(newInsert("edge"), newHousing());
  setMode(mode); renderNames(); update();
}).catch((e) => status("Could not load the catalog: " + e.message, true));
