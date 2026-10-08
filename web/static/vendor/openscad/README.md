# OpenSCAD for the browser

openscad.js and openscad.wasm render the parts in the configurator page.

- Version: OpenSCAD nightly 2026.10.05 (git c0ac8289), WebAssembly web build
- From: https://files.openscad.org/snapshots/OpenSCAD-2026.10.05-WebAssembly-web.zip
- sha256 of the zip: a27c885251865aca407af68908ced454266f902cd2b59e1923e33a97c825ef3d
  (matches the published OpenSCAD-2026.10.05-WebAssembly-web.zip.sha256)
- Source: https://github.com/openscad/openscad/tree/c0ac8289f1c9db6f70891da5df3b4085b7eaf8b6
- Licence: GPL-2.0-or-later, see COPYING

The files are unchanged from the zip. Older builds (2025.03.25 and the npm
openscad-wasm-prebuilt 1.2.0) break some hulls in these parts; do not swap them in.
