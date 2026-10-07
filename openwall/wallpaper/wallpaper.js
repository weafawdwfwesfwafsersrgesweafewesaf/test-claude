// Moteur de rendu d'un fond d'écran (une fenêtre par écran, ou aperçu dans l'interface).
(() => {
  const params = new URLSearchParams(location.search);
  const isPreview = params.has('preview');

  // Pont de communication : IPC Electron sur le bureau, postMessage dans l'aperçu de l'interface.
  const bridge = window.wpAPI || (() => {
    const handlers = {};
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data || !e.data.owChannel) return;
      (handlers[e.data.owChannel] || []).forEach((cb) => cb(e.data.data));
    });
    return {
      platform: 'preview',
      on: (ch, cb) => (handlers[ch] = handlers[ch] || []).push(cb),
      ready: () => window.parent.postMessage({ owReady: true }, '*'),
      log: () => {}
    };
  })();

  const QUALITY = { low: 0.5, medium: 0.75, high: 1 };
  const env = { mouse: { x: 0.5, y: 0.5 }, audio: { bands: new Float32Array(64), level: 0, live: false }, quality: 1 };
  let settings = { fps: 60, quality: 'high', masterVolume: 100, muted: false, transition: true, transitionDuration: 900, audioCapture: true };
  let playback = 'run';
  const stage = document.getElementById('stage');
  let current = null;
  const dying = new Set();

  // ---------------- Audio (capture du son système, Windows) ----------------
  const audio = {
    stream: null, ctx: null, analyser: null, data: null, starting: false,
    async start() {
      if (this.analyser || this.starting) return;
      if (isPreview || bridge.platform !== 'win32' || !settings.audioCapture) return;
      this.starting = true;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((t) => t.stop());
        if (!stream.getAudioTracks().length) throw new Error('aucune piste audio');
        this.stream = stream;
        this.ctx = new AudioContext();
        const src = this.ctx.createMediaStreamSource(stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.72;
        src.connect(this.analyser);
        this.data = new Uint8Array(this.analyser.frequencyBinCount);
        env.audio.live = true;
      } catch (e) {
        bridge.log('Capture audio indisponible : ' + (e && e.message));
        env.audio.live = false;
      }
      this.starting = false;
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) this.ctx.close().catch(() => {});
      this.stream = this.ctx = this.analyser = this.data = null;
      env.audio.live = false;
    },
    update() {
      const bands = env.audio.bands;
      if (!this.analyser) {
        for (let i = 0; i < bands.length; i++) bands[i] *= 0.9;
        env.audio.level *= 0.9;
        return;
      }
      this.analyser.getByteFrequencyData(this.data);
      const sr = this.ctx.sampleRate, bins = this.data.length, nyq = sr / 2;
      const fMin = 30, fMax = 16000;
      let low = 0;
      for (let i = 0; i < bands.length; i++) {
        const f0 = fMin * Math.pow(fMax / fMin, i / bands.length);
        const f1 = fMin * Math.pow(fMax / fMin, (i + 1) / bands.length);
        let a = Math.floor((f0 / nyq) * bins), b = Math.max(a + 1, Math.ceil((f1 / nyq) * bins));
        let sum = 0;
        for (let k = a; k < b && k < bins; k++) sum += this.data[k];
        const v = sum / (b - a) / 255;
        bands[i] = Math.pow(v, 1.4) * (1 + i / bands.length); // compense l'atténuation des aigus
        if (i < 10) low += bands[i];
      }
      env.audio.level = Math.min(1, low / 10);
    }
  };

  function needsAudio(item, p) {
    return (item.type === 'scene' && item.scene === 'visualizer') || p.audioReactive || p.overlayVisualizer;
  }

  // ---------------- Calque (un fond d'écran affiché) ----------------
  class Layer {
    constructor(msg) {
      this.item = msg.item;
      this.url = msg.url;
      this.props = msg.props;
      this.el = document.createElement('div');
      this.el.className = 'layer';
      this.content = document.createElement('div');
      this.content.className = 'content';
      this.vignette = document.createElement('div');
      this.vignette.className = 'vignette';
      this.overlays = document.createElement('div');
      this.overlays.className = 'overlays';
      this.el.append(this.content, this.vignette, this.overlays);
      stage.appendChild(this.el);
      this.timers = [];
      this.ready = new Promise((res) => (this._ready = res));
      setTimeout(() => this._ready(), 4000);
      this.build();
      this.applyProps(this.props);
    }

    build() {
      const { item } = this;
      if (item.type === 'video') {
        const v = (this.video = document.createElement('video'));
        v.loop = true;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.autoplay = playback === 'run';
        v.addEventListener('loadedmetadata', () => {
          if (this.props.startAt > 0 && isFinite(v.duration)) v.currentTime = (v.duration * this.props.startAt) / 100;
        }, { once: true });
        v.addEventListener('canplay', () => this._ready(), { once: true });
        v.addEventListener('error', () => this.showError('Impossible de lire cette vidéo (fichier déplacé ou format non pris en charge).'));
        v.src = this.url;
        this.content.appendChild(v);
        if (playback === 'run') v.play().catch(() => {});
      } else if (item.type === 'image') {
        this.par = document.createElement('div');
        this.par.className = 'parallax';
        const img = (this.img = document.createElement('img'));
        img.className = 'wp-img';
        img.decoding = 'async';
        img.onload = () => this._ready();
        img.onerror = () => { this.showError('Image introuvable.'); this._ready(); };
        img.src = this.url;
        this.par.appendChild(img);
        this.content.appendChild(this.par);
      } else if (item.type === 'web') {
        const f = (this.iframe = document.createElement('iframe'));
        f.allow = 'autoplay; fullscreen';
        f.onload = () => this._ready();
        f.src = this.url;
        this.content.appendChild(f);
      } else if (item.type === 'scene') {
        this.scene = OWScenes.create(item.scene, this.content, this.props, env);
        requestAnimationFrame(() => this._ready());
      }
    }

    showError(msg) {
      if (this.content.querySelector('.error')) return;
      const d = document.createElement('div');
      d.className = 'error';
      d.textContent = msg;
      this.content.appendChild(d);
      this._ready();
    }

    applyProps(p) {
      this.props = p;
      const c = this.content;
      c.style.background = p.background || '#000';
      const filters = [];
      if (p.brightness !== 100) filters.push(`brightness(${p.brightness}%)`);
      if (p.contrast !== 100) filters.push(`contrast(${p.contrast}%)`);
      if (p.saturation !== 100) filters.push(`saturate(${p.saturation}%)`);
      if (p.hue) filters.push(`hue-rotate(${p.hue}deg)`);
      if (p.blur) filters.push(`blur(${p.blur}px)`);
      c.style.filter = filters.join(' ');
      c.style.transform = p.mirror ? 'scaleX(-1)' : '';
      if (p.blur) c.style.inset = `-${p.blur * 2}px`; else c.style.inset = '0';
      this.vignette.style.background = p.vignette
        ? `radial-gradient(ellipse at center, rgba(0,0,0,0) ${60 - p.vignette * 0.35}%, rgba(0,0,0,${p.vignette / 100}) 100%)`
        : 'none';

      const ALIGN = { center: 'center', top: 'center top', bottom: 'center bottom', left: 'left center', right: 'right center' };
      const media = this.video || this.img;
      if (media) {
        media.style.objectFit = p.fit || 'cover';
        media.style.objectPosition = ALIGN[p.align] || 'center';
      }
      if (this.video) {
        this.video.playbackRate = p.speed || 1;
        this.updateAudio();
      }
      if (this.img) {
        this.img.style.animation = p.kenBurns ? `kenburns ${p.kenBurnsSpeed * 2}s ease-in-out infinite alternate` : 'none';
        this.img.style.animationPlayState = playback === 'run' ? 'running' : 'paused';
        if (!p.parallax) this.par.style.transform = '';
      }
      if (this.iframe) {
        const z = (p.zoom || 100) / 100;
        this.iframe.style.width = `${100 / z}%`;
        this.iframe.style.height = `${100 / z}%`;
        this.iframe.style.transform = `scale(${z})`;
        clearInterval(this.refreshTimer);
        if (p.refresh > 0) this.refreshTimer = setInterval(() => { if (playback === 'run') this.iframe.src = this.url; }, p.refresh * 60000);
      }
      if (this.scene) this.scene.setProps(p);
      this.buildOverlays(p);
      if (needsAudio(this.item, p)) audio.start();
    }

    updateAudio() {
      if (!this.video) return;
      const vol = Math.max(0, Math.min(1, ((this.props.volume || 0) / 100) * (settings.masterVolume / 100)));
      this.video.volume = vol;
      this.video.muted = isPreview || settings.muted || playback !== 'run' || vol === 0;
    }

    buildOverlays(p) {
      // Horloge
      if (p.overlayClock) {
        if (!this.clock) {
          this.clock = document.createElement('div');
          this.clock.innerHTML = '<div class="time"></div><div class="date"></div>';
          this.overlays.appendChild(this.clock);
        }
        this.clock.className = 'overlay-clock pos-' + p.clockPosition;
        const scale = isPreview ? Math.max(0.2, stage.clientWidth / 1920) : 1;
        this.clock.style.fontSize = p.clockSize * scale + 'px';
        this.clock.style.color = p.clockColor;
        this.clock.style.textShadow = p.clockShadow ? '0 2px 18px rgba(0,0,0,.55)' : 'none';
        this.clock.querySelector('.date').style.display = p.clockDate ? '' : 'none';
        this._lastClock = '';
        this.updateClock();
      } else if (this.clock) {
        this.clock.remove();
        this.clock = null;
      }
      // Visualiseur en superposition
      if (p.overlayVisualizer) {
        if (!this.viz) {
          this.viz = document.createElement('canvas');
          this.viz.className = 'overlay-viz';
          this.overlays.appendChild(this.viz);
          this.vizVals = new Float32Array(128);
        }
        const h = p.vizHeight;
        this.viz.style.height = h + '%';
        this.viz.style.top = p.vizPosition === 'top' ? '0' : p.vizPosition === 'center' ? `${50 - h / 2}%` : `${100 - h}%`;
        this.viz.style.opacity = p.vizOpacity / 100;
        this.sizeViz();
      } else if (this.viz) {
        this.viz.remove();
        this.viz = null;
      }
    }

    sizeViz() {
      if (!this.viz) return;
      const r = this.viz.getBoundingClientRect();
      this.viz.width = Math.max(1, Math.round(r.width * env.quality));
      this.viz.height = Math.max(1, Math.round(r.height * env.quality));
    }

    updateClock() {
      if (!this.clock) return;
      const p = this.props, d = new Date();
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0'), s = String(d.getSeconds()).padStart(2, '0');
      let suffix = '';
      if (p.clockFormat === '12') { suffix = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
      const t = `${p.clockFormat === '12' ? h : String(h).padStart(2, '0')}:${m}${p.clockSeconds ? ':' + s : ''}`;
      const key = t + suffix;
      if (key === this._lastClock) return;
      this._lastClock = key;
      this.clock.querySelector('.time').innerHTML = t + (suffix ? `<span class="ampm">${suffix}</span>` : '');
      const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      this.clock.querySelector('.date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    }

    drawViz(dt) {
      const c = this.viz, p = this.props;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const n = Math.round(p.vizBars);
      const bw = c.width / n;
      g.fillStyle = p.vizColor;
      for (let i = 0; i < n; i++) {
        let v = OWScenes.sampleBands(env.audio.bands, n, i);
        if (!env.audio.live) v = 0.03 + 0.02 * Math.sin(performance.now() / 400 + i * 0.4);
        this.vizVals[i] = this.vizVals[i] * 0.6 + Math.min(1, v * 1.3) * 0.4;
        const h = Math.max(2, this.vizVals[i] * c.height);
        const y = p.vizPosition === 'top' ? 0 : p.vizPosition === 'center' ? (c.height - h) / 2 : c.height - h;
        g.fillRect(i * bw + 1, y, Math.max(1, bw - 2), h);
      }
    }

    frame(dt) {
      if (this.scene) this.scene.frame(dt);
      if (this.img && this.props.parallax) {
        const k = this.props.parallaxStrength / 100 * 40;
        const x = (0.5 - env.mouse.x) * k, y = (0.5 - env.mouse.y) * k;
        this.par.style.transform = `translate(${x}px, ${y}px) scale(${1 + k / 900})`;
      }
      if (this.clock) this.updateClock();
      if (this.viz) this.drawViz(dt);
    }

    setPlayback(action) {
      if (this.video) {
        if (action === 'run' || action === 'mute') this.video.play().catch(() => {});
        else this.video.pause();
        this.updateAudio();
      }
      if (this.img) this.img.style.animationPlayState = action === 'run' || action === 'mute' ? 'running' : 'paused';
    }

    resize() {
      if (this.scene) this.scene.resize();
      this.sizeViz();
      if (this.clock) this.buildOverlays(this.props);
    }

    destroy() {
      clearInterval(this.refreshTimer);
      if (this.scene) this.scene.destroy();
      if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
      if (this.iframe) this.iframe.src = 'about:blank';
      this.el.remove();
    }
  }

  // ---------------- Boucle d'animation ----------------
  let raf = 0, last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const minDt = 1000 / Math.max(1, settings.fps);
    if (now - last < minDt - 2) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    audio.update();
    if (current) current.frame(dt);
    dying.forEach((l) => l.frame(dt));
  }
  function startLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  // ---------------- Messages ----------------
  let loadSeq = 0;
  async function load(msg) {
    const seq = ++loadSeq;
    const old = current;
    const layer = new Layer(msg);
    current = layer;
    layer.setPlayback(playback);
    await layer.ready;
    if (seq !== loadSeq) return;
    const dur = settings.transition && old ? settings.transitionDuration : 0;
    layer.el.style.transition = `opacity ${dur}ms ease`;
    requestAnimationFrame(() => layer.el.classList.add('visible'));
    if (old) {
      dying.add(old);
      setTimeout(() => { old.destroy(); dying.delete(old); }, dur + 50);
    }
    // Plus besoin du son système ?
    if (!needsAudio(layer.item, layer.props)) audio.stop();
  }

  function unload() {
    loadSeq++;
    if (current) current.destroy();
    current = null;
    dying.forEach((l) => l.destroy());
    dying.clear();
    audio.stop();
  }

  function applySettings(s) {
    const oldQ = env.quality;
    settings = Object.assign(settings, s);
    env.quality = QUALITY[settings.quality] || 1;
    if (oldQ !== env.quality && current) current.resize();
    if (current) current.updateAudio();
    if (!settings.audioCapture) audio.stop();
    else if (current && needsAudio(current.item, current.props)) audio.start();
  }

  function setPlayback(action) {
    playback = action;
    if (current) current.setPlayback(action);
    if (action === 'run' || action === 'mute') startLoop(); else stopLoop();
  }

  bridge.on('load', (msg) => { if (msg.settings) applySettings(msg.settings); load(msg); });
  bridge.on('props', (msg) => { if (current && current.item.id === msg.id) current.applyProps(msg.props); });
  bridge.on('settings', applySettings);
  bridge.on('playback', setPlayback);
  bridge.on('unload', unload);
  bridge.on('mouse', (m) => { env.mouse.x = m.x; env.mouse.y = m.y; });

  if (isPreview) {
    window.addEventListener('mousemove', (e) => {
      env.mouse.x = e.clientX / window.innerWidth;
      env.mouse.y = e.clientY / window.innerHeight;
    });
  }
  window.addEventListener('resize', () => current && current.resize());
  window.addEventListener('error', (e) => bridge.log('Erreur : ' + e.message));

  startLoop();
  bridge.ready();
})();
