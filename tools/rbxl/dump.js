const fs = require('fs'); const { parse, name } = require('./rbxl.js');
const [inp, outDir] = process.argv.slice(2);
const g = parse(fs.readFileSync(inp));
fs.mkdirSync(outDir + '/src', { recursive: true });
const lines = [];
const SCRIPT = new Set(['Script', 'LocalScript', 'ModuleScript']);
function walk(o, path, depth) {
  const p = path + '/' + name(o);
  const src = o.props.Source && o.props.Source.v;
  let extra = '';
  if (SCRIPT.has(o.cls) && src) {
    const f = p.replace(/[^A-Za-z0-9_\/.-]/g, '_').replace(/^\//, '') + '.lua';
    fs.mkdirSync(outDir + '/src/' + f.split('/').slice(0, -1).join('/'), { recursive: true });
    fs.writeFileSync(outDir + '/src/' + f, src);
    extra = ` [${src.length}c]`;
  }
  lines.push('  '.repeat(depth) + o.cls + ' ' + name(o) + extra + (o.children.length > 40 ? ` (${o.children.length} enfants)` : ''));
  const kids = o.children;
  if (kids.length > 40 && !SCRIPT.has(o.cls)) {
    const counts = {}; kids.forEach(k => counts[k.cls] = (counts[k.cls] || 0) + 1);
    lines.push('  '.repeat(depth + 1) + JSON.stringify(counts));
    kids.filter(k => k.children.length || SCRIPT.has(k.cls)).forEach(k => walk(k, p, depth + 1));
  } else kids.forEach(k => walk(k, p, depth + 1));
}
g.roots.forEach(r => walk(r, '', 0));
fs.writeFileSync(outDir + '/tree.txt', lines.join('\n'));
console.log('instances', Object.keys(g.inst).length, 'roots', g.roots.length, 'lines', lines.length);
