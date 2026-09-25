// Construit le jeu final à partir de la version récente :
//  1) équilibrage (configs, panneaux, attributs), valeurs vérifiées avant modification ;
//  2) nouvelle aura (sources d'AurasController et d'AuraKit) ;
//  3) décors posés EN VRAI dans Workspace.DecorMondes (Folders / Models / Parts), sans script.
const fs = require('fs');
const { Place, enc } = require('./writer.js'); const { parse, name } = require('./rbxl.js');
const [RECENT, ORIG, REBAL, TREE, OUT, CANYON] = process.argv.slice(2);
const P = new Place(RECENT);
const O = parse(fs.readFileSync(ORIG)), B = parse(fs.readFileSync(REBAL));
const log = m => console.log(m);

function index(g) {
  const m = new Map();
  const add = (list, path) => { const seen = {}; for (const c of list) { const n = name(c) + '#' + c.cls; seen[n] = (seen[n] || 0) + 1; const p = (path ? path + '/' : '') + n + (seen[n] > 1 ? '[' + seen[n] + ']' : ''); m.set(p, c); add(c.children, p); } };
  add(g.roots, ''); return m;
}
const IR = index(P.g), IO = index(O), IB = index(B);

// 1) Équilibrage
for (const f of ['LobbyConfig', 'MapConfig', 'ProgressionConfig', 'ShopConfig', 'UIConfig']) {
  const path = `ReplicatedStorage#ReplicatedStorage/BikeASMR#Folder/Config#Folder/${f}#ModuleScript`;
  P.setString(IR.get(path), 'Source', IB.get(path).props.Source.v, IO.get(path).props.Source.v);
}
let n = 0;
for (const [path, o] of IO) {
  const b = IB.get(path), r = IR.get(path);
  if (!b) continue;
  for (const k of Object.keys(o.props)) {
    if (k === 'Source') continue;
    const x = o.props[k].v, y = b.props[k] && b.props[k].v;
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.equals(y)) continue;
    P.setString(r, k, y, x); n++;
  }
}
log(`équilibrage : 5 configs + ${n} panneaux/attributs`);

// 2) Aura chakra
const recentSrc = p => P.find(p).props.Source.v;
P.setString(P.find('StarterPlayer/StarterPlayerScripts/BikeASMR/Controllers/AurasController'), 'Source', fs.readFileSync('new/AurasController.lua'), recentSrc('StarterPlayer/StarterPlayerScripts/BikeASMR/Controllers/AurasController'));
P.setString(P.find('ReplicatedStorage/BikeASMR/Modules/AuraKit'), 'Source', fs.readFileSync('new/AuraKit.lua'), recentSrc('ReplicatedStorage/BikeASMR/Modules/AuraKit'));
log('aura : AurasController + AuraKit remplacés');

// 3) Décors
const all = Object.values(P.g.inst);
function emptyTags(cls) {             // index SSTR le plus courant pour Tags (= pas de tag)
  const cnt = {}; for (const o of all) if (o.cls === cls && o.props.Tags) { const k = o.props.Tags.v ? o.props.Tags.v.toString('hex') : ''; cnt[k] = (cnt[k] || 0) + 1; }
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
}
function template(cls, pred) {
  const o = all.find(o => o.cls === cls && pred(o));
  if (!o) throw new Error('pas de modèle pour ' + cls);
  return o;
}
const noAttr = o => !o.props.AttributesSerialize || o.props.AttributesSerialize.v.length === 0;
const tplFolder = template('Folder', o => noAttr(o));
const tplModel = template('Model', o => noAttr(o) && o.props.ScaleFactor !== undefined && o.children.length > 0 && o.children.every(c => c.cls === 'Part'));
const tplPart = template('Part', o => noAttr(o) && o.props.Material && o.props.Material.v === 272 && o.props.shape && o.props.shape.v === 1 && o.props.CanCollide && o.props.CanCollide.v === false);
const tplMesh = template('SpecialMesh', () => true);
const tplLight = template('PointLight', noAttr);
log(`modèles : Folder ${name(tplFolder)}, Model ${name(tplModel)}, Part ${name(tplPart)}, SpecialMesh ${name(tplMesh)}`);
const IDENT = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const counts = {};
function add(node, parentRef) {
  counts[node.c] = (counts[node.c] || 0) + 1;
  let ref;
  if (node.c === 'Folder') {
    ref = P.addNew(tplFolder, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str('') });
  } else if (node.c === 'Model') {
    ref = P.addNew(tplModel, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str(''), WorldPivotData: enc.optcf(node.pivot), PrimaryPart: -1,
      ScaleFactor: enc.float(1), NeedsPivotMigration: enc.bool(false) });
  } else if (node.c === 'PointLight') {
    ref = P.addNew(tplLight, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str(''), Brightness: enc.float(node.brightness),
      Range: enc.float(node.range), Color: enc.vec3(node.rgb.map(c => c / 255)), Shadows: enc.bool(false), Enabled: enc.bool(true) });
  } else {
    const v = {
      Name: enc.str(node.n), CFrame: enc.cframe(node.cf), size: enc.vec3(node.size), Color3uint8: enc.rgb8(node.rgb), Material: enc.enumv(node.mat),
      shape: enc.enumv(node.shape), Anchored: enc.bool(true), CanCollide: enc.bool(false), CanQuery: enc.bool(false), CanTouch: enc.bool(false),
      CastShadow: enc.bool(false), Transparency: enc.float(0), Reflectance: enc.float(0), Locked: enc.bool(false), Massless: enc.bool(false),
      TopSurface: enc.enumv(0), BottomSurface: enc.enumv(0), LeftSurface: enc.enumv(0), RightSurface: enc.enumv(0), FrontSurface: enc.enumv(0), BackSurface: enc.enumv(0),
      MaterialVariantSerialized: enc.str(''), PivotOffset: enc.cframe(IDENT), Velocity: enc.vec3([0, 0, 0]), RotVelocity: enc.vec3([0, 0, 0]),
      AttributesSerialize: node.attrs ? enc.attrs(node.attrs) : enc.str(''), CustomPhysicalProperties: Buffer.from([2]),
    };
    if (node.studs) { v.Material = enc.enumv(256); v.MaterialVariantSerialized = enc.str('Studs_2'); }
    if (node.transp) v.Transparency = enc.float(node.transp);
    ref = P.addNew(tplPart, parentRef, v);
    if (node.sphere) {
      counts.SpecialMesh = (counts.SpecialMesh || 0) + 1;
      P.addNew(tplMesh, ref, { Name: enc.str('Mesh'), AttributesSerialize: enc.str(''), MeshId: enc.str(''), TextureId: enc.str(''), MeshType: enc.enumv(3),
        Scale: enc.vec3([1, 1, 1]), Offset: enc.vec3([0, 0, 0]), VertexColor: enc.vec3([1, 1, 1]) });
    }
  }
  for (const k of node.k || []) add(k, ref);
}
const tree = JSON.parse(fs.readFileSync(TREE));
if (P.g.roots.some(r => r.cls === 'Workspace' && r.children.some(c => name(c) === 'DecorMondes'))) throw new Error('DecorMondes existe déjà');
add(tree, P.find('Workspace').ref);
log('décors : ' + JSON.stringify(counts));

// ---------------------------------------------------------------- bordure : nouveau canyon (relief irrégulier), cuit à la place de l'ancien
if (CANYON) {
  const canyon = P.find('Workspace/BikeASMR/Map/Canyon');
  const old = canyon.children.filter(c => c.cls === 'Part');
  if (old.length !== canyon.children.length) throw new Error('Canyon : contenu inattendu');
  const tplWall = old.find(o => o.props.CanCollide.v === true);
  const tplDeco = old.find(o => o.props.CanCollide.v === false);
  const parts = JSON.parse(fs.readFileSync(CANYON));
  for (const q of parts) {
    const tpl = q.collide ? tplWall : tplDeco;
    P.addNew(tpl, canyon.ref, { Name: enc.str('Bloc'), CFrame: enc.cframe([q.p[0], q.p[1], q.p[2], 1, 0, 0, 0, 1, 0, 0, 0, 1]), size: enc.vec3(q.s),
      Color3uint8: enc.rgb8(q.c), CanCollide: enc.bool(q.collide), CanQuery: enc.bool(q.collide) });
  }
  P.remove(old.map(o => o.ref));
  log(`canyon : ${old.length} anciennes parts remplacées par ${parts.length} (${parts.filter(q => q.collide).length} solides)`);
}
P.save(OUT);
log('écrit : ' + OUT);
