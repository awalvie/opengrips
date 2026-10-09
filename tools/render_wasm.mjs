// Render one part with the WebAssembly OpenSCAD the configurator uses, the same way the page does
// (web/static/render.js), so tools/check_parts.py can check the files people download.
// Usage: node tools/render_wasm.mjs out.stl 'part="insert_edge"' [slot_d=25 ...], each one an OpenSCAD -D
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "web/static/vendor");
const [out, ...defs] = process.argv.slice(2);

const OpenSCAD = (await import(path.join(VENDOR, "openscad/openscad.js"))).default;
const log = [];
const inst = await OpenSCAD({ wasmBinary: fs.readFileSync(path.join(VENDOR, "openscad/openscad.wasm")),
                              noInitialRun: true, print: (s) => log.push(s), printErr: (s) => log.push(s) });
const FS = inst.FS;

// the sources at the paths the page uses: opengrips.scad and src/
function copy(dir, to) {
  FS.mkdir(to);
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) copy(p, `${to}/${n}`);
    else if (n.endsWith(".scad")) FS.writeFile(`${to}/${n}`, fs.readFileSync(p));
  }
}
FS.mkdir("/w");
FS.writeFile("/w/opengrips.scad", fs.readFileSync(path.join(ROOT, "opengrips.scad")));
copy(path.join(ROOT, "src"), "/w/src");
// without the font, text() renders nothing
FS.mkdir("/fonts");
FS.writeFile("/fonts/LiberationSans-Bold.ttf", fs.readFileSync(path.join(VENDOR, "fonts/LiberationSans-Bold.ttf")));
FS.writeFile("/fonts/fonts.conf", fs.readFileSync(path.join(VENDOR, "fonts/fonts.conf")));

const args = ["/w/opengrips.scad", "--backend=Manifold", "--export-format", "binstl", "-o", "/out.stl"];
for (const d of defs) args.push("-D", d);
let rc, stl = null;
try { rc = inst.callMain(args); } catch (e) { rc = typeof e.status === "number" ? e.status : 1; }
try { stl = FS.readFile("/out.stl"); } catch (e) { /* no output */ }
if (rc !== 0 || !stl) {
  console.error(log.filter((l) => /ERROR|WARNING|assert|empty/i.test(l)).join("\n") || "OpenSCAD failed");
  process.exit(1);
}
fs.writeFileSync(out, stl);
