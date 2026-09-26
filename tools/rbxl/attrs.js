// Décode AttributesSerialize (types courants) et montre les attributs changés entre orig et rebal.
const fs = require('fs'); const { parse, name } = require('./rbxl.js');
function dec(b) {
  const out = {}; if (!b || b.length < 4) return out; let p = 0; const n = b.readUInt32LE(p); p += 4;
  for (let i = 0; i < n; i++) {
    const kl = b.readUInt32LE(p); p += 4; const k = b.toString('utf8', p, p + kl); p += kl; const t = b[p++];
    if (t === 0x02) { const l = b.readUInt32LE(p); p += 4; out[k] = b.toString('utf8', p, p + l); p += l; }
    else if (t === 0x03) { out[k] = !!b[p++]; }
    else if (t === 0x06) { out[k] = b.readDoubleLE(p); p += 8; }
    else if (t === 0x05) { out[k] = b.readFloatLE(p); p += 4; }
    else { out[k] = '?type' + t; break; }
  }
  return out;
}
module.exports = { dec };
if (require.main === module) {
  const diff = fs.readFileSync('rebal_diff.txt', 'utf8');
  const O = parse(fs.readFileSync('orig.rbxl')), B = parse(fs.readFileSync('rebal.rbxl'));
  const idx = g => { const m = new Map(); const add = (l, path) => { const seen = {}; for (const c of l) { const nn = name(c) + '#' + c.cls; seen[nn] = (seen[nn] || 0) + 1; const pp = (path ? path + '/' : '') + nn + (seen[nn] > 1 ? '[' + seen[nn] + ']' : ''); m.set(pp, c); add(c.children, pp); } }; add(g.roots, ''); return m; };
  const IO = idx(O), IB = idx(B);
  for (const line of diff.split('\n')) {
    const m = /^MODIF (\S+) AttributesSerialize/.exec(line); if (!m) continue;
    const a = dec(IO.get(m[1]).props.AttributesSerialize.v), b = dec(IB.get(m[1]).props.AttributesSerialize.v);
    const ch = Object.keys(b).filter(k => a[k] !== b[k]).map(k => `${k}: ${a[k]} -> ${b[k]}`);
    console.log(m[1].replace(/#\w+/g, ''), ch.join(', '));
  }
}
