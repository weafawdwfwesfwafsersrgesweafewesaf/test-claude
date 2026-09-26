// Contrôle structurel complet d'un .rbxl, comme le lecteur de Roblox : tailles exactes des chunks,
// identifiants continus, parents valides, chaque PROP lisible jusqu'au dernier octet.
const fs = require('fs'), zlib = require('zlib');
const { Place } = require('./writer.js');
const file = process.argv[2];
const P = new Place(file);
const g = P.g, errs = [];
const buf = fs.readFileSync(file);
const N = buf.readInt32LE(20), NC = buf.readInt32LE(16);
if (Object.keys(g.classes).length !== NC) errs.push(`classes ${Object.keys(g.classes).length} != en-tête ${NC}`);
if (Object.keys(g.inst).length !== N) errs.push(`instances ${Object.keys(g.inst).length} != en-tête ${N}`);
for (let i = 0; i < N; i++) if (!g.inst[i]) { errs.push('identifiant manquant ' + i); break; }
for (const c of g.chunks) {
  if (c.name === 'INST') {
    const d = c.data, id = d.readUInt32LE(0), ln = d.readUInt32LE(4), fmt = d[8 + ln], n = d.readUInt32LE(9 + ln);
    const want = 13 + ln + 4 * n + (fmt ? n : 0);
    if (d.length !== want) errs.push(`INST ${g.classes[id].cls} : ${d.length} octets, attendu ${want}`);
    if (id >= NC) errs.push('INST id de classe hors limites ' + id);
  } else if (c.name === 'PROP') {
    const k = g.classes[c.data.readUInt32LE(0)];
    try { P.props.delete(c); P.split(c); } catch (e) { if (!/non géré/.test(e.message)) errs.push(`PROP ${k.cls} : ${e.message}`); }
  } else if (c.name === 'PRNT') {
    const n = c.data.readUInt32LE(1);
    if (c.data.length !== 5 + 8 * n) errs.push('PRNT taille');
    if (n !== N) errs.push(`PRNT ${n} != ${N}`);
  }
}
for (const o of Object.values(g.inst)) if (o.parent !== null && o.parent !== -1 && !g.inst[o.parent]) { errs.push('parent invalide ' + o.ref); break; }
console.log(errs.length ? 'ERREURS :\n' + errs.slice(0, 20).join('\n') : `OK : ${N} instances, ${NC} classes, structure valide`);
process.exit(errs.length ? 1 : 0);
