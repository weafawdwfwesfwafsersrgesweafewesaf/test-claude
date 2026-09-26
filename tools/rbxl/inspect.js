const fs = require('fs'); const { parse, name } = require('./rbxl.js');
const [inp, ...paths] = process.argv.slice(2);
const g = parse(fs.readFileSync(inp));
function find(path) {
  const parts = path.split('/');
  let cur = g.roots.filter(r => name(r) === parts[0] || r.cls === parts[0]);
  for (const p of parts.slice(1)) cur = cur.flatMap(o => o.children.filter(c => name(c) === p));
  return cur;
}
for (const p of paths) for (const o of find(p)) {
  console.log('==', p, o.cls, 'ref', o.ref, 'parent', o.parent);
  for (const [k, v] of Object.entries(o.props)) {
    let s = v.v === undefined ? `(type ${v.type})` : Buffer.isBuffer(v.v) ? JSON.stringify(v.v.toString('latin1').slice(0, 120)) : String(v.v);
    console.log('   ', k, s);
  }
  for (const c of o.children) console.log('    child', c.cls, name(c), c.ref);
}
