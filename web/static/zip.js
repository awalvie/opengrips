// A zip writer small enough to need no library. Files are deflated where the browser has
// CompressionStream, else stored as they are.
const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

async function deflate(b) {
  try {
    return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  } catch (e) {
    return null;   // no CompressionStream, or no raw deflate in it
  }
}

// little-endian fields: [value, bytes]
function le(...fields) {
  const out = new Uint8Array(fields.reduce((n, [, size]) => n + size, 0)), dv = new DataView(out.buffer);
  let at = 0;
  fields.forEach(([v, size]) => { if (size === 2) dv.setUint16(at, v, true); else dv.setUint32(at, v, true); at += size; });
  return out;
}

// files: [{name, data: Uint8Array}], names in ASCII. Returns a Blob.
async function makeZip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const body = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name), packed = await deflate(f.data);
    const data = packed && packed.length < f.data.length ? packed : f.data;
    // the same fields sit in the local header and in the central directory
    const meta = [[data === f.data ? 0 : 8, 2], [time, 2], [date, 2], [crc32(f.data), 4],
                  [data.length, 4], [f.data.length, 4], [name.length, 2], [0, 2]];
    const local = le([0x04034b50, 4], [20, 2], [0, 2], ...meta);
    central.push(le([0x02014b50, 4], [20, 2], [20, 2], [0, 2], ...meta, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]), name);
    body.push(local, name, data);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = le([0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [size, 4], [offset, 4], [0, 2]);
  return new Blob([...body, ...central, end], { type: "application/zip" });
}
