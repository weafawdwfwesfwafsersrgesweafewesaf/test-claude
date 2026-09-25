// Extrait la géométrie des BaseParts d'un sous-arbre : position, rotation, taille, couleur, transparence, CanQuery.
const fs = require('fs'); const { parse, R, name } = require('./rbxl.js');
function rbxFloat(b) { let u = b.readUInt32BE(0); u = ((u >>> 1) | (u << 31)) >>> 0; const t = Buffer.alloc(4); t.writeUInt32BE(u); return t.readFloatBE(0); }
const NORMALS = [[1,0,0],[0,1,0],[0,0,1],[-1,0,0],[0,-1,0],[0,0,-1]];
function rotFromId(id) {
  const k = id - 1, r = NORMALS[Math.floor(k / 6)], u = NORMALS[k % 6];
  const b = [r[1]*u[2]-r[2]*u[1], r[2]*u[0]-r[0]*u[2], r[0]*u[1]-r[1]*u[0]];
  return [r[0],u[0],b[0], r[1],u[1],b[1], r[2],u[2],b[2]]; // lignes de la matrice (colonnes = right, up, back)
}
function readProp(g, c) {
  const r = new R(c.data); const id = r.u32(), pname = r.str().toString(), type = r.u8();
  const k = g.classes[id], n = k.refs.length; let vals = null;
  if (type === 0x10) {
    const rots = [];
    for (let i = 0; i < n; i++) { const rid = r.u8(); if (rid === 0) { const m = []; for (let j = 0; j < 9; j++) { m.push(c.data.readFloatLE(r.p)); r.p += 4; } rots.push(m); } else rots.push(rotFromId(rid)); }
    const xs = r.interleaved(n).map(rbxFloat), ys = r.interleaved(n).map(rbxFloat), zs = r.interleaved(n).map(rbxFloat);
    vals = rots.map((m, i) => ({ m, p: [xs[i], ys[i], zs[i]] }));
  } else if (type === 0x0E) {
    const xs = r.interleaved(n).map(rbxFloat), ys = r.interleaved(n).map(rbxFloat), zs = r.interleaved(n).map(rbxFloat);
    vals = xs.map((x, i) => [x, ys[i], zs[i]]);
  } else if (type === 0x1A) {
    const rr = [...c.data.subarray(r.p, r.p + n)], gg = [...c.data.subarray(r.p + n, r.p + 2 * n)], bb = [...c.data.subarray(r.p + 2 * n, r.p + 3 * n)];
    vals = rr.map((x, i) => [x, gg[i], bb[i]]);
  } else if (type === 0x04) { vals = r.interleaved(n).map(rbxFloat); }
  else if (type === 0x02) { vals = [...c.data.subarray(r.p, r.p + n)].map(Boolean); }
  else if (type === 0x12) { vals = r.interleaved(n).map(v => v.readUInt32BE(0)); }
  return vals ? { k, pname, vals } : null;
}
const [file, out, ...roots] = process.argv.slice(2);
const g = parse(fs.readFileSync(file));
const WANT = new Set(['CFrame', 'size', 'Size', 'Color3uint8', 'Transparency', 'CanQuery', 'shape', 'Shape', 'Material']);
const BASE = new Set(['Part', 'MeshPart', 'WedgePart', 'TrussPart', 'UnionOperation', 'CornerWedgePart', 'Seat', 'SpawnLocation']);
const P = {};
for (const c of g.chunks) {
  if (c.name !== 'PROP') continue;
  const id = c.data.readUInt32LE(0); if (!BASE.has(g.classes[id].cls)) continue;
  const n = c.data.readUInt32LE(4); const pname = c.data.toString('utf8', 8, 8 + n);
  if (!WANT.has(pname)) continue;
  const res = readProp(g, c); if (!res) continue;
  res.k.refs.forEach((ref, i) => { (P[ref] = P[ref] || {})[pname.toLowerCase()] = res.vals[i]; });
}
function findPath(path) { const parts = path.split('/'); let cur = g.roots.filter(r => name(r) === parts[0]); for (const p of parts.slice(1)) cur = cur.flatMap(o => o.children.filter(c => name(c) === p)); return cur[0]; }
const res = [];
for (const rp of roots) {
  const top = findPath(rp);
  (function walk(o, tag) {
    const q = P[o.ref];
    if (q && q.cframe && q.size) res.push({ t: tag, c: o.cls, n: name(o), m: q.cframe.m, p: q.cframe.p, s: q.size, col: q.color3uint8 || [160, 160, 160], tr: q.transparency || 0, q: q.canquery !== false, sh: q.shape, mat: q.material });
    for (const ch of o.children) walk(ch, tag === rp ? name(ch) : tag);
  })(top, rp);
}
fs.writeFileSync(out, JSON.stringify(res));
console.log('parts', res.length);
