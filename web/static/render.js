// Render worker: OpenSCAD (WebAssembly) turns one part of opengrips.scad into a binary STL per job.
// An OpenSCAD instance renders only once, so every job gets a fresh one. The compiled module,
// the sources and the font are fetched once and shared by all instances.
import OpenSCAD from "./vendor/openscad/openscad.js";

const files = {};   // path in OpenSCAD's in-memory file system: contents
let wasm = null, ready = null;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// follow include <> and use <> from opengrips.scad, so a new source file needs no list here
async function source(path) {
  if (("/w/" + path) in files) return;
  files["/w/" + path] = "";
  const text = new TextDecoder().decode(await get(path));
  files["/w/" + path] = text;
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  await Promise.all([...text.matchAll(/^\s*(?:include|use)\s*<([^>]+)>/gm)].map((m) => source(dir + m[1])));
}

async function load() {
  // without the font, text() renders nothing and the engraved marks silently vanish
  const [mod, font, conf] = await Promise.all([
    get("vendor/openscad/openscad.wasm").then((b) => WebAssembly.compile(b)),
    get("vendor/fonts/LiberationSans-Bold.ttf"), get("vendor/fonts/fonts.conf"), source("opengrips.scad")]);
  wasm = mod;
  files["/fonts/LiberationSans-Bold.ttf"] = font;
  files["/fonts/fonts.conf"] = conf;
}

async function render(part, params) {
  const log = [];
  // Emscripten has no failure callback for instantiateWasm: without the race, a failed start
  // (out of memory on a phone, say) leaves this job and every one queued after it waiting forever
  let fail;
  const failed = new Promise((_, reject) => { fail = reject; });
  const inst = await Promise.race([OpenSCAD({
    noInitialRun: true, print: (s) => log.push(s), printErr: (s) => log.push(s),
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((i) => done(i, wasm),
        (e) => fail(new Error(`The 3D renderer could not start: ${e.message}`)));
      return {};
    },
  }), failed]);
  const FS = inst.FS;
  for (const [path, data] of Object.entries(files)) {
    let dir = "";
    for (const d of path.split("/").slice(1, -1)) { dir += "/" + d; try { FS.mkdir(dir); } catch (e) { /* exists */ } }
    FS.writeFile(path, data);
  }
  const args = ["/w/opengrips.scad", "--backend=Manifold", "--export-format", "binstl", "-o", "/out.stl", "-D", `part="${part}"`];
  for (const [k, v] of Object.entries(params)) args.push("-D", typeof v === "string" ? `${k}="${v}"` : `${k}=${v}`);
  let rc, stl = null;
  try { rc = inst.callMain(args); } catch (e) { rc = typeof e.status === "number" ? e.status : e; }
  try { stl = FS.readFile("/out.stl"); } catch (e) { /* no output */ }
  if (rc !== 0 || !stl) {
    // the log also holds start-up noise; keep the lines that say what went wrong
    const errors = log.filter((l) => /ERROR|WARNING|assert|empty/i.test(l));
    throw new Error(errors.join("\n").slice(-500) || "OpenSCAD failed");
  }
  return stl;
}

// one job at a time: a render takes the whole thread anyway
let queue = Promise.resolve();
onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      // after a failed load, the next job starts over
      ready ??= load().catch((e) => { ready = null; Object.keys(files).forEach((k) => delete files[k]); throw e; });
      await ready;
      const stl = await render(data.part, data.params);
      postMessage({ id: data.id, stl: stl.buffer }, [stl.buffer]);
    } catch (e) {
      postMessage({ id: data.id, error: e.message || String(e) });
    }
  });
};
