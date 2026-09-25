const fs = require('fs'), crypto = require('crypto');
const { Place } = require('./writer.js'); const { parse, name } = require('./rbxl.js');
const [RECENT, ORIG, REBAL, OUT] = process.argv.slice(2);
const P = new Place(RECENT);
const O = parse(fs.readFileSync(ORIG)), B = parse(fs.readFileSync(REBAL));
const log = [];

function index(g) {
  const m = new Map();
  const add = (list, path) => { const seen = {}; for (const c of list) { const n = name(c) + '#' + c.cls; seen[n] = (seen[n] || 0) + 1; const p = (path ? path + '/' : '') + n + (seen[n] > 1 ? '[' + seen[n] + ']' : ''); m.set(p, c); add(c.children, p); } };
  add(g.roots, ''); return m;
}
const IR = index(P.g), IO = index(O), IB = index(B);

// 1) Équilibrage : scripts de config
for (const f of ['LobbyConfig', 'MapConfig', 'ProgressionConfig', 'ShopConfig', 'UIConfig']) {
  const path = `ReplicatedStorage#ReplicatedStorage/BikeASMR#Folder/Config#Folder/${f}#ModuleScript`;
  P.setString(IR.get(path), 'Source', IB.get(path).props.Source.v, IO.get(path).props.Source.v);
  log.push('config ' + f);
}
// 2) Équilibrage : panneaux et attributs (valeur actuelle vérifiée = valeur d'origine)
let n = 0;
for (const [path, o] of IO) {
  const b = IB.get(path), r = IR.get(path);
  if (!b) continue;
  for (const k of Object.keys(o.props)) {
    if (k === 'Source') continue;
    const x = o.props[k].v, y = b.props[k] && b.props[k].v;
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.equals(y)) continue;
    if (!r) throw new Error('absent de la version récente : ' + path);
    P.setString(r, k, y, x); n++;
  }
}
log.push(`panneaux/attributs : ${n}`);
// 3) Auras : les maillages importés vont là où AuraKit les cherche
const models = P.find('ReplicatedStorage/BikeASMR/AuraModels');
for (const nm of ['AuraRing', 'AuraHelix']) { P.setParent(P.find('ServerStorage/' + nm), models); log.push('aura ' + nm + ' -> AuraModels'); }
// 4) Décorations : deux nouveaux ModuleScripts
const tpl = P.find('ServerScriptService/BikeASMR/Services/MapService');
const guid = () => '{' + crypto.randomUUID().toUpperCase() + '}';
P.addLike(tpl, P.find('ServerStorage/BikeASMR'), { Name: 'DecorShapes', Source: fs.readFileSync('new/DecorShapes.lua', 'utf8'), ScriptGuid: guid(), AttributesSerialize: '', LinkedSource: '' });
P.addLike(tpl, P.find('ServerScriptService/BikeASMR/Services'), { Name: 'DecorService', Source: fs.readFileSync('new/DecorService.lua', 'utf8'), ScriptGuid: guid(), AttributesSerialize: '', LinkedSource: '' });
log.push('ajout DecorShapes + DecorService');
P.save(OUT);
console.log(log.join('\n'));
