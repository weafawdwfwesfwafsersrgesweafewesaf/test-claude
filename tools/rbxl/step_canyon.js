// Garde seulement le gradin le plus proche de la piste (|x| <= 250), recoupe les murs de fond.
const { Edit } = require('./editlib.js');
module.exports = function (E) {
  const c = E.find('Workspace/BikeASMR/Map/Canyon');
  const LIM = 250;
  const drop = [];
  let clipped = 0;
  for (const o of c.children) {
    const p = E.part(o);
    const lo = p.pos[0] - p.size[0] / 2, hi = p.pos[0] + p.size[0] / 2;
    const endWall = p.pos[2] < -330 || p.pos[2] > 15930;
    if (!endWall) {
      if (Math.abs(p.pos[0]) >= 240) drop.push(o);          // gradins 2 et 3 (et leurs gouttes)
      continue;
    }
    if (hi <= -LIM || lo >= LIM) { drop.push(o); continue; }   // morceau de mur de fond au-delà du gradin 1
    if (lo < -LIM || hi > LIM) {                                 // à cheval : on le recoupe
      const nlo = Math.max(lo, -LIM), nhi = Math.min(hi, LIM);
      E.setSize(o, [nhi - nlo, p.size[1], p.size[2]]);
      E.setPos(o, [(nlo + nhi) / 2, p.pos[1], p.pos[2]]);
      clipped++;
    }
  }
  const n = E.remove(drop);
  return `canyon : ${n} parts retirées (gradins 2 et 3), ${clipped} recoupées, ${c.children.length - drop.length} gardées`;
};
if (require.main === module) {
  const E = new Edit(process.argv[2]);
  console.log(module.exports(E));
  E.save(process.argv[3]);
}
