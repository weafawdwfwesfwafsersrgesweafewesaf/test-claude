const fs = require('fs'); const { Place } = require('./writer.js'); const { R } = require('./rbxl.js');
const p = new Place(process.argv[2]);
let ok = 0, bad = 0, skipped = 0;
const w = require('./writer.js');
for (const c of p.g.chunks) {
  if (c.name === 'PROP') {
    let s; try { s = p.split(c); } catch (e) { skipped++; continue; }
    // ré-encodage via save sur ce seul chunk
    p.dirty.add(c);
  }
}
p.save('/tmp/claude-0/rbx/enc.rbxl');
// Relecture et comparaison des données décompressées
const { parse } = require('./rbxl.js');
const a = parse(fs.readFileSync(process.argv[2])), b = parse(fs.readFileSync('/tmp/claude-0/rbx/enc.rbxl'));
for (let i = 0; i < a.chunks.length; i++) { if (a.chunks[i].data.equals(b.chunks[i].data)) ok++; else { bad++; console.log('DIFF', a.chunks[i].name, i); } }
console.log({ ok, bad, skipped });
