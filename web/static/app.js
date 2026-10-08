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
const kit = { items: [], sel: 0 };
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

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sceneColor);
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
  const vfov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const d = r / Math.tan(Math.min(vfov, hfov) / 2) * 1.05;   // narrow phone screens: the width limits
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 1.2).normalize().multiplyScalar(d));
  controls.update();
}

function status(text, err) {
  const s = $("status"); s.hidden = !text; s.textContent = text || ""; s.classList.toggle("err", !!err);
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

function stlUrl(part, it, extra) {
  const q = new URLSearchParams(Object.assign(ownParams(it), extra || {}));
  q.set("part", part);
  return "/api/stl?" + q.toString();
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

function control(p, group) {
  const vals = cur().values;
  if (p.type === "choice" && p.options.length <= 3) {
    const w = optionButtons(p.label, p.options.map((o) => {
      const m = o.label.match(/^(.*?)\s*\((.*)\)$/) || [null, o.label, ""];
      return { label: m[1], blurb: m[2], active: vals[p.name] === o.value,
               pick: () => { vals[p.name] = o.value; refreshVisibility(); edited(); } };
    }), p.help);
    w.dataset.name = p.name; w.hidden = !shown(p, group);
    return w;
  }
  const wrap = document.createElement("div");
  wrap.className = "param"; wrap.hidden = !shown(p, group); wrap.dataset.name = p.name;
  const id = "p-" + p.name;
  if (p.type === "number") {
    wrap.innerHTML = `<label for="${id}">${p.label}<output></output></label>
      <div class="slider"><button class="step" aria-label="Less ${p.label}">−</button>
      <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">
      <button class="step" aria-label="More ${p.label}">+</button></div>` + (p.help ? `<p>${p.help}</p>` : "");
    const input = wrap.querySelector("input"), out = wrap.querySelector("output");
    const [less, more] = wrap.querySelectorAll(".step");
    input.value = vals[p.name];
    const show = () => { out.textContent = `${input.value}${p.unit ? " " + p.unit : ""}`; };
    const set = (v) => {
      input.value = Math.min(Number(input.max), Math.max(p.min, v));
      vals[p.name] = Number(input.value); show(); fitPockets(); edited();
    };
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
    sel.addEventListener("change", () => { vals[p.name] = sel.value; refreshVisibility(); edited(); });
  }
  return wrap;
}

function edited() { renderNames(); changed(); }

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
  box.append(more);
}

function buildInsertEditor(box, it) {
  const def = insertDef(it.insertId);
  const pickKind = (id) => { if (id !== cur().insertId) { kit.items[kit.sel] = newInsert(id); buildEditor(); edited(); } };
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
let toastTimer = null;
function toast(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
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
      kit.items.splice(n, 1);
      kit.sel = Math.max(0, Math.min(kit.sel - (n < kit.sel ? 1 : 0), kit.items.length - 1));
      partnerKey = "auto"; buildEditor(); edited();
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
  clearTimeout(timer);
  timer = setTimeout(update, now ? 0 : 500);
}

// our server answers errors in JSON; a proxy in front of it (502, 504) answers in HTML
async function failure(res) {
  try { return new Error((await res.json()).error || res.statusText); } catch (e) { return new Error("The server is busy. Try again."); }
}

async function loadMesh(job, my) {
  const res = await fetch(job.url);
  if (!res.ok) throw await failure(res);
  const geo = loader.parse(await res.arrayBuffer());
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
    if (ins) partsOf(ins).forEach((q) => jobs.push({ part: q.part, url: stlUrl(q.part, ins, h ? { floor_t: h.values.floor_t } : {}) }));
    if (h) {
      jobs.push({ part: "housing", url: stlUrl("housing", h), ghost: it.type === "insert" });   // see-through around an insert
      jobs.push({ part: "carabiner", url: stlUrl("carabiner", h) });
    }
  }
  const keep = jobs.map((j) => j.part);
  Object.keys(meshes).forEach((k) => {
    if (!keep.includes(k)) drop(k);
  });
  if (!jobs.length || !renderer) { status(""); return; }
  let done = 0, failed = false;   // after a failure the error stays, the parts still loading do not overwrite it
  const progress = () => status(`Rendering ${done + 1} of ${jobs.length}… (a new housing takes about 10 s)`);
  progress();
  try {
    await Promise.all(jobs.map((j) => loadMesh(j, my).then(() => { done++; if (my === seq && !failed && done < jobs.length) progress(); })));
    if (my !== seq) return;
    status("");
    if (!framed) { frame(); framed = true; }
  } catch (e) {
    failed = true;
    if (my === seq) status(e.message, true);
  }
}

// ---------- downloads
function buildDownloads() {
  const dl = $("downloads"); dl.innerHTML = "";
  kit.items.forEach((it) => {
    const box = document.createElement("div"); box.className = "ditem";
    box.innerHTML = `<h3>${nameOf(it)}</h3>`;
    partsOf(it).forEach((p) => {
      const a = document.createElement("a");
      a.href = stlUrl(p.part, it, { download: 1 });
      a.innerHTML = `<strong>${p.name}.stl</strong><small>${p.print}</small>`;
      box.append(a);
    });
    dl.append(box);
  });
  const nh = kit.items.filter((x) => x.type === "housing").length, ni = kit.items.length - nh;
  $("kit-summary").textContent = `Kit: ${ni} insert${ni === 1 ? "" : "s"}, ${nh} housing${nh === 1 ? "" : "s"}`;
  $("kit-count").textContent = `(${kit.items.length})`;
  $("b-kit").disabled = !kit.items.length;
  buildNeed();
}

// the hardware and the steps for the parts in the kit only
function buildNeed() {
  const housings = kit.items.filter((x) => x.type === "housing"), inserts = kit.items.filter((x) => x.type === "insert");
  const roller = inserts.some((x) => x.insertId === "roller");
  const need = ["A steel screwgate carabiner and a loading pin or sling for the weights."];
  const bolts = {};   // bolt diameter: how many housings need one
  housings.filter((h) => h.values.anchor === "bar").forEach((h) => { bolts[h.values.rod_d] = (bolts[h.values.rod_d] || 0) + 1; });
  Object.entries(bolts).forEach(([d, n]) => need.push(n > 1 ? `For the bolt anchors: ${n} steel M${d} bolts, 80 mm, with nuts.`
                                                           : `For the bolt anchor: a steel M${d} bolt, 80 mm, and a nut.`));
  if (roller) need.push("For the roller: a 12 mm steel rod or dowel works as the axle, or print it.");
  const steps = [];
  if (roller) steps.push("Roller: drop the roller between the cheeks, push the axle through both cheeks and the roller.");
  if (inserts.length) steps.push("Slide the insert into the housing until both side buttons click.",
                                 "To swap: pinch both buttons, pull the insert out by the grip, push the next one in.");
  if (housings.length) steps.push("Clip the carabiner to the anchor under the housing. Check it before every session.");
  const list = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  $("need").innerHTML = `<strong>You also need</strong>${list(need)}` + (steps.length ? `<strong>Put it together</strong>${list(steps)}` : "");
}

async function downloadKit() {
  const items = kit.items.map((it) => ({ name: nameOf(it), parts: partsOf(it).map((p) => p.part), params: ownParams(it) }));
  const b = $("b-kit"), label = b.textContent;
  b.disabled = true; b.textContent = "Preparing…";
  toast("Preparing the zip. New parts take a few seconds each.");
  try {
    const res = await fetch("/api/kit", { method: "POST", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ items }) });
    if (!res.ok) throw await failure(res);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = "opengrips-kit.zip";
    document.body.append(a); a.click(); a.remove();
    $("toast").hidden = true;
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    b.disabled = false; b.textContent = label;
  }
}

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

fetch("/api/catalog").then((r) => r.json()).then((c) => {
  cat = c;
  kit.items.push(newInsert("edge"), newHousing());
  setMode(mode); renderNames(); update();
}).catch((e) => status("Could not load the catalog: " + e.message, true));
