const fs = require('fs'); const { parse, name } = require('./rbxl.js');
const [a, b] = process.argv.slice(2).map(f => parse(fs.readFileSync(f)));
function index(g) {
  const m = new Map();
  function walk(o, path) {
    const seen = {};
    for (const c of o.children) {
      const n = name(c) + '#' + c.cls; seen[n] = (seen[n] || 0) + 1;
      const p = path + '/' + n + (seen[n] > 1 ? '[' + seen[n] + ']' : '');
      m.set(p, c); walk(c, p);
    }
  }
  const seen = {};
  for (const r of g.roots) { const n = name(r) + '#' + r.cls; seen[n] = (seen[n] || 0) + 1; const p = n + (seen[n] > 1 ? '[' + seen[n] + ']' : ''); m.set(p, r); walk(r, p); }
  return m;
}
const A = index(a), B = index(b);
let n = 0;
for (const [p, o] of A) {
  const q = B.get(p);
  if (!q) { console.log('SUPPRIMÉ', p); continue; }
  for (const k of Object.keys(o.props)) {
    if (k === 'Source') continue;
    const x = o.props[k].v, y = q.props[k] && q.props[k].v;
    if (x === undefined) continue;
    const eq = Buffer.isBuffer(x) ? Buffer.isBuffer(y) && x.equals(y) : x === y;
    if (!eq) { n++; console.log('MODIF', p, k, JSON.stringify(Buffer.isBuffer(x) ? x.toString('latin1') : x), '->', JSON.stringify(Buffer.isBuffer(y) ? y.toString('latin1') : y)); }
  }
}
for (const p of B.keys()) if (!A.has(p)) console.log('AJOUTÉ', p);
console.log('total modifs', n);
