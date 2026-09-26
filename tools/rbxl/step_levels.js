// Niveaux 10, 11, 12 : nouveaux parcours (patch généré par niveaux_10_12.py), doigts et écraseurs du 12, textes.
const fs = require('fs');
const { Edit, name, enc, makeAdder } = require('./editlib.js');
const Z0 = i => 300 + (i - 1) * 1300, Y0 = i => (i - 1) * 50;
module.exports = function (E, patchFile) {
  const patch = JSON.parse(fs.readFileSync(patchFile));
  const add = makeAdder(E);
  const log = [];
  const drop = [];
  for (const i of [10, 11, 12]) {
    const P = patch[String(i)], R = P.retirer;
    const lv = E.find('Workspace/BikeASMR/Map/Levels/Level' + i);
    const F = n => lv.children.find(c => name(c) === n);
    const course = F('Course'), hz = F('Hazards'), decor = F('Decor');
    const n0 = drop.length;
    for (const c of hz.children) if ((R.hazards || []).includes(name(c))) drop.push(c);
    for (const c of course.children) {
      if ((R.course_names || []).includes(name(c))) { drop.push(c); continue; }
      if (c.cls === 'Part' && R.course_z) { const p = E.part(c); if (R.course_z.some(([z, tol]) => Math.abs(p.pos[2] - Z0(i) - z) < tol)) drop.push(c); }
    }
    for (const c of decor.children) {
      if ((R.decor_names || []).includes(name(c))) { drop.push(c); continue; }
      if (R.decor_petits && c.cls === 'Part' && name(c) === 'Bloc') {
        const s = E.part(c).size; if (R.decor_petits.every((v, j) => Math.abs(s[j] - v) < 0.2)) drop.push(c);
      }
    }
    for (const n of P.course) add(n, course.ref);
    for (const n of P.hazards) add(n, hz.ref);
    for (const n of P.decor) add(n, decor.ref);
    // texte du twist sur le panneau de départ
    const lab = E.descendants(F('Depart')).find(d => d.cls === 'TextLabel' && name(d) === 'Ligne3');
    if (lab) E.P.setString(lab, 'Text', P.twist);
    log.push(`niveau ${i} : ${drop.length - n0} retirées, ${P.course.length} parcours + ${P.hazards.length} pièges ajoutés`);
    if (i === 12) {
      // doigts : un sur chaque île, plus rapides, en rythme de frappe
      const D = P.doigts;
      const fingers = hz.children.filter(c => name(c) === 'Doigt');
      const ref = fingers.find(f => Math.abs(E.part(f).pos[2] - Z0(12) - 320) < 1);
      const refA = E.attrs(ref), refP = E.part(ref);
      const refKeyTop = refA.LowY - Y0(12) - 30;
      const beams = decor.children.filter(c => name(c) === 'Bloc' && Math.abs(E.part(c).size[0] - 340) < 1);
      const refBeam = beams.find(b => Math.abs(E.part(b).pos[2] - refP.pos[2]) < 1);
      const islands = { 180: [-48, 4], 390: [48, 4], 600: [-48, 4] };
      for (const zs of D.ajouter_z) {
        const [x, keyTop] = islands[zs];
        const dx = x - refP.pos[0], dy = keyTop - refKeyTop, dz = Z0(12) + zs - refP.pos[2];
        const mv = inst => { const cf = E.P.getProp(inst, 'CFrame'); const p = E.part(inst).pos; return { rot: cf.rot, pos: [p[0] + dx, p[1] + dy, p[2] + dz].map(enc.float) }; };
        const kk = Math.round((zs - 180) / 70);
        const a = Object.assign({}, refA, { LowY: refA.LowY + dy, HighY: refA.HighY + dy, Period: D.Period, Down: D.Down, Hold: D.Hold, Crush: 8,
          Phase: Math.round(((kk * D.pas) % D.Period) * 100) / 100 });
        const nf = E.P.addNew(ref, hz.ref, { CFrame: mv(ref), AttributesSerialize: enc.attrs(a) });
        const dref = ref.children.find(c => name(c) === 'Decor');
        const nd = E.P.addNew(dref, nf, {});
        for (const d of dref.children) E.P.addNew(d, nd, { CFrame: mv(d) });
        if (refBeam) { const cf = E.P.getProp(refBeam, 'CFrame'); const p = E.part(refBeam).pos; E.P.addNew(refBeam, decor.ref, { CFrame: { rot: cf.rot, pos: [p[0], p[1] + dy, p[2] + dz].map(enc.float) } }); }
      }
      // rythme de tous les doigts (anciens et nouveaux, dans l'ordre de la piste)
      const all = hz.children.filter(c => name(c) === 'Doigt');
      const reglages = f => ({ Period: D.Period, Down: D.Down, Hold: D.Hold, Crush: 8 });
      for (const f of all) {
        const z = E.part(f).pos[2] - Z0(12);
        const k = Math.round((z - 180) / 70);
        E.setAttrs(f, Object.assign(E.attrs(f), reglages(f), { Phase: Math.round(((k * D.pas) % D.Period) * 100) / 100 }));
      }
      // écraseurs : deux fois plus rapides, en vague
      const C = P.ecraseurs;
      for (const w of hz.children.filter(c => name(c) === 'Ecraseur')) {
        const a = E.attrs(w); const k = Math.round((a.FixedZ - Z0(12) - 750) / 62);
        E.setAttrs(w, Object.assign(a, { Period: C.Period, Travel: C.Travel, Hold: C.Hold, KillMargin: 3, Phase: Math.round(((C.Period - k * C.pas) % C.Period) * 100) / 100 }));
      }
      log.push(`niveau 12 : ${D.ajouter_z.length} doigts ajoutés, ${all.length + D.ajouter_z.length} doigts et 8 écraseurs recalés`);
    }
  }
  // twist dans la config (HUD, porte verrouillée…)
  const mc = E.find('ReplicatedStorage/BikeASMR/Config/MapConfig');
  let src = E.P.getProp(mc, 'Source').toString('utf8');
  const olds = { 10: '"The bones crumble and the skulls roll!"', 11: '"Low gravity: huge jumps between the planets!"', 12: '"Giant fingers are typing. Don\'t get squashed!"' };
  for (const i of [10, 11, 12]) { if (!src.includes(olds[i])) throw new Error('twist ' + i + ' introuvable'); src = src.replace(olds[i], JSON.stringify(patch[String(i)].twist)); }
  E.P.setString(mc, 'Source', src);
  const removed = E.remove(drop);
  log.push(`${removed} instances retirées au total`);
  return log.join('\n');
};
if (require.main === module) {
  const E = new Edit(process.argv[2]);
  console.log(module.exports(E, process.argv[4]));
  E.save(process.argv[3]);
}
