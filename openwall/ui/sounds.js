// Sons de l'interface, synthétisés en temps réel (Web Audio) — aucun fichier audio requis.
// « tick » est le son des curseurs : sa hauteur suit la valeur (grave à gauche, aigu à droite).
(function () {
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.6;
  let lastTick = 0;
  let lastHover = 0;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Bip simple avec enveloppe.
  function tone({ freq = 880, to = null, type = 'sine', dur = 0.06, gain = 0.1, attack = 0.003, delay = 0 }) {
    const c = ensure();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // Souffle filtré (ouverture/fermeture de panneaux).
  function whoosh({ from = 400, to = 2400, dur = 0.18, gain = 0.05 }) {
    const c = ensure();
    const t0 = c.currentTime;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    hover() {
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      tone({ freq: 2100, type: 'sine', dur: 0.025, gain: 0.018 });
    },
    click() {
      tone({ freq: 1250, to: 700, type: 'triangle', dur: 0.045, gain: 0.09 });
    },
    tab() {
      tone({ freq: 980, type: 'sine', dur: 0.05, gain: 0.06 });
      tone({ freq: 1470, type: 'sine', dur: 0.06, gain: 0.04, delay: 0.035 });
    },
    // Son du curseur (« scale ») : hauteur proportionnelle à la valeur 0..1.
    tick(v = 0.5) {
      const now = performance.now();
      if (now - lastTick < 28) return;
      lastTick = now;
      const f = 420 * Math.pow(2, Math.max(0, Math.min(1, v)) * 1.6);
      tone({ freq: f, type: 'triangle', dur: 0.022, gain: 0.05, attack: 0.001 });
    },
    toggleOn() {
      tone({ freq: 660, type: 'sine', dur: 0.06, gain: 0.07 });
      tone({ freq: 990, type: 'sine', dur: 0.08, gain: 0.06, delay: 0.05 });
    },
    toggleOff() {
      tone({ freq: 880, type: 'sine', dur: 0.06, gain: 0.06 });
      tone({ freq: 587, type: 'sine', dur: 0.08, gain: 0.05, delay: 0.05 });
    },
    select() {
      tone({ freq: 1046, to: 1318, type: 'sine', dur: 0.07, gain: 0.07 });
    },
    apply() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.28, gain: 0.06, delay: i * 0.055 }));
    },
    open() { whoosh({ from: 300, to: 2600, dur: 0.2, gain: 0.05 }); tone({ freq: 740, type: 'sine', dur: 0.09, gain: 0.03, delay: 0.06 }); },
    close() { whoosh({ from: 2400, to: 300, dur: 0.18, gain: 0.045 }); },
    success() {
      tone({ freq: 784, type: 'sine', dur: 0.12, gain: 0.07 });
      tone({ freq: 1175, type: 'sine', dur: 0.22, gain: 0.06, delay: 0.09 });
    },
    error() {
      tone({ freq: 240, type: 'square', dur: 0.1, gain: 0.04 });
      tone({ freq: 180, type: 'square', dur: 0.16, gain: 0.04, delay: 0.1 });
    },
    remove() { tone({ freq: 520, to: 160, type: 'triangle', dur: 0.18, gain: 0.08 }); },
    drop() { tone({ freq: 330, to: 880, type: 'sine', dur: 0.14, gain: 0.08 }); }
  };

  window.UISound = {
    play(name, arg) {
      if (!enabled || !SOUNDS[name]) return;
      try { SOUNDS[name](arg); } catch { /* audio indisponible */ }
    },
    configure({ enabled: en, volume: vol }) {
      if (typeof en === 'boolean') enabled = en;
      if (typeof vol === 'number') {
        volume = Math.max(0, Math.min(1, vol));
        if (master) master.gain.value = volume;
      }
    }
  };
})();
