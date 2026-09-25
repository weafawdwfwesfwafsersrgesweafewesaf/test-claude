// Réécriture ciblée d'un .rbxl : modifie des propriétés texte, reparente, ajoute des ModuleScripts.
// Les chunks non touchés sont recopiés octet pour octet.
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
const { parse, R, name } = require('./rbxl.js');

const SIZES = { 0x02: 1, 0x09: 1, 0x0A: 1, 0x03: 4, 0x04: 4, 0x0B: 4, 0x12: 4, 0x1C: 4, 0x1B: 8, 0x21: 8, 0x1F: 16 };

function cframes(r, n) {
  const rots = [];
  for (let i = 0; i < n; i++) { const id = r.u8(); if (id === 0) { rots.push(Buffer.concat([Buffer.from([0]), r.b.subarray(r.p, r.p + 36)])); r.p += 36; } else rots.push(Buffer.from([id])); }
  const xs = r.interleaved(n), ys = r.interleaved(n), zs = r.interleaved(n);
  return rots.map((rot, i) => ({ rot, pos: [xs[i], ys[i], zs[i]] }));
}
function splitProp(data, n) {
  const r = new R(data);
  const classId = r.u32(), pname = r.str().toString(), type = r.u8();
  let vals;
  if (type === 0x01) { vals = []; for (let i = 0; i < n; i++) vals.push(r.str()); }
  else if (type === 0x13) { vals = r.refs(n); }
  else if (SIZES[type] === 1) { vals = []; for (let i = 0; i < n; i++) vals.push(Buffer.from([r.u8()])); }
  else if (SIZES[type]) { vals = r.interleaved(n, SIZES[type]); }
  else if (type === 0x0E || type === 0x0C) { const xs = r.interleaved(n), ys = r.interleaved(n), zs = r.interleaved(n); vals = xs.map((x, i) => [x, ys[i], zs[i]]); }
  else if (type === 0x10) { vals = cframes(r, n); }
  else if (type === 0x1A) { const b = r.b; vals = []; for (let i = 0; i < n; i++) vals.push(Buffer.from([b[r.p + i], b[r.p + n + i], b[r.p + 2 * n + i]])); r.p += 3 * n; }
  else if (type === 0x19) {
    vals = [];
    for (let i = 0; i < n; i++) { const f = r.b[r.p]; const len = (f === 0 || f === 2) ? 1 : f === 1 ? 21 : f === 3 ? 25 : -1; if (len < 0) return null; vals.push(Buffer.from(r.b.subarray(r.p, r.p + len))); r.p += len; }
  }
  else if (type === 0x1E) {
    if (r.u8() !== 0x10) return null;
    const c = cframes(r, n);
    if (r.u8() !== 0x02) return null;
    vals = c.map(v => ({ rot: v.rot, pos: v.pos, has: r.u8() }));
  }
  else return null; // type non géré : chunk non modifiable
  if (r.p !== data.length) throw new Error(`taille inattendue pour ${pname} (type ${type})`);
  return { classId, pname, type, vals };
}

function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; }
function strb(s) { const b = Buffer.isBuffer(s) ? s : Buffer.from(s, 'utf8'); return Buffer.concat([u32(b.length), b]); }
function interleave(vals, size) {
  const n = vals.length, out = Buffer.alloc(n * size);
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[k * n + i] = vals[i][k];
  return out;
}
function encRefs(refs) {
  let prev = 0;
  return interleave(refs.map(r => { const d = r - prev; prev = r; const z = ((d << 1) ^ (d >> 31)) >>> 0; const b = Buffer.alloc(4); b.writeUInt32BE(z); return b; }), 4);
}
function joinProp(p) {
  const head = Buffer.concat([u32(p.classId), strb(p.pname), Buffer.from([p.type])]);
  const v = p.vals;
  let body;
  if (p.type === 0x01) body = Buffer.concat(v.map(strb));
  else if (p.type === 0x13) body = encRefs(v);
  else if (SIZES[p.type] === 1) body = Buffer.concat(v);
  else if (SIZES[p.type]) body = interleave(v, SIZES[p.type]);
  else if (p.type === 0x0E || p.type === 0x0C) body = Buffer.concat([interleave(v.map(t => t[0]), 4), interleave(v.map(t => t[1]), 4), interleave(v.map(t => t[2]), 4)]);
  else if (p.type === 0x10) body = Buffer.concat([...v.map(c => c.rot), interleave(v.map(c => c.pos[0]), 4), interleave(v.map(c => c.pos[1]), 4), interleave(v.map(c => c.pos[2]), 4)]);
  else if (p.type === 0x1A) body = Buffer.concat([Buffer.from(v.map(c => c[0])), Buffer.from(v.map(c => c[1])), Buffer.from(v.map(c => c[2]))]);
  else if (p.type === 0x19) body = Buffer.concat(v);
  else if (p.type === 0x1E) body = Buffer.concat([Buffer.from([0x10]), ...v.map(c => c.rot), interleave(v.map(c => c.pos[0]), 4), interleave(v.map(c => c.pos[1]), 4), interleave(v.map(c => c.pos[2]), 4), Buffer.from([0x02]), Buffer.from(v.map(c => c.has))]);
  return Buffer.concat([head, body]);
}

// Encodeurs de valeurs neuves
function rbxFloat(x) { const b = Buffer.alloc(4); b.writeFloatBE(x); let u = b.readUInt32BE(0); u = ((u << 1) | (u >>> 31)) >>> 0; const o = Buffer.alloc(4); o.writeUInt32BE(u); return o; }
const enc = {
  str: s => Buffer.from(s, 'utf8'),
  bool: b => Buffer.from([b ? 1 : 0]),
  float: x => rbxFloat(x),
  enumv: e => { const b = Buffer.alloc(4); b.writeUInt32BE(e); return b; },
  vec3: v => v.map(rbxFloat),
  cframe: m => { const rot = Buffer.alloc(37); rot[0] = 0; for (let i = 0; i < 9; i++) rot.writeFloatLE(m[3 + i], 1 + i * 4); return { rot, pos: [rbxFloat(m[0]), rbxFloat(m[1]), rbxFloat(m[2])] }; },
  optcf: m => Object.assign(enc.cframe(m), { has: 1 }),
  rgb8: c => Buffer.from(c),
  attrs: o => { const parts = [u32(Object.keys(o).length)]; for (const [k, v] of Object.entries(o)) { const d = Buffer.alloc(8); d.writeDoubleLE(v); parts.push(strb(k), Buffer.from([0x06]), d); } return Buffer.concat(parts); },
};

class Place {
  constructor(file) {
    this.g = parse(fs.readFileSync(file));
    this.dirty = new Set();
    this.props = new Map();       // chunk -> split
    this.added = [];              // { ref, parent }
    this.reparent = new Map();
    this.nextRef = Object.keys(this.g.inst).map(Number).reduce((a, b) => Math.max(a, b), 0) + 1;
  }
  find(path) {
    const parts = path.split('/');
    let cur = this.g.roots.filter(r => name(r) === parts[0]);
    for (const p of parts.slice(1)) cur = cur.flatMap(o => o.children.filter(c => name(c) === p));
    if (cur.length !== 1) throw new Error(`${path} : ${cur.length} résultat(s)`);
    return cur[0];
  }
  propChunk(cls, pname) {
    for (const c of this.g.chunks) {
      if (c.name !== 'PROP') continue;
      const id = c.data.readUInt32LE(0);
      if (this.g.classes[id].cls !== cls) continue;
      const n = c.data.readUInt32LE(4);
      if (c.data.toString('utf8', 8, 8 + n) === pname) return c;
    }
    return null;
  }
  split(c) {
    if (!this.props.has(c)) {
      const k = this.g.classes[c.data.readUInt32LE(0)];
      const s = splitProp(c.data, k.refs.length);
      if (!s) throw new Error('type non géré');
      this.props.set(c, s);
    }
    return this.props.get(c);
  }
  // Change une propriété texte ; `expect` = valeur actuelle attendue (sinon on refuse).
  setString(inst, pname, value, expect) {
    const c = this.propChunk(inst.cls, pname);
    const s = this.split(c);
    const i = this.g.classes[s.classId].refs.indexOf(inst.ref);
    const cur = s.vals[i];
    if (expect !== undefined && !cur.equals(Buffer.isBuffer(expect) ? expect : Buffer.from(expect, 'utf8')))
      throw new Error(`${name(inst)}.${pname} : valeur actuelle inattendue`);
    s.vals[i] = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    this.dirty.add(c);
  }
  setParent(inst, parent) { this.reparent.set(inst.ref, parent.ref); }
  classChunks(k) {
    if (!k.chunks) k.chunks = this.g.chunks.filter(c => c.name === 'PROP' && this.g.classes[c.data.readUInt32LE(0)] === k).map(c => { this.dirty.add(c); return this.split(c); });
    return k.chunks;
  }
  // Nouvelle instance : copie des props du modèle `template`, puis `values` (déjà encodées) par-dessus.
  addNew(template, parentRef, values) {
    const k = Object.values(this.g.classes).find(k => k.cls === template.cls);
    if (k.tplIdx === undefined || k.tplRef !== template.ref) { k.tplIdx = k.refs.indexOf(template.ref); k.tplRef = template.ref; }
    const ref = this.nextRef++;
    for (const s of this.classChunks(k)) {
      let v;
      if (s.pname in values) v = values[s.pname];
      else {
        v = s.vals[k.tplIdx];
        if (s.type === 0x1F) { v = Buffer.from(v); crypto.randomBytes(8).copy(v, 8); }
      }
      s.vals.push(v);
    }
    k.refs.push(ref);
    k.dirtyInst = true;
    this.added.push({ ref, parent: parentRef });
    return ref;
  }
  // Nouvelle instance de la même classe que `template`, props copiées puis surchargées.
  addLike(template, parent, overrides) {
    const k = Object.values(this.g.classes).find(k => k.cls === template.cls);
    const idx = k.refs.indexOf(template.ref);
    const ref = this.nextRef++;
    for (const c of this.g.chunks) {
      if (c.name !== 'PROP' || this.g.classes[c.data.readUInt32LE(0)] !== k) continue;
      const s = this.split(c);
      let v = s.vals[idx];
      if (s.pname in overrides) v = Buffer.from(overrides[s.pname], 'utf8');
      else if (s.type === 0x1F) { v = Buffer.from(v); crypto.randomBytes(8).copy(v, 8); }
      else if (Buffer.isBuffer(v)) v = Buffer.from(v);
      s.vals.push(v);
      this.dirty.add(c);
    }
    k.refs.push(ref);
    k.dirtyInst = true;
    this.added.push({ ref, parent: parent.ref });
    return ref;
  }
  // Supprime des instances (et leurs propriétés). À appeler après les ajouts qui s'en servent comme modèles.
  remove(refs) {
    const gone = new Set(refs);
    this.removed = (this.removed || 0) + gone.size;
    this.gone = gone;
    for (const k of Object.values(this.g.classes)) {
      if (!k.refs.some(r => gone.has(r))) continue;
      const keep = k.refs.map(r => !gone.has(r));
      for (const s of this.classChunks(k)) s.vals = s.vals.filter((_, i) => keep[i]);
      k.refs = k.refs.filter(r => !gone.has(r));
      k.dirtyInst = true;
      k.tplIdx = undefined;
    }
    // aucune propriété Ref ne doit plus pointer vers une instance supprimée
    for (const c of this.g.chunks) {
      if (c.name !== 'PROP' || c.data[8 + c.data.readUInt32LE(4)] !== 0x13) continue;
      const s = this.split(c);
      if (s.vals.some(r => gone.has(r))) { s.vals = s.vals.map(r => gone.has(r) ? -1 : r); this.dirty.add(c); }
    }
  }
  // Après des suppressions, Roblox exige des identifiants continus (0 .. N-1) : on renumérote tout.
  compact() {
    const all = [];
    for (const k of Object.values(this.g.classes)) all.push(...k.refs);
    all.sort((a, b) => a - b);
    const map = new Map(all.map((r, i) => [r, i]));
    const m = r => (r === -1 ? -1 : (map.has(r) ? map.get(r) : -1));
    for (const k of Object.values(this.g.classes)) { k.refs = k.refs.map(m); k.dirtyInst = true; }
    for (const c of this.g.chunks) {
      if (c.name !== 'PROP' || c.data[8 + c.data.readUInt32LE(4)] !== 0x13) continue;
      const s = this.split(c);
      s.vals = s.vals.map(m);
      this.dirty.add(c);
    }
    this.refMap = m;
  }
  save(file) {
    if (this.removed && !this.refMap) this.compact();
    const M = this.refMap || (r => r);
    const out = [];
    const h = Buffer.from(this.g.header);
    h.writeInt32LE(h.readInt32LE(20) + this.added.length - (this.removed || 0), 20);
    out.push(h);
    for (const c of this.g.chunks) {
      let data = null;
      if (c.name === 'INST') {
        const id = c.data.readUInt32LE(0), k = this.g.classes[id];
        if (k.dirtyInst) data = Buffer.concat([u32(id), strb(k.cls), Buffer.from([k.fmt]), u32(k.refs.length), encRefs(k.refs)]);
      } else if (c.name === 'PROP' && this.dirty.has(c)) {
        data = joinProp(this.props.get(c));
      } else if (c.name === 'PRNT' && (this.added.length || this.reparent.size || this.removed)) {
        const r = new R(c.data); const ver = r.u8(); const n = r.u32();
        let ch = r.refs(n), pa = r.refs(n).map((p, i) => this.reparent.has(ch[i]) ? this.reparent.get(ch[i]) : p);
        if (this.gone) { const keep = ch.map(x => !this.gone.has(x)); ch = ch.filter((_, i) => keep[i]); pa = pa.filter((_, i) => keep[i]); }
        for (const a of this.added) { ch.push(a.ref); pa.push(a.parent); }
        ch = ch.map(M); pa = pa.map(M);
        data = Buffer.concat([Buffer.from([ver]), u32(ch.length), encRefs(ch), encRefs(pa)]);
      }
      if (!data) { out.push(c.raw); continue; }
      const z = zlib.zstdCompressSync(data);
      const hd = Buffer.alloc(16); hd.write(c.name, 0, 'latin1'); hd.writeUInt32LE(z.length, 4); hd.writeUInt32LE(data.length, 8);
      out.push(hd, z);
    }
    fs.writeFileSync(file, Buffer.concat(out));
  }
}
module.exports = { Place, enc };
