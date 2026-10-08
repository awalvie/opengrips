// opengrips configurator front end. The kit is a list of items, each a housing or an insert.
// One item is selected: the 3D view shows it (alone or with a partner for a fit check),
// the editor below changes it.
const $ = (id) => document.getElementById(id);
const COLORS = { housing: 0xd9d3c7, insert_edge: 0x7a74e8, insert_pocket: 0x7a74e8, insert_roller: 0x7a74e8,
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
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
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
const allParams = () => cat.housing.params.concat(...cat.inserts.map((i) => i.params));
const spec = (n) => allParams().find((p) => p.name === n);
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
  if (it.insertId === "pocket") {
    const kind = { 22: "mono", 40: "two-finger", 58: "three-finger" }[v.pocket_w] || `${v.pocket_w} mm`;
    const name = `${v.pocket_n > 1 ? v.pocket_n + " × " : ""}${kind} pocket, ${v.slot_d} mm${ang}`;
    return name[0].toUpperCase() + name.slice(1);
  }
  return `${v.roll_type === "straight" ? "Straight" : "Unlevel"} roller, ${v.roll_d} mm`;
}

// only the values that differ from the defaults, so equal parts share one cache entry
function ownParams(it) {
  return Object.fromEntries(defOf(it).params.filter((p) => it.values[p.name] !== p.default).map((p) => [p.name, it.values[p.name]]));
}

// ---------- rendering: OpenSCAD runs in a worker (render.js), the STLs stay in memory
// Known parameters with values inside their range only, so a bad value never reaches OpenSCAD.
// Defaults are left out, so equal shapes share one cache entry.
function cleanParams(values) {
  const out = {};
  Object.entries(values).forEach(([name, v]) => {
    const p = spec(name);
    if (!p) throw new Error(`unknown parameter: ${name}`);
    if (p.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
      if (v < p.min || v > p.max) throw new Error(`${name} must be between ${p.min} and ${p.max}`);
    } else if (!p.options.some((o) => o.value === v)) throw new Error(`${name} has no option ${v}`);
    if (v !== p.default) out[name] = v;
  });
  if (["pocket_n", "pocket_w", "pocket_gap"].some((n) => n in out)) {
    const def = insertDef("pocket"), q = Object.assign(defaults(def.params), out);
    if (q.pocket_n * q.pocket_w + (q.pocket_n - 1) * q.pocket_gap > def.max_span)
      throw new Error("The pockets are wider than the insert. Use fewer or narrower pockets.");
  }
  return out;
}

const fileName = (part, params) => [part, ...Object.keys(params).sort().map((k) => k + params[k])]
  .map((b) => String(b).replaceAll(".", "p")).join("-").slice(0, 120) + ".stl";

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
// print: turn the part the way it prints and put it on the bed (for_print in opengrips.scad)
async function stl(part, params, print = false) {
  const clean = cleanParams(params);
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

// a row of big buttons; options are [{label, blurb, active, pick}]
function optionButtons(label, options, help) {
  const wrap = document.createElement("div"); wrap.className = "param";
  wrap.innerHTML = `<label>${label}</label><div class="opts" role="radiogroup" aria-label="${label}"></div>` +
    (help ? `<p>${help}</p>` : "");
  if (options.length === 3) wrap.querySelector(".opts").classList.add("three");
  options.forEach((o) => {
    const b = document.createElement("button");
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", !!o.active);
    b.innerHTML = `<strong>${o.label}</strong>` + (o.blurb ? `<small>${o.blurb}</small>` : "");
    b.onclick = () => {
      wrap.querySelectorAll(".opts button").forEach((x) => x.setAttribute("aria-checked", x === b));
      o.pick();
    };
    wrap.querySelector(".opts").append(b);
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
      return { label: m[1], blurb: m[2], active: vals[p.name] === o.value,
               pick: () => { vals[p.name] = o.value; w.querySelector(".reset").hidden = o.value === p.default; refreshVisibility(); edited(); } };
    }), p.help);
    w.querySelector("label").append(resetButton(p, () => { vals[p.name] = p.default; buildEditor(); edited(); }));
    w.dataset.name = p.name; w.hidden = !shown(p, group);
    return w;
  }
  const wrap = document.createElement("div");
  wrap.className = "param"; wrap.hidden = !shown(p, group); wrap.dataset.name = p.name;
  const id = "p-" + p.name;
  if (p.type === "number") {
    wrap.innerHTML = `<label for="${id}">${p.label}<span class="val"><output></output></span></label>
      <div class="slider"><button class="step" aria-label="Less ${p.label}">−</button>
      <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">
      <button class="step" aria-label="More ${p.label}">+</button></div>` + (p.help ? `<p>${p.help}</p>` : "");
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
    wrap.innerHTML = `<label for="${id}">${p.label}</label><select id="${id}">` +
      p.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("") + "</select>" +
      (p.help ? `<p>${p.help}</p>` : "");
    const sel = wrap.querySelector("select");
    sel.value = vals[p.name];
    const pick = (v) => { vals[p.name] = sel.value = v; reset.hidden = v === p.default; refreshVisibility(); edited(); };
    const reset = resetButton(p, () => pick(p.default));
    wrap.querySelector("label").append(reset);
    sel.addEventListener("change", () => pick(sel.value));
  }
  return wrap;
}

// any later change closes an Undo offer, so Undo never brings back a kit older than the last edit
function edited() {
  if ($("toast").querySelector("button")) $("toast").hidden = true;
  renderNames(); changed(); saveKit();
  const all = $("reset-all");
  if (all && cur()) all.hidden = !Object.keys(ownParams(cur())).length;
}

// pockets: the width slider's maximum follows the count and the wall, so the pockets always fit
function fitPockets() {
  const w = document.querySelector("#p-pocket_w");
  if (!w || cur().insertId !== "pocket") return;
  const v = cur().values, def = insertDef("pocket");
  const max = Math.floor((def.max_span - (v.pocket_n - 1) * v.pocket_gap) / v.pocket_n);
  w.max = max;
  if (v.pocket_w > max) { v.pocket_w = max; w.value = max; w.closest(".param").querySelector("output").textContent = `${max} mm`; }
}

function refreshVisibility() {
  document.querySelectorAll("#editor .param[data-name]").forEach((el) => {
    el.hidden = !shown(spec(el.dataset.name), defOf(cur()));
  });
}

// the editor shows the selected item only. Simple: the main choices. Advanced: every setting.
function buildEditor() {
  const box = $("editor"); box.innerHTML = "";
  const it = cur();
  if (!it) { box.innerHTML = `<p class="hint">Your kit is empty. Add an insert or a housing above.</p>`; return; }
  if (it.type === "housing") {
    cat.housing.params.filter((p) => mode === "advanced" || p.simple).forEach((p) => box.append(control(p, cat.housing)));
  } else buildInsertEditor(box, it);
  // the way between the two modes sits right under the settings
  const more = document.createElement("button");
  more.className = "more";
  more.textContent = mode === "simple" ? "Show all settings" : "Show fewer settings";
  more.onclick = () => { setMode(mode === "simple" ? "advanced" : "simple"); };
  // every setting back to its default; an insert keeps its kind
  const all = document.createElement("button");
  all.id = "reset-all"; all.textContent = "Reset all to defaults";
  all.hidden = !Object.keys(ownParams(it)).length;
  all.onclick = () => {
    const done = undoable(`${nameOf(it)}: every setting is back to its default.`);
    kit.items[kit.sel] = it.type === "housing" ? newHousing() : newInsert(it.insertId);
    buildEditor(); edited(); done();
  };
  box.append(more, all);
}

function buildInsertEditor(box, it) {
  const def = insertDef(it.insertId);
  const pickKind = (id) => {
    if (id === cur().insertId) return;
    const done = undoable(`${nameOf(cur())} is now ${insertDef(id).name.toLowerCase()}.`);
    kit.items[kit.sel] = newInsert(id); buildEditor(); edited(); done();
  };
  box.append(optionButtons("Kind", cat.inserts.map((i) => ({
    label: i.name, blurb: i.blurb, active: i.id === it.insertId, pick: () => pickKind(i.id) }))));
  if (mode === "simple") {
    const sc = def.simple_choice;
    if (sc) box.append(optionButtons(sc.label, sc.options.map((o) => ({
      label: o.label, blurb: o.blurb,
      // depth and lip radius are only a starting point, the slider changes them without changing the shape
      active: Object.entries(o.values).every(([k, v]) => k === "slot_d" || k === "grip_r" || it.values[k] === v),
      pick: () => { Object.assign(cur().values, o.values); buildEditor(); edited(); } }))));
    def.params.filter((p) => p.simple).forEach((p) => box.append(control(p, def)));
  } else {
    // presets as one dropdown, so they do not crowd the page
    const presets = cat.presets.filter((p) => p.insert === it.insertId);
    const wrap = document.createElement("div"); wrap.className = "param";
    wrap.innerHTML = `<label for="p-preset">Start from</label><select id="p-preset"><option value="">Choose a preset…</option>` +
      presets.map((p, n) => `<option value="${n}">${p.name}</option>`).join("") + "</select>";
    wrap.querySelector("select").onchange = (e) => {
      if (e.target.value === "") return;
      kit.items[kit.sel] = newInsert(it.insertId, presets[Number(e.target.value)].values);
      buildEditor(); edited();
    };
    box.append(wrap);
    def.params.forEach((p) => box.append(control(p, def)));
  }
  fitPockets();
}

// ---------- kit list
// sticky: the toast stays until the next one or until hideToast(the number toast returned).
// undo: an Undo button that calls it
let toastTimer = null, toastNo = 0;
function toast(text, sticky, undo) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  if (undo) {
    const b = document.createElement("button"); b.textContent = "Undo";
    b.onclick = () => { t.hidden = true; undo(); };
    t.append(b);
  }
  clearTimeout(toastTimer); if (!sticky) toastTimer = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 3500);
  return ++toastNo;
}
function hideToast(no) { if (no === toastNo) $("toast").hidden = true; }

// a copy of the kit before a change that loses settings, for Undo
function undoable(text) {
  const items = JSON.parse(JSON.stringify(kit.items)), sel = kit.sel;
  return () => toast(text, false, () => { kit.items = items; kit.sel = sel; partnerKey = "auto"; buildEditor(); edited(); });
}

function select(n) { kit.sel = n; partnerKey = "auto"; buildEditor(); edited(); }

function addItem(it) {
  kit.items.push(it); kit.sel = kit.items.length - 1; partnerKey = "auto";
  buildEditor(); edited();
  toast(`Added ${nameOf(it)}. Change it below.`);
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
}

function drop(k) {
  model.remove(meshes[k]);
  meshes[k].children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  delete meshes[k];
}

async function update() {
  const my = ++seq, it = cur();
  const jobs = [];
  if (it) {
    const p = partner(it);
    const h = it.type === "housing" ? it : p;
    const ins = it.type === "insert" ? it : p;
    // the insert lines up with the floor of the housing it is shown in
    if (ins) partsOf(ins).forEach((q) => jobs.push({ part: q.part, params: Object.assign(ownParams(ins), h ? { floor_t: h.values.floor_t } : {}) }));
    if (h) {
      jobs.push({ part: "housing", params: ownParams(h), ghost: it.type === "insert" });   // see-through around an insert
      jobs.push({ part: "carabiner", params: ownParams(h) });
    }
  }
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
  dl.innerHTML = kit.items.length ? `<p class="hint">PETG, ready to slice.
    <a href="https://github.com/awalvie/opengrips/blob/main/PRINTING.md" target="_blank" rel="noopener">Printing guide</a></p>` : "";
  kit.items.forEach((it) => {
    const box = document.createElement("div"); box.className = "ditem";
    box.innerHTML = `<h3>${nameOf(it)}</h3>`;
    it.skip = it.skip || {};   // parts left out of the zip, by part name; a plain object so that Copy keeps it
    partsOf(it).forEach((p) => {
      const row = document.createElement("div"); row.className = "dfile";
      row.innerHTML = `<label><input type="checkbox"${it.skip[p.part] ? "" : " checked"}>
        <span><strong>${p.name}<i>.stl</i></strong><small>${p.settings} · ${p.supports}</small></span></label>
        <button type="button" title="Download only ${p.name}.stl"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg></button>`;
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

// the ticked files: all of them is the kit, fewer is a count
function picked() { return kit.items.flatMap((it, n) => partsOf(it).filter((p) => !it.skip[p.part]).map((p) => ({ it, n, p }))); }
let zipping = false;
function kitButton() {
  if (zipping) return;
  const n = picked().length, all = kit.items.reduce((s, it) => s + partsOf(it).length, 0);
  $("b-kit").textContent = n === all ? "Download kit" : !n ? "No files picked" : `Download ${n} file${n === 1 ? "" : "s"}`;
  $("b-kit").disabled = !n;
}

// the button spins and ignores more taps until the file is saved
async function downloadPart(p, it, b) {
  b.disabled = true; b.classList.add("busy");
  const no = toast(`Preparing ${p.name}.stl…`, true);
  try {
    const params = cleanParams(ownParams(it));
    saveBlob(new Blob([await stl(p.part, params, true)], { type: "model/stl" }), fileName(p.part, params));
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
  const roller = inserts.some((x) => x.insertId === "roller");
  const need = ["A steel screwgate carabiner and a loading pin or sling for the weights."];
  if (roller) need.push("For the roller: a 12 mm steel rod or dowel works as the axle, or print it.");
  const steps = [];
  if (roller) steps.push("Roller: drop the roller between the cheeks, push the axle through both cheeks and the roller.");
  if (inserts.length) steps.push("Slide the insert into the housing until both side buttons click.",
                                 "To swap: pinch both buttons, pull the insert out by the grip, push the next one in.");
  if (housings.length) steps.push("Clip the carabiner to the anchor under the housing. Check it before every session.");
  const list = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  $("need").innerHTML = `<details><summary>Hardware and assembly</summary><strong>You also need</strong>${list(need)}`
    + (steps.length ? `<strong>Put it together</strong>${list(steps)}` : "") + `</details>`;
}

// one folder per item, NN-name/part.stl, so equal parts of two items do not overwrite each other
async function downloadKit() {
  const b = $("b-kit");
  zipping = true; b.disabled = true; b.textContent = "Preparing…";
  const no = toast("Preparing the zip. New parts take a moment each.", true);
  try {
    const files = picked().map(({ it, n, p }) => {
      const folder = String(n + 1).padStart(2, "0") + "-" + nameOf(it).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      const params = cleanParams(ownParams(it));
      return stl(p.part, params, true).then((data) => ({ name: `${folder}/${p.part}.stl`, data: new Uint8Array(data) }));
    });
    saveBlob(await makeZip(await Promise.all(files)), "opengrips-kit.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    zipping = false; kitButton();
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
      Object.entries(x.h || x.v || {}).forEach(([n, v]) => { if (!own.includes(n)) throw new Error(n); it.values[n] = v; });
      cleanParams(it.values);
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
