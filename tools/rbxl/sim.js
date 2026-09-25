// Simule la pose des décors du fond (même règles que DecorService) sur la vraie géométrie.
const fs = require('fs');
const parts = JSON.parse(fs.readFileSync('levels.json'));
const shapes = fs.readFileSync('new/DecorShapes.lua', 'utf8');
// gabarits : rayon et hauteur, comme dans buildTemplates
const T = {};
for (const w of ['Lava', 'Ice', 'Candy', 'Robot', 'Dragon', 'Skeleton', 'Retro', 'Ghost']) {
  const blk = shapes.slice(shapes.indexOf(`\t${w} = {`)); const end = blk.indexOf('\n\t},');
  T[w] = [...blk.slice(0, end).matchAll(/Name = "(\w+)", Height = ([\d.]+), Parts = \{ ([^}]*) \}/g)].map(m => {
    const q = m[3].split(', ').map(Number); let r = 0;
    for (let i = 0; i < q.length; i += 14) r = Math.max(r, Math.hypot(q[i + 2], q[i + 4]) + Math.hypot(q[i + 11], q[i + 12], q[i + 13]) / 2);
    return { name: m[1], h: +m[2], r };
  });
}
const LW = { 1: ['Retro', 'Robot'], 2: ['Candy'], 3: ['Candy', 'Lava'], 4: ['Robot'], 5: ['Candy', 'Retro'], 6: ['Ice', 'Candy'], 7: ['Lava', 'Dragon'], 8: ['Dragon'], 9: ['Ice'], 10: ['Skeleton', 'Ghost'], 11: ['Robot', 'Ghost'], 12: ['Retro', 'Robot'] };
const H1 = { 7: 215, 11: 280 };
let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const num = (a, b) => a + (b - a) * rnd(); const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const boxes = {};
for (const p of parts) {
  if (!p.q) continue;
  const lvl = +(/Level(\d+)/.exec(p.t) || [0, 0])[1] || null;
  const m = p.m, h = p.s.map(v => v / 2);
  const ex = [0, 1, 2].map(r => Math.abs(m[r * 3]) * h[0] + Math.abs(m[r * 3 + 1]) * h[1] + Math.abs(m[r * 3 + 2]) * h[2]);
  (boxes[p.t] = boxes[p.t] || []).push({ x0: p.p[0] - ex[0], x1: p.p[0] + ex[0], y0: p.p[1] - ex[1], y1: p.p[1] + ex[1], z0: p.p[2] - ex[2], z1: p.p[2] + ex[2] });
}
const AR = [[0, 0]]; for (let k = 0; k < 8; k++) AR.push([Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
const placed = [];
for (let i = 1; i <= 12; i++) {
  const bx = boxes['Workspace/BikeASMR/Map/Levels'] ? [] : [];
  const lvlBoxes = Object.entries(boxes).filter(([t]) => t === 'Level' + i).flatMap(([, b]) => b);
  const rideY = (i - 1) * 50, floor = rideY - 30, z0 = 300 + (i - 1) * 1300, z1 = z0 + 1300;
  const free = (x, z, r) => AR.every(([a, b]) => { const px = x + a * r, pz = z + b * r; return !lvlBoxes.some(o => px >= o.x0 && px <= o.x1 && pz >= o.z0 && pz <= o.z1 && o.y1 >= floor && o.y0 <= rideY + 400); });
  let pit = 0, rim = 0, tried = 0;
  for (const side of [-1, 1]) {
    let z = z0 + 120 + num(0, 30);
    while (z < z1 - 20) {
      const ws = LW[i], list = T[ws[int(0, ws.length - 1)]], t = list[int(0, list.length - 1)];
      let s = num(4.2, 6.5); s = Math.min(s, 40 / Math.max(t.h, 0.5), 19 / Math.max(t.r, 0.5));
      const r = t.r * s, x = side * num(130 + r, 168 - r); tried++;
      if (free(x, z, r)) { pit++; placed.push({ lvl: i, kind: 'pit', name: t.name, x, y: floor, z, s, yaw: num(0, 6.28) }); }
      z += num(55, 85);
    }
    z = z0 + num(20, 90);
    while (z < z1) {
      const ws = LW[i], list = T[ws[int(0, ws.length - 1)]], t = list[int(0, list.length - 1)];
      const s = Math.min(num(5, 6.5), 33 / Math.max(t.r, 0.5));
      const x = side * (212 + num(-1, 1) * Math.max(0, 33 - t.r * s));
      rim++; placed.push({ lvl: i, kind: 'rim', name: t.name, x, y: rideY + (H1[i] || 150), z, s, yaw: num(0, 6.28) });
      z += num(170, 240);
    }
  }
  console.log(`niveau ${i} : fond ${pit}/${tried} places libres, rebord ${rim}`);
}
fs.writeFileSync('placed.json', JSON.stringify(placed));
