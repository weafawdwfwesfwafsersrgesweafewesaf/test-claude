// Niveau 4 : presses hydrauliques (visuel = boîte qui tue), rythme resserré, mort au contact.
const fs = require('fs');
const { Edit, name, makeAdder } = require('./editlib.js');
module.exports = function (E, patchFile, hazardSrc) {
  const patch = JSON.parse(fs.readFileSync(patchFile));
  const add = makeAdder(E);
  const lv = E.find('Workspace/BikeASMR/Map/Levels/Level4');
  const decor = lv.children.find(c => name(c) === 'Decor');
  const hz = lv.children.find(c => name(c) === 'Hazards');
  const drop = [];
  // ancien habillage : modèles Blender des écraseurs, chrono et son portique
  const z0 = 300 + 3 * 1300;
  for (const c of decor.children) {
    if (name(c) === 'Ecraseurs' || name(c) === 'Chrono') { drop.push(c); continue; }
    if (c.cls === 'Part' && name(c) === 'Bloc') {
      const p = E.part(c);
      if (Math.abs(p.pos[2] - (z0 + 190)) < 4 && (Math.abs(p.size[1] - 44) < 1 || Math.abs(p.size[0] - 162) < 1)) drop.push(c);
    }
  }
  // mâchoires : nouveau décor + nouveau rythme
  let n = 0;
  for (const c of hz.children) {
    if (name(c) !== 'Ecraseur') continue;
    const a = E.attrs(c), p = E.part(c);
    const m = patch.machoires.find(q => Math.abs(q.z - a.FixedZ) < 1 && Math.sign(q.x) === Math.sign(a.OpenX));
    if (!m) throw new Error('mâchoire sans patch ' + a.FixedZ);
    const d = c.children.find(k => name(k) === 'Decor');
    for (const k of d.children) drop.push(k);
    for (const node of m.decor) add(node, d.ref);
    E.setAttrs(c, m.attrs);
    n++;
  }
  for (const s of patch.statique) add(s, decor.ref);
  const removed = E.remove(drop);
  if (hazardSrc) {
    const hc = E.find('StarterPlayer/StarterPlayerScripts/BikeASMR/Controllers/HazardController');
    E.setSource(hc, fs.readFileSync(hazardSrc, 'utf8'));
  }
  return `niveau 4 : ${n} mâchoires rhabillées, ${patch.statique.length} presses, ${removed} anciennes pièces retirées`;
};
if (require.main === module) {
  const E = new Edit(process.argv[2]);
  console.log(module.exports(E, process.argv[4], process.argv[5]));
  E.save(process.argv[3]);
}
