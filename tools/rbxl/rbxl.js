// Lecteur / écrivain minimal du format binaire Roblox (.rbxl), écrit à la main.
// Décompression : zlib.zstd de Node (intégré) ou LZ4 (implémenté ici).
const fs = require('fs'), zlib = require('zlib');

function lz4(src, ulen) {
  const dst = Buffer.alloc(ulen); let s = 0, d = 0;
  while (s < src.length) {
    const tok = src[s++]; let lit = tok >> 4;
    if (lit === 15) { let x; do { x = src[s++]; lit += x; } while (x === 255); }
    src.copy(dst, d, s, s + lit); s += lit; d += lit;
    if (s >= src.length) break;
    const off = src[s] | (src[s + 1] << 8); s += 2;
    let ml = tok & 15; if (ml === 15) { let x; do { x = src[s++]; ml += x; } while (x === 255); } ml += 4;
    for (let i = 0; i < ml; i++, d++) dst[d] = dst[d - off];
  }
  return dst;
}

function readChunks(buf) {
  const chunks = []; let p = 32;
  while (p < buf.length) {
    const name = buf.toString('latin1', p, p + 4), clen = buf.readUInt32LE(p + 4), ulen = buf.readUInt32LE(p + 8);
    p += 16;
    let data;
    if (clen === 0) { data = Buffer.from(buf.subarray(p, p + ulen)); p += ulen; }
    else {
      const raw = buf.subarray(p, p + clen); p += clen;
      data = (raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd) ? zlib.zstdDecompressSync(raw) : lz4(raw, ulen);
    }
    chunks.push({ name, data, raw: Buffer.from(buf.subarray(p - (clen || ulen) - 16, p)) });
    if (name === 'END\0') break;
  }
  return { header: Buffer.from(buf.subarray(0, 32)), chunks };
}

class R {
  constructor(b) { this.b = b; this.p = 0; }
  u8() { return this.b[this.p++]; }
  u32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  str() { const n = this.u32(); const s = this.b.subarray(this.p, this.p + n); this.p += n; return Buffer.from(s); }
  interleaved(n, size = 4) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = Buffer.alloc(size);
      for (let k = 0; k < size; k++) v[k] = this.b[this.p + k * n + i];
      out.push(v);
    }
    this.p += n * size;
    return out; // big-endian bytes
  }
  i32s(n) { return this.interleaved(n).map(v => { const x = v.readUInt32BE(0); return (x >>> 1) ^ -(x & 1); }); }
  refs(n) { let acc = 0; return this.i32s(n).map(d => (acc += d)); }
}

function parse(buf) {
  const { header, chunks } = readChunks(buf);
  const classes = {}, inst = {}, sstr = [];
  for (const c of chunks) {
    const r = new R(c.data);
    if (c.name === 'SSTR') {
      r.u32(); const n = r.u32();
      for (let i = 0; i < n; i++) { r.p += 16; sstr.push(r.str()); }
    } else if (c.name === 'INST') {
      const id = r.u32(), cls = r.str().toString(), fmt = r.u8(), n = r.u32();
      const refs = r.refs(n);
      classes[id] = { cls, refs, fmt };
      for (const ref of refs) inst[ref] = { ref, cls, props: {}, children: [], parent: null };
    }
  }
  for (const c of chunks) {
    const r = new R(c.data);
    if (c.name === 'PROP') {
      const id = r.u32(), name = r.str().toString(), type = r.u8();
      const k = classes[id]; const n = k.refs.length;
      let vals = null;
      if (type === 0x01) { vals = []; for (let i = 0; i < n; i++) vals.push(r.str()); }
      else if (type === 0x02) { vals = []; for (let i = 0; i < n; i++) vals.push(!!r.u8()); }
      else if (type === 0x03) { vals = r.i32s(n); }
      else if (type === 0x12) { vals = r.interleaved(n).map(v => v.readUInt32BE(0)); }
      else if (type === 0x1C) { vals = r.interleaved(n).map(v => sstr[v.readUInt32BE(0)]); }
      if (vals) k.refs.forEach((ref, i) => { inst[ref].props[name] = { type, v: vals[i] }; });
      else k.refs.forEach(ref => { inst[ref].props[name] = { type }; });
    } else if (c.name === 'PRNT') {
      r.u8(); const n = r.u32(); const ch = r.refs(n), pa = r.refs(n);
      for (let i = 0; i < n; i++) { const o = inst[ch[i]]; o.parent = pa[i]; if (inst[pa[i]]) inst[pa[i]].children.push(o); }
    }
  }
  const roots = Object.values(inst).filter(o => !inst[o.parent]);
  return { header, chunks, classes, inst, roots, sstr };
}

const name = o => (o.props.Name && o.props.Name.v ? o.props.Name.v.toString() : '?');
module.exports = { parse, readChunks, R, name, lz4 };
