// Scènes intégrées (Canvas 2D et shaders WebGL).
// Chaque scène : create(container, props, env) -> { setProps, frame(dt, t), resize, destroy, canvas }
// env = { mouse: {x, y} (0..1), audio: { bands: Float32Array(64), level }, quality: 0.25..1 }
(function (root) {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hexToRgb(hex) {
    const h = String(hex || '#000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  // ---------- Base Canvas 2D ----------
  function canvas2D(container, env, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ow-scene-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });
    const s = { canvas, ctx, W: 1, H: 1, scale: 1 };
    s.resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = (window.devicePixelRatio || 1) * (env.quality || 1) * (opts.resScale || 1);
      s.W = Math.max(1, rect.width);
      s.H = Math.max(1, rect.height);
      s.scale = dpr;
      canvas.width = Math.max(1, Math.round(s.W * dpr));
      canvas.height = Math.max(1, Math.round(s.H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    s.resize();
    return s;
  }

  function fillBg(s, c1, c2) {
    const { ctx, W, H } = s;
    if (c2) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
  }

  function glowSprite(color, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size, size, 0, size, size, size);
    grd.addColorStop(0, rgba(color, 1));
    grd.addColorStop(0.15, rgba(color, 0.8));
    grd.addColorStop(0.4, rgba(color, 0.25));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size * 2, size * 2);
    return c;
  }

  const SCENES = {};

  // ---------- Constellation ----------
  SCENES.constellation = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let pts = [];
    const sync = () => {
      while (pts.length < P.count) pts.push({ x: rand(0, s.W), y: rand(0, s.H), vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5) });
      pts.length = Math.round(P.count);
    };
    sync();
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); },
      resize() { s.resize(); },
      frame(dt) {
        const { ctx, W, H } = s;
        fillBg(s, P.background, P.background2);
        const level = P.audioReactive ? env.audio.level : 0;
        const mx = env.mouse.x * W, my = env.mouse.y * H;
        const k = dt * 60 * P.speed * (1 + level * 3);
        for (const p of pts) {
          if (P.mouse !== 'none') {
            const dx = mx - p.x, dy = my - p.y, d2 = dx * dx + dy * dy;
            if (d2 < 220 * 220 && d2 > 1) {
              const f = (P.mouse === 'attract' ? 0.02 : -0.06) * (1 - Math.sqrt(d2) / 220);
              p.vx += dx / Math.sqrt(d2) * f * 3;
              p.vy += dy / Math.sqrt(d2) * f * 3;
            }
          }
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 1.6) { p.vx *= 1.6 / sp; p.vy *= 1.6 / sp; }
          if (sp < 0.15) { p.vx += rand(-0.05, 0.05); p.vy += rand(-0.05, 0.05); }
          p.x += p.vx * k; p.y += p.vy * k;
          if (p.x < 0) { p.x = 0; p.vx *= -1; } else if (p.x > W) { p.x = W; p.vx *= -1; }
          if (p.y < 0) { p.y = 0; p.vy *= -1; } else if (p.y > H) { p.y = H; p.vy *= -1; }
        }
        const ld = P.linkDistance, ld2 = ld * ld;
        if (ld > 0) {
          ctx.lineWidth = 1;
          const [r, g, b] = hexToRgb(P.lineColor);
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            for (let j = i + 1; j < pts.length; j++) {
              const c = pts[j], dx = a.x - c.x, dy = a.y - c.y, d2 = dx * dx + dy * dy;
              if (d2 < ld2) {
                ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d2 / ld2) * (0.55 + level * 0.45)})`;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
              }
            }
          }
        }
        ctx.fillStyle = P.particleColor;
        const rad = P.size * (1 + level * 1.5);
        for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.fill(); }
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Hyperespace ----------
  SCENES.starfield = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let stars = [];
    const mk = () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1), pz: 0 });
    const sync = () => { while (stars.length < P.count) stars.push(mk()); stars.length = Math.round(P.count); };
    sync();
    let cx = 0.5, cy = 0.5;
    let first = true;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); },
      resize() { s.resize(); first = true; },
      frame(dt) {
        const { ctx, W, H } = s;
        const level = P.audioReactive ? env.audio.level : 0;
        ctx.globalAlpha = first ? 1 : 1 - P.trails / 100;
        first = false;
        fillBg(s, P.background);
        ctx.globalAlpha = 1;
        const tx = P.mouseSteer ? env.mouse.x : 0.5, ty = P.mouseSteer ? env.mouse.y : 0.5;
        cx += (tx - cx) * Math.min(1, dt * 2); cy += (ty - cy) * Math.min(1, dt * 2);
        const ox = W * (1 - cx), oy = H * (1 - cy);
        const f = Math.max(W, H) * 0.5;
        const v = dt * 0.35 * P.speed * (1 + level * 4);
        const [sr, sg, sb] = hexToRgb(P.color), [tr, tg, tb] = hexToRgb(P.tint);
        for (const st of stars) {
          st.pz = st.z;
          st.z -= v;
          if (st.z <= 0.02) { Object.assign(st, mk()); st.z = 1; st.pz = 1; continue; }
          const x = ox + (st.x / st.z) * f, y = oy + (st.y / st.z) * f;
          const px = ox + (st.x / st.pz) * f, py = oy + (st.y / st.pz) * f;
          if (x < -50 || x > W + 50 || y < -50 || y > H + 50) { Object.assign(st, mk()); st.z = 1; continue; }
          const b = 1 - st.z;
          const t = clamp(P.speed * (1 + level * 4) / 4, 0, 1);
          ctx.strokeStyle = `rgba(${sr + (tr - sr) * t | 0},${sg + (tg - sg) * t | 0},${sb + (tb - sb) * t | 0},${b})`;
          ctx.lineWidth = b * 2.6 + 0.3;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
        }
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Pluie numérique ----------
  SCENES.matrix = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    const SETS = {
      katakana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789',
      binary: '01',
      latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*+=<>',
      hex: '0123456789ABCDEF'
    };
    let drops = [];
    let acc = 0;
    const sync = () => {
      const cols = Math.ceil(s.W / P.fontSize);
      while (drops.length < cols) drops.push(rand(-s.H / P.fontSize, 0));
      drops.length = cols;
    };
    sync();
    fillBg(s, P.background);
    return {
      canvas: s.canvas,
      setProps(p) { const fs = P.fontSize; P = p; if (fs !== p.fontSize) drops = []; sync(); },
      resize() { s.resize(); fillBg(s, P.background); sync(); },
      frame(dt) {
        const { ctx, H } = s;
        acc += dt * 22 * P.speed;
        if (acc < 1) return;
        const steps = Math.min(4, Math.floor(acc));
        acc -= Math.floor(acc);
        const chars = SETS[P.charset] || SETS.katakana;
        const fsz = P.fontSize;
        ctx.font = `${fsz}px "MS Gothic", "Consolas", monospace`;
        ctx.textBaseline = 'top';
        for (let n = 0; n < steps; n++) {
          ctx.fillStyle = rgba(P.background, 1 - P.fade / 100);
          ctx.fillRect(0, 0, s.W, H);
          for (let i = 0; i < drops.length; i++) {
            const y = drops[i] * fsz;
            const ch = chars[(Math.random() * chars.length) | 0];
            ctx.fillStyle = P.color;
            ctx.fillText(ch, i * fsz, y - fsz);
            ctx.fillStyle = P.headColor;
            ctx.fillText(chars[(Math.random() * chars.length) | 0], i * fsz, y);
            if (y > H && Math.random() > 0.975) drops[i] = rand(-20, 0);
            drops[i] += 1;
          }
        }
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Visualiseur audio ----------
  function sampleBands(bands, n, i) {
    const pos = (i / Math.max(1, n - 1)) * (bands.length - 1);
    const a = Math.floor(pos), b = Math.min(bands.length - 1, a + 1), t = pos - a;
    return bands[a] * (1 - t) + bands[b] * t;
  }

  SCENES.visualizer = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let vals = new Float32Array(256);
    let time = 0;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; },
      resize() { s.resize(); },
      frame(dt) {
        time += dt;
        const { ctx, W, H } = s;
        fillBg(s, P.background);
        const n = Math.round(P.bars);
        const sm = P.smoothing / 100;
        for (let i = 0; i < n; i++) {
          let v = sampleBands(env.audio.bands, n, i) * P.sensitivity;
          if (!env.audio.live) v = 0.04 + 0.03 * Math.sin(time * 2 + i * 0.3);
          v = clamp(v, 0, 1);
          vals[i] = vals[i] * sm + v * (1 - sm);
        }
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, P.colorA);
        grad.addColorStop(1, P.colorB);
        ctx.fillStyle = grad;
        ctx.strokeStyle = grad;
        ctx.shadowBlur = P.glow ? 18 : 0;
        ctx.shadowColor = P.colorA;
        if (P.style === 'bars' || P.style === 'mirror') {
          const gap = 2, bw = W / n - gap;
          for (let i = 0; i < n; i++) {
            const h = Math.max(2, vals[i] * H * (P.style === 'mirror' ? 0.42 : 0.75));
            const x = i * (bw + gap) + gap / 2;
            if (P.style === 'mirror') ctx.fillRect(x, H / 2 - h, bw, h * 2);
            else ctx.fillRect(x, H - h, bw, h);
          }
        } else if (P.style === 'circle') {
          const cx = W / 2, cy = H / 2, r0 = Math.min(W, H) * 0.2;
          const avg = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
          ctx.lineWidth = Math.max(2, (TAU * r0) / n - 2);
          ctx.lineCap = 'round';
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU - Math.PI / 2;
            const len = 4 + vals[i] * Math.min(W, H) * 0.3;
            const r = r0 * (1 + avg * 0.3);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len));
            ctx.stroke();
          }
          ctx.beginPath(); ctx.lineWidth = 3; ctx.arc(cx, cy, r0 * (1 + avg * 0.3) - 8, 0, TAU); ctx.stroke();
        } else {
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * W;
            const y = H / 2 + (i % 2 ? -1 : 1) * vals[i] * H * 0.35;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Aurore boréale ----------
  SCENES.aurora = (container, props, env) => {
    const s = canvas2D(container, env, { resScale: 0.6 });
    let P = props;
    let t = 0;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: rand(0.3, 1.4), p: rand(0, TAU) }));
    return {
      canvas: s.canvas,
      setProps(p) { P = p; },
      resize() { s.resize(); },
      frame(dt) {
        t += dt * P.speed;
        const { ctx, W, H } = s;
        fillBg(s, P.background, '#000000');
        if (P.stars) {
          ctx.fillStyle = '#fff';
          for (const st of stars) {
            ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + st.p));
            ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
          }
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'lighter';
        const cols = [P.colorA, P.colorB, P.colorC];
        const L = Math.round(P.layers);
        for (let l = 0; l < L; l++) {
          const col = cols[l % 3];
          const base = H * (0.25 + l * 0.06);
          const thick = H * (0.18 + 0.05 * Math.sin(t * 0.3 + l));
          const amp = P.amplitude * (H / 900);
          const top = [], bot = [];
          for (let x = 0; x <= W + 20; x += 20) {
            const y = base + Math.sin(x * 0.004 + t * 0.6 + l * 1.7) * amp + Math.sin(x * 0.011 - t * 0.9 + l) * amp * 0.5;
            const th = thick * (0.6 + 0.4 * Math.sin(x * 0.006 + t * 0.4 + l * 2.1));
            top.push([x, y]); bot.push([x, y + th]);
          }
          const g = ctx.createLinearGradient(0, base - amp, 0, base + thick + amp);
          g.addColorStop(0, rgba(col, 0));
          g.addColorStop(0.45, rgba(col, 0.35));
          g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        // horizon
        const hg = ctx.createLinearGradient(0, H * 0.82, 0, H);
        hg.addColorStop(0, 'rgba(0,0,0,0)');
        hg.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = hg;
        ctx.fillRect(0, H * 0.82, W, H * 0.18);
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Pluie et orage ----------
  SCENES.rain = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let drops = [], splashes = [];
    let flash = 0, nextFlash = rand(3, 9), bolt = null;
    const mk = (anyY) => ({ x: rand(-100, s.W + 100), y: anyY ? rand(-s.H, s.H) : rand(-200, -10), l: rand(10, 26), v: rand(0.8, 1.3) });
    const sync = () => { while (drops.length < P.drops) drops.push(mk(true)); drops.length = Math.round(P.drops); };
    sync();
    let wind = P.wind;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); },
      resize() { s.resize(); },
      frame(dt) {
        const { ctx, W, H } = s;
        fillBg(s, P.background, P.background2);
        const target = P.wind + (P.mouseWind ? (env.mouse.x - 0.5) * 8 : 0);
        wind += (target - wind) * Math.min(1, dt * 1.5);
        const sp = 900 * P.speed * dt;
        ctx.strokeStyle = rgba(P.color, 0.55);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const d of drops) {
          d.y += sp * d.v;
          d.x += wind * sp * d.v * 0.12;
          if (d.y > H) {
            if (P.splash && Math.random() < 0.35) splashes.push({ x: d.x, y: H - rand(0, 30), r: 0, a: 0.6 });
            Object.assign(d, mk(false));
          }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - wind * d.l * 0.12, d.y - d.l);
        }
        ctx.stroke();
        ctx.strokeStyle = rgba(P.color, 0.5);
        splashes = splashes.filter((p) => {
          p.r += dt * 30; p.a -= dt * 1.6;
          if (p.a <= 0) return false;
          ctx.globalAlpha = p.a;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.3, 0, 0, TAU); ctx.stroke();
          return true;
        });
        ctx.globalAlpha = 1;
        if (P.lightning) {
          nextFlash -= dt;
          if (nextFlash <= 0) {
            flash = 1; nextFlash = rand(4, 14);
            bolt = []; let x = rand(W * 0.1, W * 0.9), y = 0;
            while (y < H * rand(0.5, 0.9)) { bolt.push([x, y]); x += rand(-40, 40); y += rand(20, 60); }
          }
          if (flash > 0) {
            ctx.fillStyle = `rgba(200,215,255,${flash * 0.35})`;
            ctx.fillRect(0, 0, W, H);
            if (bolt && flash > 0.5) {
              ctx.strokeStyle = `rgba(235,240,255,${flash})`; ctx.lineWidth = 2.5;
              ctx.shadowBlur = 25; ctx.shadowColor = '#cfe0ff';
              ctx.beginPath(); bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
              ctx.shadowBlur = 0;
            }
            flash -= dt * (flash > 0.6 ? 1.2 : 2.4);
          }
        }
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Neige ----------
  SCENES.snow = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let flakes = [];
    const mk = (anyY) => ({ x: rand(0, s.W), y: anyY ? rand(0, s.H) : -10, r: rand(0.4, 1), p: rand(0, TAU) });
    const sync = () => { while (flakes.length < P.flakes) flakes.push(mk(true)); flakes.length = Math.round(P.flakes); };
    sync();
    let wind = 0, t = 0;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); },
      resize() { s.resize(); },
      frame(dt) {
        t += dt;
        const { ctx, W, H } = s;
        fillBg(s, P.background, P.background2);
        const target = P.wind + (P.mouseWind ? (env.mouse.x - 0.5) * 3 : 0);
        wind += (target - wind) * Math.min(1, dt);
        ctx.fillStyle = P.color;
        for (const f of flakes) {
          f.y += (20 + 40 * f.r) * P.speed * dt;
          f.x += (wind * 30 * f.r + Math.sin(t + f.p) * 10) * dt;
          if (f.y > H + 5) Object.assign(f, mk(false));
          if (f.x > W + 5) f.x = -5; else if (f.x < -5) f.x = W + 5;
          ctx.globalAlpha = 0.35 + 0.65 * f.r;
          ctx.beginPath(); ctx.arc(f.x, f.y, P.size * f.r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Lucioles ----------
  SCENES.fireflies = (container, props, env) => {
    const s = canvas2D(container, env);
    let P = props;
    let sprite = glowSprite(P.color, 32), spriteColor = P.color;
    let flies = [];
    const mk = () => ({ x: rand(0, s.W), y: rand(0, s.H), a: rand(0, TAU), v: rand(10, 40), p: rand(0, TAU), f: rand(0.5, 2) });
    const sync = () => { while (flies.length < P.count) flies.push(mk()); flies.length = Math.round(P.count); };
    sync();
    let t = 0;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); if (p.color !== spriteColor) { sprite = glowSprite(p.color, 32); spriteColor = p.color; } },
      resize() { s.resize(); },
      frame(dt) {
        t += dt;
        const { ctx, W, H } = s;
        fillBg(s, P.background, P.background2);
        const mx = env.mouse.x * W, my = env.mouse.y * H;
        ctx.globalCompositeOperation = 'lighter';
        for (const f of flies) {
          f.a += rand(-1, 1) * dt * 2;
          if (P.followMouse) {
            const dx = mx - f.x, dy = my - f.y, d = Math.hypot(dx, dy);
            if (d < 300 && d > 30) {
              const ta = Math.atan2(dy, dx);
              let da = ta - f.a; da = Math.atan2(Math.sin(da), Math.cos(da));
              f.a += da * dt * 1.5;
            }
          }
          f.x += Math.cos(f.a) * f.v * P.speed * dt;
          f.y += Math.sin(f.a) * f.v * P.speed * dt;
          if (f.x < -20) f.x = W + 20; else if (f.x > W + 20) f.x = -20;
          if (f.y < -20) f.y = H + 20; else if (f.y > H + 20) f.y = -20;
          const b = 0.5 + 0.5 * Math.sin(t * f.f * 2 + f.p);
          const r = P.glow * (0.6 + b * 0.8);
          ctx.globalAlpha = 0.25 + b * 0.75;
          ctx.drawImage(sprite, f.x - r, f.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Bokeh ----------
  SCENES.bokeh = (container, props, env) => {
    const s = canvas2D(container, env, { resScale: 0.75 });
    let P = props;
    let circles = [];
    const mk = () => ({ x: rand(0, s.W), y: rand(0, s.H), r: rand(0.4, 1.2), vx: rand(-1, 1), vy: rand(-1, 1), h: Math.random(), p: rand(0, TAU) });
    const sync = () => { while (circles.length < P.count) circles.push(mk()); circles.length = Math.round(P.count); };
    sync();
    let t = 0;
    return {
      canvas: s.canvas,
      setProps(p) { P = p; sync(); },
      resize() { s.resize(); },
      frame(dt) {
        t += dt;
        const { ctx, W, H } = s;
        fillBg(s, P.background);
        const level = P.audioReactive ? env.audio.level : 0;
        ctx.globalCompositeOperation = 'lighter';
        for (const c of circles) {
          c.x += c.vx * 12 * P.speed * dt; c.y += c.vy * 12 * P.speed * dt;
          const R = P.size * c.r * (1 + level * 0.8);
          if (c.x < -R) c.x = W + R; else if (c.x > W + R) c.x = -R;
          if (c.y < -R) c.y = H + R; else if (c.y > H + R) c.y = -R;
          const hue = (P.hueStart + c.h * P.hueRange) % 360;
          const a = 0.18 + 0.12 * Math.sin(t * 0.8 + c.p);
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
          g.addColorStop(0, `hsla(${hue},90%,65%,${a})`);
          g.addColorStop(0.75, `hsla(${hue},90%,60%,${a * 0.8})`);
          g.addColorStop(1, `hsla(${hue},90%,55%,0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Dégradé fluide ----------
  SCENES.gradient = (container, props, env) => {
    const s = canvas2D(container, env, { resScale: 0.35 });
    let P = props;
    let t = rand(0, 100);
    return {
      canvas: s.canvas,
      setProps(p) { P = p; },
      resize() { s.resize(); },
      frame(dt) {
        t += dt * 0.15 * P.speed;
        const { ctx, W, H } = s;
        fillBg(s, P.background);
        const R = Math.max(W, H) * (P.blobSize / 100);
        const cols = [P.colorA, P.colorB, P.colorC, P.colorD];
        cols.forEach((col, i) => {
          const x = W * (0.5 + 0.38 * Math.sin(t * (0.7 + i * 0.13) + i * 1.9));
          const y = H * (0.5 + 0.38 * Math.cos(t * (0.55 + i * 0.17) + i * 2.7));
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, rgba(col, 0.85));
          g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        });
      },
      destroy() { s.canvas.remove(); }
    };
  };

  // ---------- Shaders WebGL ----------
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function shaderScene(frag, setUniforms, resScale) {
    return (container, props, env) => {
      const canvas = document.createElement('canvas');
      canvas.className = 'ow-scene-canvas';
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      container.appendChild(canvas);
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
      if (!gl) {
        // Pas de WebGL : repli sur le dégradé fluide.
        canvas.remove();
        return SCENES.gradient(container, { colorA: props.colorA, colorB: props.colorB, colorC: props.colorC, colorD: props.colorA, background: '#000', speed: props.speed, blobSize: 60 }, env);
      }
      const sh = (type, src) => {
        const o = gl.createShader(type);
        gl.shaderSource(o, src);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o));
        return o;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;\n' + frag));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = {};
      const u = (name) => (name in U ? U[name] : (U[name] = gl.getUniformLocation(prog, name)));
      const api = {
        f: (n, v) => gl.uniform1f(u(n), v),
        v2: (n, a, b) => gl.uniform2f(u(n), a, b),
        col: (n, hex) => { const [r, g, b] = hexToRgb(hex); gl.uniform3f(u(n), r / 255, g / 255, b / 255); }
      };
      let P = props, t = 0;
      const resize = () => {
        const rect = container.getBoundingClientRect();
        const dpr = (window.devicePixelRatio || 1) * (env.quality || 1) * (resScale || 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      resize();
      let mx = 0.5, my = 0.5;
      return {
        canvas,
        setProps(p) { P = p; },
        resize,
        frame(dt) {
          t += dt * P.speed;
          mx += (env.mouse.x - mx) * Math.min(1, dt * 3);
          my += (env.mouse.y - my) * Math.min(1, dt * 3);
          api.v2('r', canvas.width, canvas.height);
          api.f('t', t);
          api.v2('m', mx, 1 - my);
          setUniforms(api, P, env);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        destroy() {
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
          canvas.remove();
        }
      };
    };
  }

  SCENES.plasma = shaderScene(
    `uniform vec2 r; uniform float t; uniform vec2 m; uniform float a; uniform float sc; uniform float warp;
     uniform vec3 cA; uniform vec3 cB; uniform vec3 cC;
     void main(){
       vec2 asp = vec2(r.x/r.y, 1.);
       vec2 p = (gl_FragCoord.xy/r - .5) * asp * sc;
       vec2 mm = (m - .5) * asp * sc;
       vec2 d = p - mm; float dl = length(d);
       float ang = warp * 1.6 * exp(-dl*dl*.5);
       p = mm + mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
       float v = sin(p.x + t) + sin(p.y*1.3 + t*1.1) + sin((p.x+p.y)*.7 + t*.7) + sin(length(p)*1.5 - t*1.3);
       v = v*.25 + a*.6;
       float k1 = .5 + .5*sin(v*3.1416 + t*.4);
       float k2 = .5 + .5*sin(v*4.7124 - t*.3 + 1.7);
       vec3 col = mix(cC, cA, k1);
       col = mix(col, cB, k2*k2);
       col *= .85 + .3*k1 + a*.5;
       gl_FragColor = vec4(col, 1.);
     }`,
    (u, P, env) => {
      u.f('a', P.audioReactive ? env.audio.level : 0);
      u.f('sc', P.scale);
      u.f('warp', P.mouseWarp ? 1 : 0);
      u.col('cA', P.colorA); u.col('cB', P.colorB); u.col('cC', P.colorC);
    },
    0.5
  );

  SCENES.nebula = shaderScene(
    `uniform vec2 r; uniform float t; uniform vec2 m; uniform float dens; uniform float stars; uniform float par;
     uniform vec3 cA; uniform vec3 cB; uniform vec3 cC;
     float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
     float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
       return mix(mix(h(i),h(i+vec2(1.,0.)),f.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x), f.y); }
     float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
     void main(){
       vec2 uv = gl_FragCoord.xy / r;
       vec2 p = (uv - .5) * vec2(r.x/r.y, 1.) * 3. + (m - .5) * par;
       vec2 q = vec2(fbm(p + t*.04), fbm(p + vec2(5.2,1.3) - t*.03));
       float f = fbm(p + 2.2*q*dens + t*.02);
       vec3 col = mix(cA*.15, cA, clamp(f*f*2.2, 0., 1.));
       col = mix(col, cB, clamp(q.x*q.x*1.6, 0., 1.)*.7);
       col = mix(col, cC, clamp(pow(q.y, 3.)*1.5, 0., 1.)*.6);
       col *= pow(f, 1.4) * 1.9 * dens;
       float s = h(floor(gl_FragCoord.xy / 1.5));
       float tw = .5 + .5*sin(t*4. + s*80.);
       col += vec3(step(1. - .004*stars, s) * tw);
       gl_FragColor = vec4(col, 1.);
     }`,
    (u, P) => {
      u.f('dens', P.density);
      u.f('stars', P.stars / 100);
      u.f('par', P.mouseParallax ? 0.6 : 0);
      u.col('cA', P.colorA); u.col('cB', P.colorB); u.col('cC', P.colorC);
    },
    0.6
  );

  function create(name, container, props, env) {
    const f = SCENES[name] || SCENES.gradient;
    return f(container, props, env);
  }

  const api = { create, names: Object.keys(SCENES), hexToRgb, rgba, sampleBands };
  root.OWScenes = api;
})(typeof window !== 'undefined' ? window : globalThis);
