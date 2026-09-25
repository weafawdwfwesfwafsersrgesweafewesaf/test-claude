// Réécriture ciblée d'un .rbxl : modifie des propriétés texte, reparente, ajoute des ModuleScripts.
// Les chunks non touchés sont recopiés octet pour octet.
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
const { parse, R, name } = require('./rbxl.js');

const SIZES = { 0x02: 1, 0x09: 1, 0x0A: 1, 0x03: 4, 0x04: 4, 0x0B: 4, 0x12: 4, 0x1C: 4, 0x1B: 8, 0x21: 8, 0x1F: 16 };

function splitProp(data, n) {
  const r = new R(data);
  const classId = r.u32(), pname = r.str().toString(), type = r.u8();
  let vals;
  if (type === 0x01) { vals = []; for (let i = 0; i < n; i++) vals.push(r.str()); }
  else if (type === 0x13) { vals = r.refs(n); }
  else if (SIZES[type] === 1) { vals = []; for (let i = 0; i < n; i++) vals.push(Buffer.from([r.u8()])); }
  else if (SIZES[type]) { vals = r.interleaved(n, SIZES[type]); }
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
  let body;
  if (p.type === 0x01) body = Buffer.concat(p.vals.map(strb));
  else if (p.type === 0x13) body = encRefs(p.vals);
  else if (SIZES[p.type] === 1) body = Buffer.concat(p.vals);
  else body = interleave(p.vals, SIZES[p.type]);
  return Buffer.concat([head, body]);
}

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
  save(file) {
    const out = [];
    const h = Buffer.from(this.g.header);
    h.writeInt32LE(h.readInt32LE(20) + this.added.length, 20);
    out.push(h);
    for (const c of this.g.chunks) {
      let data = null;
      if (c.name === 'INST') {
        const id = c.data.readUInt32LE(0), k = this.g.classes[id];
        if (k.dirtyInst) data = Buffer.concat([u32(id), strb(k.cls), Buffer.from([k.fmt]), u32(k.refs.length), encRefs(k.refs)]);
      } else if (c.name === 'PROP' && this.dirty.has(c)) {
        data = joinProp(this.props.get(c));
      } else if (c.name === 'PRNT' && (this.added.length || this.reparent.size)) {
        const r = new R(c.data); const ver = r.u8(); const n = r.u32();
        const ch = r.refs(n), pa = r.refs(n).map((p, i) => this.reparent.has(ch[i]) ? this.reparent.get(ch[i]) : p);
        for (const a of this.added) { ch.push(a.ref); pa.push(a.parent); }
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
module.exports = { Place };
