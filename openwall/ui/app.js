// Interface d'OpenWall : bibliothèque, propriétés, playlist, paramètres, import.
(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Schemas = window.OWSchemas;
  const snd = (name, arg) => window.UISound.play(name, arg);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // En dehors d'Electron (ex. test dans un navigateur), une API factice est utilisée.
  const ow = window.ow || window.__owMock;
  if (!ow) {
    document.body.innerHTML = '<p style="padding:40px">Lancez OpenWall via Electron (npm start).</p>';
    return;
  }

  const TYPE_LABEL = { video: 'Vidéo', image: 'Image', web: 'Web', scene: 'Scène' };
  const TYPE_ICON = { video: 'film', image: 'image', web: 'globe', scene: 'sparkles' };
  const RES = [['hd', 'Standard (≤ 1080p)'], ['2k', '2K / 1440p'], ['4k', '4K et plus'], ['ultra', 'Ultra-large'], ['portrait', 'Portrait']];
  const ACTIONS = [['run', 'Continuer la lecture'], ['mute', 'Couper le son'], ['pause', 'Mettre en pause'], ['stop', 'Arrêter (libère la mémoire)']];
  const ACCENTS = ['#3a8ee6', '#00b4d8', '#3ecf8e', '#8b5cf6', '#e5484d', '#f59e0b', '#ec4899', '#64748b'];

  let state = await ow.getState();
  const ui = {
    tab: 'installed',
    selected: null,
    search: '',
    sort: 'name',
    dir: 1,
    show: 'all',
    types: new Set(),
    res: new Set(),
    tag: null,
    target: null,
    plEdit: false,
    snapshot: { assignments: clone(state.settings.display.assignments), props: {} },
    previewReady: false,
    previewQueue: null,
    propsKey: null,
    collapsed: {},
    thumbBusy: new Set(),
    sceneThumbs: {}
  };

  const primary = () => state.displays.find((d) => d.primary) || state.displays[0];
  ui.target = primary() ? primary().id : 'all';

  const getItem = (id) => state.items.find((i) => i.id === id);
  const settings = () => state.settings;
  const plItems = () => settings().playlist.items;
  const applyTarget = () => (settings().display.mode === 'per-display' ? ui.target : 'all');
  const assignedFor = (key) => {
    const { mode, assignments } = settings().display;
    if (mode === 'per-display') return assignments[key] || assignments.all || null;
    return assignments.all || null;
  };
  const onDesktop = (id) => {
    const { mode, assignments } = settings().display;
    if (mode !== 'per-display') return assignments.all === id ? ['all'] : [];
    return state.displays.filter((d) => (assignments[d.id] || assignments.all) === id).map((d) => d.index);
  };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  const fmtSize = (b) => (!b ? '' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' Ko');
  const fmtDur = (s) => (!s || !isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

  function resClasses(it) {
    const w = it.width, h = it.height;
    if (!w || !h) return it.type === 'scene' || it.type === 'web' ? ['hd', '2k', '4k'] : [];
    const out = [];
    if (h > w) out.push('portrait');
    if (w / h > 2.1) out.push('ultra');
    const m = Math.max(w, h);
    out.push(m <= 1920 ? 'hd' : m <= 2560 ? '2k' : '4k');
    return out;
  }

  // ================================================================ Thème
  function applyTheme() {
    const s = settings().ui;
    document.body.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    document.documentElement.style.setProperty('--accent', s.accent || '#3a8ee6');
    document.documentElement.style.setProperty('--tile-min', { small: '160px', medium: '220px', large: '320px' }[s.gridSize] || '220px');
    window.UISound.configure({ enabled: !!s.sounds, volume: (s.soundVolume ?? 60) / 100 });
    $$('#grid-size button').forEach((b) => b.classList.toggle('on', b.dataset.size === (s.gridSize || 'medium')));
  }

  // ================================================================ Barre du haut
  function renderTopbar() {
    const s = settings();
    const paused = state.rules.manualPause;
    const pb = $('#btn-pause');
    pb.innerHTML = icon(paused ? 'play' : 'pause');
    pb.title = paused ? 'Reprendre les fonds d’écran' : 'Mettre en pause les fonds d’écran';
    pb.classList.toggle('warn', paused);
    const mb = $('#btn-mute');
    mb.innerHTML = icon(s.audio.muteAll ? 'volumeOff' : 'volume');
    mb.title = s.audio.muteAll ? 'Réactiver le son' : 'Couper le son';
    mb.classList.toggle('warn', s.audio.muteAll);

    const chip = $('#status-chip');
    const pbState = state.playback;
    if (pbState !== 'run') {
      chip.classList.remove('hidden');
      chip.textContent = paused ? 'En pause'
        : pbState === 'mute' ? 'Son coupé automatiquement'
          : pbState === 'pause' ? 'En pause automatique'
            : 'Arrêté automatiquement';
    } else chip.classList.add('hidden');

    const mode = s.display.mode;
    let label;
    if (mode === 'span') label = 'Tous les écrans (étendu)';
    else if (mode === 'clone') label = 'Tous les écrans (cloné)';
    else {
      const d = state.displays.find((x) => x.id === ui.target) || primary();
      if (d) ui.target = d.id;
      label = state.displays.length > 1 ? `Écran ${d ? d.index : 1}` : 'Écran principal';
    }
    $('#display-label').textContent = label;

    const pt = $('#pl-toggle');
    const active = s.playlist.active;
    pt.classList.toggle('running', active);
    pt.innerHTML = icon(active ? 'stop' : 'play') + `<span>${active ? 'Arrêter' : 'Démarrer'}</span>`;
    $('#pl-add').classList.toggle('active', ui.plEdit);
    $('#pl-banner').classList.toggle('hidden', !ui.plEdit);
  }

  // ================================================================ Filtres
  function renderFilters() {
    const counts = { video: 0, image: 0, web: 0, scene: 0 };
    state.items.forEach((i) => counts[i.type]++);
    const tf = $('#type-filters');
    tf.innerHTML = Object.keys(TYPE_LABEL).map((t) => `
      <label class="check"><input type="checkbox" data-type="${t}" ${ui.types.has(t) ? 'checked' : ''}>
      <span>${TYPE_LABEL[t]}</span><span class="count">${counts[t]}</span></label>`).join('');
    const rf = $('#res-filters');
    rf.innerHTML = RES.map(([k, l]) => `
      <label class="check"><input type="checkbox" data-res="${k}" ${ui.res.has(k) ? 'checked' : ''}><span>${l}</span></label>`).join('');
    const tags = new Map();
    state.items.forEach((i) => (i.tags || []).forEach((t) => tags.set(t, (tags.get(t) || 0) + 1)));
    const tg = $('#tag-filters');
    tg.innerHTML = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([t]) => `<button class="chip ${ui.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('') ||
      '<span style="color:var(--text-3);font-size:12px">Aucune étiquette</span>';
    $('#sort-dir').innerHTML = icon(ui.dir > 0 ? 'sortAsc' : 'sortDesc');
    $('#sort').value = ui.sort;
  }

  function visibleItems() {
    let items = state.items.slice();
    const q = ui.search.trim().toLowerCase();
    if (q) items = items.filter((i) => `${i.title} ${(i.tags || []).join(' ')} ${TYPE_LABEL[i.type]} ${i.description || ''}`.toLowerCase().includes(q));
    if (ui.show === 'favorites') items = items.filter((i) => i.favorite);
    if (ui.show === 'mine') items = items.filter((i) => !i.builtin);
    if (ui.show === 'playlist') items = items.filter((i) => plItems().includes(i.id));
    if (ui.types.size) items = items.filter((i) => ui.types.has(i.type));
    if (ui.res.size) items = items.filter((i) => resClasses(i).some((c) => ui.res.has(c)));
    if (ui.tag) items = items.filter((i) => (i.tags || []).includes(ui.tag));
    const by = {
      name: (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base', numeric: true }),
      date: (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
      type: (a, b) => a.type.localeCompare(b.type) || by.name(a, b),
      favorite: (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || by.name(a, b),
      resolution: (a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0),
      size: (a, b) => (a.size || 0) - (b.size || 0)
    };
    items.sort((a, b) => by[ui.sort](a, b) * ui.dir);
    return items;
  }

  // ================================================================ Grille
  const tileEls = new Map();

  function tileHTML(it) {
    const desk = onDesktop(it.id);
    const plIdx = plItems().indexOf(it.id);
    const thumb = it.thumbUrl
      ? `<img src="${esc(it.thumbUrl)}" alt="" loading="lazy" draggable="false">`
      : `<div class="ph">${icon(TYPE_ICON[it.type])}</div>`;
    return `${thumb}
      <div class="t-badges">
        <span class="t-badge">${icon(TYPE_ICON[it.type])}${TYPE_LABEL[it.type]}</span>
        ${desk.length ? `<span class="t-badge on-desk">${icon('monitor')}${desk[0] === 'all' ? 'Actif' : 'Écran ' + desk.join(', ')}</span>` : ''}
        ${it.missing ? `<span class="t-badge missing">${icon('alert')}Introuvable</span>` : ''}
      </div>
      ${it.favorite ? `<div class="t-fav">${icon('starFill')}</div>` : ''}
      ${ui.plEdit ? `<div class="t-pl ${plIdx < 0 ? 'off' : ''}"><span>${plIdx < 0 ? '+' : plIdx + 1}</span></div>` : ''}
      <div class="t-title">${esc(it.title)}</div>`;
  }

  function renderGrid() {
    const grid = $('#grid');
    const items = visibleItems();
    const seen = new Set();
    items.forEach((it, idx) => {
      seen.add(it.id);
      let t = tileEls.get(it.id);
      const html = tileHTML(it);
      if (!t) {
        t = el('div', 'tile');
        t.dataset.id = it.id;
        tileEls.set(it.id, t);
      }
      if (t._html !== html) {
        const vid = t.querySelector('video');
        t.innerHTML = html;
        t._html = html;
        if (vid) t.appendChild(vid);
      }
      t.classList.toggle('selected', ui.selected === it.id);
      if (grid.children[idx] !== t) grid.insertBefore(t, grid.children[idx] || null);
    });
    for (const [id, t] of tileEls) if (!seen.has(id)) { t.remove(); if (!getItem(id)) tileEls.delete(id); }
    $('#grid-count').textContent = `${items.length} fond${items.length > 1 ? 's' : ''} d'écran${items.length !== state.items.length ? ` sur ${state.items.length}` : ''}`;
    const empty = $('#grid-empty');
    if (!items.length) {
      empty.classList.remove('hidden');
      empty.innerHTML = state.items.length
        ? '<p>Aucun fond d’écran ne correspond à ces filtres.</p><button class="btn" id="empty-reset">Réinitialiser les filtres</button>'
        : `<p>Votre bibliothèque est vide.</p><button class="btn primary" id="empty-discover">${icon('download')}Découvrir des fonds anime</button>
           <button class="btn" id="empty-import">${icon('film')}Importer mes vidéos</button>`;
    } else empty.classList.add('hidden');
  }

  // Aperçu vidéo au survol des vignettes
  let hoverTile = null, hoverTimer = null;
  function tileEnter(t) {
    if (!t) return;
    snd('hover');
    const it = getItem(t.dataset.id);
    if (!it || it.type !== 'video' || it.missing || !settings().ui.previewOnHover) return;
    hoverTimer = setTimeout(() => {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.src = it.mediaUrl;
      v.addEventListener('playing', () => v.classList.add('playing'), { once: true });
      t.insertBefore(v, t.querySelector('.t-badges'));
      v.play().catch(() => {});
    }, 350);
  }
  function tileLeave(t) {
    clearTimeout(hoverTimer);
    if (!t) return;
    const v = t.querySelector('video');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  }

  // ================================================================ Sélection / application
  async function select(id, apply) {
    const it = getItem(id);
    if (!it) return;
    const changed = ui.selected !== id;
    ui.selected = id;
    renderGrid();
    renderDetails(true);
    if (changed) loadPreview(it);
    if (apply) {
      if (it.missing) { snd('error'); toast('Le fichier de ce fond d’écran est introuvable.', 'error'); return; }
      const already = assignedFor(applyTarget() === 'all' ? (primary() || {}).id : applyTarget()) === id;
      snd(already ? 'select' : 'apply');
      if (!already) await ow.apply(id, applyTarget());
    } else snd('select');
  }

  // ================================================================ Aperçu (iframe)
  const frame = $('#preview-frame');
  window.addEventListener('message', (e) => {
    if (e.source === frame.contentWindow && e.data && e.data.owReady) {
      ui.previewReady = true;
      if (ui.previewQueue) { postPreview('load', ui.previewQueue); ui.previewQueue = null; }
    }
  });
  function postPreview(ch, data) {
    if (!ui.previewReady) { if (ch === 'load') ui.previewQueue = data; return; }
    frame.contentWindow.postMessage({ owChannel: ch, data }, '*');
  }
  function loadPreview(it) {
    postPreview('load', {
      item: { id: it.id, type: it.type, scene: it.scene, title: it.title },
      url: it.mediaUrl,
      props: Schemas.resolveProps(it),
      settings: { fps: 30, quality: 'medium', masterVolume: 0, muted: true, transition: false, audioCapture: false }
    });
  }
  document.addEventListener('visibilitychange', () => postPreview('playback', document.hidden ? 'pause' : 'run'));

  // ================================================================ Détails / propriétés
  function renderDetails(force) {
    const it = getItem(ui.selected);
    $('#details-empty').classList.toggle('hidden', !!it);
    $('#details-body').classList.toggle('hidden', !it);
    if (!it) { ui.propsKey = null; postPreview('unload'); return; }

    const ti = $('#det-title');
    if (document.activeElement !== ti) ti.value = it.title;
    const meta = [TYPE_LABEL[it.type]];
    if (it.width) meta.push(`${it.width}×${it.height}`);
    if (it.duration) meta.push(fmtDur(it.duration));
    if (it.size) meta.push(fmtSize(it.size));
    if (it.builtin) meta.push('Scène intégrée');
    if (it.url) { try { meta.push(new URL(it.url).hostname); } catch { /* adresse invalide */ } }
    $('#det-meta').innerHTML = esc(meta.join(' · ')) + (it.missing ? '<br><span class="warn">Fichier introuvable : ' + esc(it.file) + '</span>' : '') +
      (it.description ? `<br>${esc(it.description)}` : '');
    $('#preview-type').innerHTML = `<span class="t-badge">${icon(TYPE_ICON[it.type])}${TYPE_LABEL[it.type]}</span>`;
    $('#det-tags').innerHTML = (it.tags || []).map((t) => `<button class="chip" data-tag="${esc(t)}" title="Cliquer pour retirer">${esc(t)} ×</button>`).join('') +
      '<button class="chip" id="add-tag">+ Étiquette</button>';

    const fav = $('#det-fav');
    fav.innerHTML = icon(it.favorite ? 'starFill' : 'star');
    fav.classList.toggle('on', !!it.favorite);
    fav.title = it.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
    const inPl = plItems().includes(it.id);
    const pl = $('#det-playlist');
    pl.innerHTML = icon('playlist');
    pl.classList.toggle('on', inPl);
    pl.title = inPl ? 'Retirer de la playlist' : 'Ajouter à la playlist';
    $('#det-apply-all').innerHTML = icon('monitors');
    $('#det-apply-all').classList.toggle('hidden', state.displays.length < 2 || settings().display.mode !== 'per-display');
    $('#det-dup').innerHTML = icon('copy');
    $('#det-folder').innerHTML = icon('folder');
    $('#det-folder').classList.toggle('hidden', !it.file);
    $('#det-reset').innerHTML = icon('reset');
    $('#det-delete').innerHTML = icon('trash');
    $('#det-delete').title = it.builtin ? 'Se désabonner (retirer de la bibliothèque)' : 'Supprimer de la bibliothèque';

    const props = Schemas.resolveProps(it);
    const key = it.id + JSON.stringify(props);
    if (force || key !== ui.propsKey) {
      const active = document.activeElement;
      if (!force && active && $('#props').contains(active) && active.type === 'range') return; // ne pas casser un glissement
      buildProps(it, props);
      ui.propsKey = key;
    }
  }

  function fmtVal(p, v) {
    if (p.zeroLabel && Number(v) === 0) return p.zeroLabel;
    const dec = String(p.step || 1).includes('.') ? String(p.step).split('.')[1].length : 0;
    return Number(v).toFixed(dec) + (p.unit || '');
  }

  let liveTimer = null, livePending = null;
  function livePreview(it, props) {
    postPreview('props', { id: it.id, props: { ...props } });
    livePending = { id: it.id, props: { ...props } };
    if (liveTimer) return;
    liveTimer = setTimeout(() => {
      liveTimer = null;
      if (livePending) ow.previewProps(livePending.id, livePending.props);
      livePending = null;
    }, 40);
  }

  let sceneThumbTimer = null;
  function commitProps(it, props) {
    if (!(it.id in ui.snapshot.props)) ui.snapshot.props[it.id] = clone(it.properties || {});
    const defs = Schemas.defaultsFor(it);
    const diff = {};
    for (const [k, v] of Object.entries(props)) if (defs[k] !== v) diff[k] = v;
    ui.propsKey = it.id + JSON.stringify(Schemas.resolveProps({ ...it, properties: diff }));
    ow.updateItem(it.id, { properties: diff });
    if (it.type === 'scene') {
      clearTimeout(sceneThumbTimer);
      sceneThumbTimer = setTimeout(async () => {
        const data = sceneThumb(it.scene, Schemas.resolveProps({ ...it, properties: diff }));
        if (data) ow.saveThumbnail(it.id, data);
      }, 1500);
    }
  }

  function buildProps(it, props) {
    const root = $('#props');
    root.innerHTML = '';
    const rows = [];
    const updateVisibility = () => rows.forEach(({ p, row }) => row.classList.toggle('hidden', !!p.showIf && !props[p.showIf]));

    for (const g of Schemas.schemaFor(it)) {
      const sec = el('div', 'prop-group' + (ui.collapsed[g.title] ? ' collapsed' : ''));
      const head = el('button', 'prop-group-head', `<span>${esc(g.title)}</span>${icon('caret')}`);
      head.onclick = () => {
        ui.collapsed[g.title] = !ui.collapsed[g.title];
        sec.classList.toggle('collapsed', ui.collapsed[g.title]);
        snd('click');
      };
      const list = el('div', 'prop-list');
      sec.append(head, list);
      root.appendChild(sec);

      for (const p of g.props) {
        const row = el('div', 'prop');
        const v = props[p.key];
        if (p.type === 'slider') {
          row.innerHTML = `<div class="prop-row"><label>${esc(p.label)}</label><span class="val"></span></div>
            <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">`;
          const r = row.querySelector('input'), val = row.querySelector('.val');
          const sync = () => {
            const f = ((r.value - p.min) / (p.max - p.min)) * 100;
            r.style.setProperty('--fill', f + '%');
            val.textContent = fmtVal(p, r.value);
          };
          sync();
          r.addEventListener('input', () => {
            props[p.key] = parseFloat(r.value);
            sync();
            snd('tick', (r.value - p.min) / (p.max - p.min));
            livePreview(it, props);
          });
          r.addEventListener('change', () => { commitProps(it, props); r.blur(); });
          r.addEventListener('dblclick', () => { // double-clic = valeur par défaut
            r.value = p.default; props[p.key] = p.default; sync(); snd('click'); livePreview(it, props); commitProps(it, props);
          });
        } else if (p.type === 'bool') {
          row.innerHTML = `<div class="prop-row"><label>${esc(p.label)}</label>
            <label class="switch"><input type="checkbox" ${v ? 'checked' : ''}><span></span></label></div>`;
          const c = row.querySelector('input');
          c.addEventListener('change', () => {
            props[p.key] = c.checked;
            snd(c.checked ? 'toggleOn' : 'toggleOff');
            updateVisibility();
            livePreview(it, props);
            commitProps(it, props);
          });
        } else if (p.type === 'combo') {
          row.innerHTML = `<div class="prop-row"><label>${esc(p.label)}</label><select>${p.options.map(([k, l]) =>
            `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
          const s = row.querySelector('select');
          s.addEventListener('change', () => {
            props[p.key] = s.value;
            snd('click');
            livePreview(it, props);
            commitProps(it, props);
          });
        } else if (p.type === 'color') {
          row.innerHTML = `<div class="prop-row"><label>${esc(p.label)}</label>
            <label class="color-btn"><i style="background:${esc(v)}"></i><input type="color" value="${esc(v)}"></label></div>`;
          const c = row.querySelector('input'), sw = row.querySelector('i');
          c.addEventListener('input', () => { props[p.key] = c.value; sw.style.background = c.value; livePreview(it, props); });
          c.addEventListener('change', () => { snd('click'); commitProps(it, props); });
          c.addEventListener('click', () => snd('open'));
        }
        rows.push({ p, row });
        list.appendChild(row);
      }
    }
    updateVisibility();
  }

  // ================================================================ Découvrir
  function sceneThumb(scene, props) {
    const box = el('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:270px;overflow:hidden';
    document.body.appendChild(box);
    const env = { mouse: { x: 0.62, y: 0.42 }, audio: { bands: new Float32Array(64).map((_, i) => 0.25 * Math.exp(-i / 18) + 0.05), level: 0.15, live: true }, quality: 1 };
    let data = null;
    try {
      const inst = OWScenes.create(scene, box, props, env);
      for (let i = 0; i < 90; i++) inst.frame(1 / 30);
      const c = document.createElement('canvas');
      c.width = 480; c.height = 270;
      c.getContext('2d').drawImage(inst.canvas, 0, 0, 480, 270);
      data = c.toDataURL('image/jpeg', 0.86);
      inst.destroy();
    } catch (e) {
      console.warn('Miniature de scène impossible', scene, e);
    }
    box.remove();
    return data;
  }

  // Catalogue en ligne : 50 fonds par site, chargés à la demande et mis en cache 12 h par l'application.
  const disc = { sources: null, data: {}, site: 'all', q: '', busy: new Map(), key: '' };

  async function ensureCatalog(force) {
    if (!ow.catalogSources) return;
    if (!disc.sources) disc.sources = await ow.catalogSources();
    for (const src of disc.sources) {
      const cur = disc.data[src.id];
      if (cur && cur.loading) continue;
      if (cur && !force && (cur.entries || []).length) continue;
      disc.data[src.id] = { loading: true, entries: cur ? cur.entries : [] };
      renderDiscover(true);
    }
    // Un site après l'autre : moins de charge réseau, et chaque section s'affiche dès qu'elle est prête.
    for (const src of disc.sources) {
      if (!disc.data[src.id].loading) continue;
      try {
        const res = await ow.catalog(src.id, !!force);
        disc.data[src.id] = { loading: false, entries: res.entries || [], error: res.error };
      } catch (e) {
        disc.data[src.id] = { loading: false, entries: [], error: String(e.message || e).replace(/^.*Error: /, '') };
      }
      renderDiscover(true);
    }
  }

  function discEntries(siteId) {
    const d = disc.data[siteId];
    const q = disc.q.trim().toLowerCase();
    const list = (d && d.entries) || [];
    return list.map((e, i) => ({ e, i })).filter(({ e }) => !q || e.title.toLowerCase().includes(q));
  }

  function discCard(siteId, e, i, installed) {
    const busy = disc.busy.get(e.url);
    const pct = busy ? Math.round((busy.progress || 0) * 100) : 0;
    return `<div class="dcard${busy ? ' busy' : ''}" data-site="${esc(siteId)}" data-i="${i}" data-url="${esc(e.url)}">
      <div class="d-img">${e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : icon('film')}
        ${installed ? `<span class="d-badge t-badge on-desk">${icon('check')}Installé</span>` : ''}
        <div class="d-bar ${busy ? '' : 'hidden'}"><i style="width:${pct}%"></i></div></div>
      <div class="d-body"><span class="d-title" title="${esc(e.title)}">${esc(e.title)}</span>
        ${installed
          ? `<button class="btn small" data-apply>${icon('monitor')}Appliquer</button>`
          : `<button class="btn small primary" data-dl ${busy ? 'disabled' : ''}>${icon('download')}${busy ? pct + ' %' : 'Télécharger'}</button>`}
      </div></div>`;
  }

  function renderDiscover(force) {
    if (ui.tab !== 'discover' || !disc.sources) return;
    const installed = new Set(state.items.map((i) => i.sourceUrl).filter(Boolean));
    const key = JSON.stringify([disc.site, disc.q, [...installed].length, disc.sources.map((s) => {
      const d = disc.data[s.id] || {};
      return [d.loading, (d.entries || []).length, d.error];
    })]);
    if (!force && key === disc.key) return; // rien de neuf : on ne reconstruit pas 250 cartes
    disc.key = key;

    $('#disc-sites').innerHTML = [{ id: 'all', name: 'Tous les sites' }, ...disc.sources].map((src) => {
      const d = disc.data[src.id];
      const n = src.id === 'all' ? '' : d && d.loading ? ' …' : d ? ` (${(d.entries || []).length})` : '';
      return `<button class="chip ${disc.site === src.id ? 'on' : ''}" data-site-filter="${esc(src.id)}">${esc(src.name)}${n}</button>`;
    }).join('');

    const g = $('#discover-grid');
    g.innerHTML = disc.sources.filter((src) => disc.site === 'all' || disc.site === src.id).map((src) => {
      const d = disc.data[src.id] || { loading: true };
      const list = discEntries(src.id);
      let body;
      if (d.loading && !list.length) body = `<div class="disc-grid">${'<div class="skel"></div>'.repeat(8)}</div>`;
      else if (!list.length && d.error) {
        body = `<div class="disc-error">${icon('alert')}<span>Impossible de charger ce site (${esc(d.error)}).</span>
          <div class="spacer"></div><button class="btn small" data-retry="${esc(src.id)}">Réessayer</button></div>`;
      } else if (!list.length) body = '<div class="disc-error">Aucun résultat.</div>';
      else body = `<div class="disc-grid">${list.map(({ e, i }) => discCard(src.id, e, i, installed.has(e.url))).join('')}</div>`;
      return `<section class="disc-section"><div class="disc-head"><h2>${esc(src.name)}</h2>
        <span class="sub">${d.loading ? 'Chargement…' : `${list.length} fond${list.length > 1 ? 's' : ''} d'écran`}</span></div>${body}</section>`;
    }).join('');
  }

  async function discDownload(card) {
    const siteId = card.dataset.site;
    const entry = (disc.data[siteId].entries || [])[+card.dataset.i];
    if (!entry || disc.busy.has(entry.url)) return;
    disc.busy.set(entry.url, { progress: 0 });
    snd('click');
    renderDiscover(true);
    try {
      await ow.catalogDownload(siteId, entry, applyTarget());
      snd('apply');
      toast(`« ${entry.title} » est maintenant votre fond d'écran.`, 'success');
    } catch (e) {
      snd('error');
      toast(`Échec du téléchargement : ${String(e.message || e).replace(/^.*Error: /, '')}`, 'error');
    }
    disc.busy.delete(entry.url);
    renderDiscover(true);
  }

  if (ow.onCatalogDl) {
    ow.onCatalogDl((d) => {
      const b = disc.busy.get(d.url);
      if (!b) return;
      b.progress = d.progress || 0;
      const card = [...document.querySelectorAll('#discover-grid .dcard')].find((c) => c.dataset.url === d.url);
      if (!card) return;
      const pct = Math.round(b.progress * 100);
      const bar = card.querySelector('.d-bar i');
      if (bar) bar.style.width = pct + '%';
      const btn = card.querySelector('[data-dl]');
      if (btn) btn.innerHTML = icon('download') + (d.status === 'downloading' ? pct + ' %' : '…');
    });
  }

  // ================================================================ Miniatures (vidéos, images, scènes)
  const thumbQueue = [];
  let thumbRunning = false;

  function once(target, ev, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('délai dépassé')), ms);
      target.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
      target.addEventListener('error', () => { clearTimeout(t); rej(new Error('erreur de chargement')); }, { once: true });
    });
  }

  function coverDataURL(src, sw, sh) {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 270;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 480, 270);
    const k = Math.max(480 / sw, 270 / sh);
    g.drawImage(src, (480 - sw * k) / 2, (270 - sh * k) / 2, sw * k, sh * k);
    return c.toDataURL('image/jpeg', 0.85);
  }

  async function makeThumb(it) {
    if (it.type === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = it.mediaUrl;
      await once(v, 'loadedmetadata', 20000);
      const meta = { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
      v.currentTime = Math.min((v.duration || 0) * 0.15, 3);
      await once(v, 'seeked', 20000);
      const data = coverDataURL(v, v.videoWidth, v.videoHeight);
      v.removeAttribute('src'); v.load();
      await ow.updateItem(it.id, meta);
      await ow.saveThumbnail(it.id, data);
    } else if (it.type === 'image') {
      const img = new Image();
      img.src = it.mediaUrl;
      await once(img, 'load', 20000);
      await ow.updateItem(it.id, { width: img.naturalWidth, height: img.naturalHeight });
      await ow.saveThumbnail(it.id, coverDataURL(img, img.naturalWidth, img.naturalHeight));
    } else if (it.type === 'scene') {
      const data = sceneThumb(it.scene, Schemas.resolveProps(it));
      if (data) await ow.saveThumbnail(it.id, data);
    }
  }

  function queueThumbs() {
    for (const it of state.items) {
      if (it.thumbUrl || it.missing || it.type === 'web' || ui.thumbBusy.has(it.id)) continue;
      ui.thumbBusy.add(it.id);
      thumbQueue.push(it.id);
    }
    runThumbs();
  }

  async function runThumbs() {
    if (thumbRunning) return;
    thumbRunning = true;
    while (thumbQueue.length) {
      const it = getItem(thumbQueue.shift());
      if (!it) continue;
      try { await makeThumb(it); } catch (e) { console.warn('Miniature impossible pour', it.title, e.message); }
      await new Promise((r) => setTimeout(r, 60)); // laisse respirer l'interface
    }
    thumbRunning = false;
  }

  // ================================================================ Rendu global
  function renderAll() {
    applyTheme();
    renderTopbar();
    renderFilters();
    renderGrid();
    renderDetails(false);
    renderDiscover();
    queueThumbs();
  }

  ow.onState((s) => {
    state = s;
    if (ui.selected && !getItem(ui.selected)) ui.selected = null;
    renderAll();
  });

  // ================================================================ Utilitaires d'interface
  function toast(msg, type) {
    const t = el('div', 'toast ' + (type || ''), `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info')}<span>${esc(msg)}</span>`);
    $('#toast-root').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  function modal({ title, body, buttons = [], width, onClose }) {
    const back = el('div', 'modal-back');
    const m = el('div', 'modal');
    if (width) m.style.width = `min(${width}px, calc(100vw - 60px))`;
    m.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn small" data-close>${icon('x')}</button></div>`;
    const bodyEl = el('div', 'modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    m.appendChild(bodyEl);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      back.remove();
      snd('close');
      document.removeEventListener('keydown', onKey, true);
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    if (buttons.length) {
      const foot = el('div', 'modal-foot');
      for (const b of buttons) {
        const btn = el('button', 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), esc(b.label));
        btn.onclick = async () => {
          snd('click');
          const r = b.onClick ? await b.onClick() : undefined;
          if (r !== false) close();
        };
        foot.appendChild(btn);
      }
      m.appendChild(foot);
    }
    m.querySelector('[data-close]').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.appendChild(m);
    $('#modal-root').appendChild(back);
    snd('open');
    return { close, body: bodyEl, el: m };
  }

  function confirmBox(title, text, okLabel = 'Confirmer', danger = true) {
    return new Promise((res) => {
      let answered = false;
      modal({
        title, body: `<p>${esc(text)}</p>`, width: 460,
        buttons: [
          { label: 'Annuler', onClick: () => { answered = true; res(false); } },
          { label: okLabel, primary: !danger, danger, onClick: () => { answered = true; res(true); } }
        ],
        onClose: () => { if (!answered) res(false); }
      });
    });
  }

  function promptBox(title, label, value = '', placeholder = '', type = 'text') {
    return new Promise((res) => {
      let answered = false;
      const m = modal({
        title, width: 480,
        body: `<div class="field"><label>${esc(label)}</label><input type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
        buttons: [
          { label: 'Annuler', onClick: () => { answered = true; res(null); } },
          { label: 'OK', primary: true, onClick: () => { answered = true; res(input.value.trim()); } }
        ],
        onClose: () => { if (!answered) res(null); }
      });
      const input = m.body.querySelector('input');
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { answered = true; res(input.value.trim()); m.close(); } });
    });
  }

  const menu = $('#ctx-menu');
  function showMenu(x, y, entries) {
    menu.innerHTML = '';
    for (const en of entries) {
      if (!en) continue;
      if (en === '-') { menu.appendChild(el('div', 'sep')); continue; }
      if (en.title) { menu.appendChild(el('div', 'menu-title', esc(en.title))); continue; }
      if (en.node) { menu.appendChild(en.node); continue; }
      const b = el('button', (en.danger ? 'danger ' : '') + (en.checked ? 'checked' : ''), `${en.icon ? icon(en.icon) : '<span style="width:15px"></span>'}<span>${esc(en.label)}</span>`);
      b.disabled = !!en.disabled;
      b.onclick = () => { hideMenu(); snd('click'); en.onClick && en.onClick(); };
      b.onmouseenter = () => snd('hover');
      menu.appendChild(b);
    }
    menu.classList.remove('hidden');
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }
  function hideMenu() { menu.classList.add('hidden'); }
  document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) hideMenu(); });
  window.addEventListener('blur', hideMenu);

  // ================================================================ Actions sur les fonds
  async function toggleFavorite(it) {
    snd(it.favorite ? 'toggleOff' : 'toggleOn');
    await ow.updateItem(it.id, { favorite: !it.favorite });
  }

  async function togglePlaylist(it) {
    const items = plItems().slice();
    const i = items.indexOf(it.id);
    if (i >= 0) items.splice(i, 1); else items.push(it.id);
    snd(i >= 0 ? 'toggleOff' : 'toggleOn');
    // Mise à jour locale immédiate : des clics rapides ne doivent rien perdre.
    settings().playlist.items = items;
    renderGrid();
    renderDetails(false);
    await ow.setSettings({ playlist: { items } });
  }

  async function removeWithConfirm(it) {
    const ok = await confirmBox(
      it.builtin ? 'Se désabonner' : 'Supprimer le fond d’écran',
      it.builtin
        ? `« ${it.title} » sera retiré de vos fonds installés. Vous pourrez le retrouver dans l'onglet Découvrir.`
        : `« ${it.title} » sera retiré de la bibliothèque.${it.file && settings().general.copyImports ? ' La copie importée sera supprimée (pas le fichier original).' : ' Le fichier original n’est pas supprimé.'}`,
      it.builtin ? 'Se désabonner' : 'Supprimer'
    );
    if (!ok) return;
    snd('remove');
    if (ui.selected === it.id) ui.selected = null;
    await ow.removeItem(it.id);
  }

  async function duplicate(it) {
    const id = await ow.duplicateItem(it.id);
    if (id) { snd('success'); toast('Préréglage créé.', 'success'); select(id, false); }
  }

  async function rename(it) {
    const name = await promptBox('Renommer', 'Nom du fond d’écran', it.title);
    if (name) await ow.updateItem(it.id, { title: name });
  }

  async function addTag(it) {
    const tag = await promptBox('Ajouter une étiquette', 'Étiquette', '', 'ex. Nature, Anime, Jeux…');
    if (tag && !(it.tags || []).includes(tag)) await ow.updateItem(it.id, { tags: [...(it.tags || []), tag] });
  }

  function tileMenu(it, x, y) {
    const ds = state.displays;
    const perDisplay = settings().display.mode === 'per-display' && ds.length > 1;
    showMenu(x, y, [
      { label: 'Appliquer', icon: 'check', onClick: () => select(it.id, true) },
      perDisplay ? { label: 'Appliquer sur tous les écrans', icon: 'monitors', onClick: () => { snd('apply'); ow.apply(it.id, 'all'); } } : null,
      ...(perDisplay ? ds.map((d) => ({ label: `Appliquer sur l'écran ${d.index}`, icon: 'monitor', onClick: () => { snd('apply'); ow.apply(it.id, d.id); } })) : []),
      '-',
      { label: it.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: it.favorite ? 'starFill' : 'star', onClick: () => toggleFavorite(it) },
      { label: plItems().includes(it.id) ? 'Retirer de la playlist' : 'Ajouter à la playlist', icon: 'playlist', onClick: () => togglePlaylist(it) },
      { label: 'Renommer…', icon: 'sliders', onClick: () => rename(it) },
      { label: 'Ajouter une étiquette…', icon: 'plus', onClick: () => addTag(it) },
      { label: 'Dupliquer comme préréglage', icon: 'copy', onClick: () => duplicate(it) },
      it.file ? { label: 'Afficher dans l’explorateur', icon: 'folder', onClick: () => ow.showInFolder(it.id) } : null,
      '-',
      { label: it.builtin ? 'Se désabonner' : 'Supprimer', icon: 'trash', danger: true, onClick: () => removeWithConfirm(it) }
    ]);
  }

  // ================================================================ Import
  async function afterImport(ids) {
    if (!ids || !ids.length) return;
    snd('success');
    toast(`${ids.length} fond${ids.length > 1 ? 's' : ''} d'écran importé${ids.length > 1 ? 's' : ''}.`, 'success');
    switchTab('installed');
    state = await ow.getState();
    renderAll();
    select(ids[0], true);
  }

  async function importDialog(kind) {
    snd('click');
    try { afterImport(await ow.openFiles(kind)); } catch (e) { snd('error'); toast(e.message, 'error'); }
  }

  async function addUrl() {
    const m = modal({
      title: 'Ouvrir depuis une URL', width: 520,
      body: `<div class="field"><label>Adresse de la page web</label><input type="url" id="url-in" placeholder="https://…"></div>
             <div class="field"><label>Nom (facultatif)</label><input type="text" id="url-name" placeholder="Mon fond web"></div>
             <div class="hint">Astuce : un lien direct vers une vidéo (.mp4) en ligne fonctionne aussi, ainsi que les animations WebGL, horloges, tableaux de bord…</div>`,
      buttons: [
        { label: 'Annuler' },
        {
          label: 'Ajouter', primary: true, onClick: async () => {
            try {
              const id = await ow.addWeb({ url: m.body.querySelector('#url-in').value, title: m.body.querySelector('#url-name').value.trim() });
              afterImport([id]);
            } catch (e) {
              snd('error');
              toast(String(e.message || e).replace(/^.*Error: /, ''), 'error');
              return false;
            }
          }
        }
      ]
    });
    m.body.querySelector('#url-in').focus();
  }

  async function createScene() {
    const opts = Object.entries(Schemas.SCENES).map(([k, s]) => `<option value="${k}">${esc(s.title)}</option>`).join('');
    const m = modal({
      title: 'Nouvelle scène personnalisée', width: 500,
      body: `<div class="field"><label>Scène de départ</label><select id="sc-base" style="width:100%">${opts}</select></div>
             <div class="field"><label>Nom</label><input type="text" id="sc-name" placeholder="Ma scène"></div>
             <div class="hint">Un nouveau préréglage est créé : réglez ensuite ses couleurs, vitesses, effets… dans le panneau de droite.</div>`,
      buttons: [
        { label: 'Annuler' },
        {
          label: 'Créer', primary: true, onClick: async () => {
            const id = await ow.addScene(m.body.querySelector('#sc-base').value, m.body.querySelector('#sc-name').value.trim());
            afterImport([id]);
          }
        }
      ]
    });
  }

  // Glisser-déposer
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (dragDepth++ === 0) { $('#drop-overlay').classList.remove('hidden'); $('#create-drop').classList.add('over'); }
  });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.add('hidden'); $('#create-drop').classList.remove('over'); }
  });
  document.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').classList.add('hidden');
    $('#create-drop').classList.remove('over');
    const paths = [...e.dataTransfer.files].map((f) => ow.pathForFile(f)).filter(Boolean);
    snd('drop');
    const ids = await ow.importPaths(paths);
    if (!ids.length) { snd('error'); toast('Aucun fichier pris en charge (vidéo, image, GIF ou HTML).', 'error'); return; }
    afterImport(ids);
  });

  // ================================================================ Import depuis un site
  const DEFAULT_SITE = 'https://motionbgs.com/tag:anime/';
  const STATUS_LABEL = { waiting: 'En attente', working: 'Recherche…', downloading: '', done: 'Ajouté ✓', error: 'Échec', cancelled: 'Annulé' };
  let siteModal = null; // { render(job) } quand la vue de progression est ouverte
  const toastedJobs = new Set();

  function tagFromUrl(u) {
    try {
      const m = /tag[:/=]([^/?#&]+)/i.exec(decodeURIComponent(new URL(u).pathname + new URL(u).search));
      if (m) return m[1].replace(/[-_+]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    } catch { /* ignore */ }
    return '';
  }

  function siteProgressView(body, job) {
    const done = job.items.filter((i) => i.status === 'done').length;
    const errs = job.items.filter((i) => i.status === 'error').length;
    body.innerHTML = `
      <div class="site-bar">${job.finished ? icon('check') : icon('download')}
        <span>${job.finished ? 'Terminé' : 'Téléchargement en cours…'} — ${done} / ${job.items.length} ajoutée${done > 1 ? 's' : ''}${errs ? `, ${errs} en échec` : ''}</span></div>
      <div class="dl-list">${job.items.map((it) => `
        <div class="dl-item ${it.status}">
          <span class="t" title="${esc(it.error || it.title)}">${esc(it.title)}</span>
          <span class="bar"><i style="width:${Math.round((it.status === 'done' ? 1 : it.progress || 0) * 100)}%"></i></span>
          <span class="s">${it.status === 'downloading' ? Math.round((it.progress || 0) * 100) + ' %' : esc(STATUS_LABEL[it.status] || '')}</span>
        </div>`).join('')}</div>
      <div class="dl-summary">${job.finished ? 'Les vidéos ajoutées sont dans l’onglet Installés.' : 'Vous pouvez fermer cette fenêtre : le téléchargement continue en arrière-plan.'}</div>`;
  }

  function openSiteProgress(job) {
    const m = modal({
      title: 'Téléchargement des fonds d’écran', width: 720,
      buttons: [
        { label: 'Arrêter', danger: true, onClick: () => { snd('remove'); ow.siteCancel(); return false; } },
        { label: 'Fermer', primary: true }
      ],
      onClose: () => { siteModal = null; }
    });
    const stopBtn = m.el.querySelector('.modal-foot .btn.danger');
    const render = (j) => { siteProgressView(m.body, j); if (stopBtn) stopBtn.classList.toggle('hidden', !!j.finished); };
    siteModal = { render };
    render(job);
  }

  ow.onSiteJob && ow.onSiteJob((job) => {
    if (siteModal) siteModal.render(job);
    if (job.finished && !toastedJobs.has(job.id)) {
      toastedJobs.add(job.id);
      const ok = job.items.filter((i) => i.status === 'done').length;
      if (ok) { snd('success'); toast(`${ok} vidéo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''} à la bibliothèque.`, 'success'); }
      else if (!job.cancelled) { snd('error'); toast('Aucune vidéo n’a pu être téléchargée.', 'error'); }
    }
  });

  async function openSiteImport() {
    const running = ow.siteJob && (await ow.siteJob());
    if (running && !running.finished) { openSiteProgress(running); return; }
    const body = el('div', 'site-form');
    body.innerHTML = `
      <div class="field"><label>Adresse de la page</label><input type="url" id="si-url" value="${esc(DEFAULT_SITE)}" placeholder="https://…"></div>
      <div class="row3">
        <div class="field"><label>Qualité</label><select id="si-q">
          <option value="hd">HD 1080p (recommandé)</option><option value="4k">4K (fichiers lourds)</option><option value="small">Légère 720p</option></select></div>
        <div class="field"><label>Pages à parcourir</label><select id="si-pages">${[1, 2, 3, 5, 10].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></div>
        <div class="field"><label>Étiquette</label><input type="text" id="si-tag" placeholder="ex. Anime"></div>
      </div>
      <div class="hint">OpenWall lit la page, trouve chaque fond vidéo qu'elle liste et télécharge la version choisie sur votre PC. Vous choisirez ensuite lesquelles garder.</div>
      <div class="site-status" id="si-status"></div>`;
    const tagIn = body.querySelector('#si-tag'), urlIn = body.querySelector('#si-url');
    tagIn.value = tagFromUrl(urlIn.value);
    urlIn.addEventListener('input', () => { tagIn.value = tagFromUrl(urlIn.value) || tagIn.value; });
    let busy = false;
    const m = modal({
      title: 'Télécharger depuis un site', body, width: 680,
      buttons: [
        { label: 'Annuler' },
        {
          label: 'Analyser la page', primary: true, onClick: async () => {
            if (busy) return false;
            busy = true;
            const status = body.querySelector('#si-status');
            status.textContent = 'Analyse de la page…';
            const off = (p) => { status.textContent = `Analyse de la page ${p.page}… (${p.found} trouvée${p.found > 1 ? 's' : ''})`; };
            scanListener = off;
            try {
              const entries = await ow.siteScan(urlIn.value, +body.querySelector('#si-pages').value);
              scanListener = null;
              busy = false;
              if (!entries.length) { snd('error'); status.textContent = 'Aucune vidéo trouvée sur cette page.'; return false; }
              snd('success');
              m.close();
              openSitePicker(entries, { quality: body.querySelector('#si-q').value, tag: tagIn.value.trim() });
            } catch (e) {
              scanListener = null;
              busy = false;
              snd('error');
              status.textContent = 'Erreur : ' + String(e.message || e).replace(/^.*Error: /, '');
            }
            return false;
          }
        }
      ]
    });
    urlIn.focus();
  }

  let scanListener = null;
  ow.onSiteScan && ow.onSiteScan((p) => scanListener && scanListener(p));

  function openSitePicker(entries, opts) {
    const sel = new Set(entries.map((e, i) => (e.already ? -1 : i)).filter((i) => i >= 0));
    const body = el('div');
    const render = () => {
      body.innerHTML = `
        <div class="site-bar"><span>${entries.length} vidéo${entries.length > 1 ? 's' : ''} trouvée${entries.length > 1 ? 's' : ''} — ${sel.size} sélectionnée${sel.size > 1 ? 's' : ''}</span>
          <div class="spacer"></div>
          <button class="btn small" data-all>Tout</button><button class="btn small" data-none>Aucune</button></div>
        <div class="site-grid">${entries.map((e, i) => `
          <div class="site-card ${sel.has(i) ? 'on' : ''}" data-i="${i}" title="${esc(e.title)}">
            <div class="sc-img" ${e.thumb ? `style="background-image:url('${esc(e.thumb).replace(/'/g, '%27')}')"` : ''}>${e.thumb ? '' : icon('film')}</div>
            <div class="sc-t">${esc(e.title)}</div>
            ${e.already ? '<span class="sc-badge t-badge on-desk">Déjà ajoutée</span>' : ''}
            <span class="sc-check">${icon('check')}</span>
          </div>`).join('')}</div>`;
      body.querySelector('[data-all]').onclick = () => { entries.forEach((_, i) => sel.add(i)); snd('toggleOn'); render(); };
      body.querySelector('[data-none]').onclick = () => { sel.clear(); snd('toggleOff'); render(); };
      body.querySelectorAll('.site-card').forEach((c) => (c.onclick = () => {
        const i = +c.dataset.i;
        if (sel.has(i)) sel.delete(i); else sel.add(i);
        snd(sel.has(i) ? 'toggleOn' : 'toggleOff');
        c.classList.toggle('on', sel.has(i));
        body.querySelector('.site-bar span').textContent = `${entries.length} vidéo${entries.length > 1 ? 's' : ''} trouvée${entries.length > 1 ? 's' : ''} — ${sel.size} sélectionnée${sel.size > 1 ? 's' : ''}`;
      }));
    };
    render();
    modal({
      title: 'Choisir les fonds à télécharger', body, width: 900,
      buttons: [
        { label: 'Annuler' },
        {
          label: 'Télécharger', primary: true, onClick: async () => {
            const chosen = [...sel].sort((a, b) => a - b).map((i) => entries[i]);
            if (!chosen.length) { snd('error'); toast('Sélectionnez au moins une vidéo.', 'error'); return false; }
            try {
              await ow.siteDownload(chosen, opts);
              snd('apply');
              const job = await ow.siteJob();
              setTimeout(() => openSiteProgress(job), 0);
            } catch (e) {
              snd('error');
              toast(String(e.message || e).replace(/^.*Error: /, ''), 'error');
              return false;
            }
          }
        }
      ]
    });
  }

  // ================================================================ Onglets
  function switchTab(tab) {
    if (ui.tab === tab) return;
    ui.tab = tab;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
    postPreview('playback', tab === 'installed' ? 'run' : 'pause');
    if (tab === 'discover') { renderDiscover(true); ensureCatalog(false); }
  }

  // ================================================================ Sélecteur d'écran
  function openDisplayMenu() {
    const s = settings();
    const ds = state.displays;
    const r = $('#btn-display').getBoundingClientRect();
    const map = el('div', 'display-map');
    if (ds.length) {
      const minX = Math.min(...ds.map((d) => d.bounds.x)), minY = Math.min(...ds.map((d) => d.bounds.y));
      const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width)), maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height));
      const k = Math.min(260 / (maxX - minX), 120 / (maxY - minY));
      map.style.width = (maxX - minX) * k + 'px';
      map.style.height = (maxY - minY) * k + 'px';
      for (const d of ds) {
        const it = getItem(assignedFor(d.id));
        const b = el('div', 'dm' + (s.display.mode !== 'per-display' || d.id === ui.target ? ' on' : ''),
          `${it && it.thumbUrl ? `<img src="${esc(it.thumbUrl)}">` : ''}<span>${d.index}</span>`);
        b.style.cssText += `left:${(d.bounds.x - minX) * k}px;top:${(d.bounds.y - minY) * k}px;width:${d.bounds.width * k - 4}px;height:${d.bounds.height * k - 4}px`;
        b.title = `Écran ${d.index} — ${d.width}×${d.height}${d.primary ? ' (principal)' : ''}`;
        b.onclick = () => { ui.target = d.id; snd('select'); hideMenu(); renderAll(); };
        map.appendChild(b);
      }
    }
    const modeEntries = [['per-display', 'Un fond différent par écran'], ['clone', 'Cloner sur tous les écrans'], ['span', 'Étendre sur tous les écrans']]
      .map(([k, l]) => ({ label: l, icon: k === 'span' ? 'monitors' : 'monitor', checked: s.display.mode === k, onClick: () => ow.setSettings({ display: { mode: k } }) }));
    showMenu(r.left, r.bottom + 6, [
      { title: 'Écrans' },
      { node: map },
      ...(s.display.mode === 'per-display' ? ds.map((d) => ({
        label: `Écran ${d.index} — ${d.width}×${d.height}${d.primary ? ' (principal)' : ''}`, checked: d.id === ui.target,
        onClick: () => { ui.target = d.id; renderAll(); }
      })) : []),
      '-',
      { title: 'Disposition' },
      ...modeEntries,
      '-',
      { label: 'Retirer le fond d’écran', icon: 'x', onClick: () => { snd('remove'); ow.clearWallpaper(applyTarget()); } }
    ]);
    // la carte des écrans ne doit pas fermer le menu
    map.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  // ================================================================ Playlist
  function openPlaylistConfig() {
    const pl = clone(settings().playlist);
    const body = el('div');
    const render = () => {
      const items = pl.items.map((id) => getItem(id)).filter(Boolean);
      body.innerHTML = `
        <div class="set-row"><div class="set-label">Changer de fond d'écran<small>Comment la playlist passe au fond suivant</small></div>
          <select id="pl-mode">
            <option value="timer">Avec un minuteur</option>
            <option value="startup">À chaque démarrage</option>
            <option value="timeofday">Selon l'heure de la journée</option>
            <option value="weekday">Selon le jour de la semaine</option>
          </select></div>
        <div class="set-row ${pl.mode === 'timer' ? '' : 'hidden'}"><div class="set-label">Intervalle</div>
          <div class="slider-box"><input type="range" id="pl-int" min="1" max="240" step="1" value="${pl.interval}"><span class="val" id="pl-int-v"></span></div></div>
        <div class="set-row"><div class="set-label">Ordre</div>
          <select id="pl-order"><option value="sequential">Dans l'ordre</option><option value="random">Aléatoire</option></select></div>
        <div class="set-row"><div class="set-label">Transition en fondu</div>
          <label class="switch"><input type="checkbox" id="pl-trans" ${pl.transition ? 'checked' : ''}><span></span></label></div>
        <div class="set-row ${pl.transition ? '' : 'hidden'}"><div class="set-label">Durée de la transition</div>
          <div class="slider-box"><input type="range" id="pl-tdur" min="200" max="5000" step="100" value="${pl.transitionDuration}"><span class="val" id="pl-tdur-v"></span></div></div>
        <div class="set-row"><div class="set-label">Écran</div>
          <select id="pl-target"><option value="all">Tous les écrans</option>${state.displays.map((d) => `<option value="${d.id}">Écran ${d.index}</option>`).join('')}</select></div>
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin:16px 0 8px">Fonds de la playlist (${items.length})</h3>
        <div class="pl-list">${items.length ? items.map((it, i) => `
          <div class="pl-item ${i === pl.index && pl.active ? 'current' : ''}" data-i="${i}">
            <span class="n">${i + 1}</span>
            ${it.thumbUrl ? `<img src="${esc(it.thumbUrl)}">` : '<div class="ph"></div>'}
            <span class="t">${esc(it.title)}</span>
            <button class="icon-btn small" data-act="up" title="Monter">${icon('up')}</button>
            <button class="icon-btn small" data-act="down" title="Descendre">${icon('down')}</button>
            <button class="icon-btn small danger" data-act="del" title="Retirer">${icon('x')}</button>
          </div>`).join('') : '<div class="pl-empty">Aucun fond. Utilisez « Ajouter des fonds » puis cliquez sur les vignettes.</div>'}</div>`;
      body.querySelector('#pl-mode').value = pl.mode;
      body.querySelector('#pl-order').value = pl.order;
      body.querySelector('#pl-target').value = pl.target || 'all';
      const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`);
      const intv = body.querySelector('#pl-int'), tdur = body.querySelector('#pl-tdur');
      const sync = () => {
        body.querySelector('#pl-int-v').textContent = fmtMin(+intv.value);
        body.querySelector('#pl-tdur-v').textContent = (tdur.value / 1000).toFixed(1) + ' s';
        intv.style.setProperty('--fill', ((intv.value - 1) / 239) * 100 + '%');
        tdur.style.setProperty('--fill', ((tdur.value - 200) / 4800) * 100 + '%');
      };
      sync();
      intv.oninput = () => { pl.interval = +intv.value; sync(); snd('tick', (intv.value - 1) / 239); };
      tdur.oninput = () => { pl.transitionDuration = +tdur.value; sync(); snd('tick', (tdur.value - 200) / 4800); };
      body.querySelector('#pl-mode').onchange = (e) => { pl.mode = e.target.value; snd('click'); render(); };
      body.querySelector('#pl-order').onchange = (e) => { pl.order = e.target.value; snd('click'); };
      body.querySelector('#pl-target').onchange = (e) => { pl.target = e.target.value; snd('click'); };
      body.querySelector('#pl-trans').onchange = (e) => { pl.transition = e.target.checked; snd(e.target.checked ? 'toggleOn' : 'toggleOff'); render(); };
      body.querySelectorAll('.pl-item button').forEach((b) => {
        b.onclick = () => {
          const i = +b.closest('.pl-item').dataset.i;
          const ids = pl.items.filter((id) => getItem(id));
          if (b.dataset.act === 'del') ids.splice(i, 1);
          else {
            const j = b.dataset.act === 'up' ? i - 1 : i + 1;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
          }
          pl.items = ids;
          snd('click');
          render();
        };
      });
    };
    render();
    modal({
      title: 'Configurer la playlist', body, width: 640,
      buttons: [
        { label: 'Annuler' },
        { label: 'Enregistrer', primary: true, onClick: () => ow.setSettings({ playlist: pl }) }
      ]
    });
  }

  async function savePlaylist() {
    if (!plItems().length) { snd('error'); toast('La playlist est vide.', 'error'); return; }
    const name = await promptBox('Sauvegarder la playlist', 'Nom de la playlist', '', 'ex. Soirée, Travail, Hiver…');
    if (!name) return;
    const pl = settings().playlist;
    const playlists = { ...settings().playlists, [name]: { items: pl.items, mode: pl.mode, interval: pl.interval, order: pl.order, transition: pl.transition, transitionDuration: pl.transitionDuration, target: pl.target } };
    await ow.setSettings({ playlists });
    snd('success');
    toast(`Playlist « ${name} » sauvegardée.`, 'success');
  }

  function loadPlaylistMenu() {
    const names = Object.keys(settings().playlists || {});
    const r = $('#pl-load').getBoundingClientRect();
    showMenu(r.left, r.top - 8 - Math.min(300, 40 + names.length * 34), [
      { title: 'Playlists sauvegardées' },
      ...(names.length ? names.map((n) => {
        const row = el('div');
        row.style.cssText = 'display:flex;align-items:center';
        const b = el('button', '', `${icon('playlist')}<span>${esc(n)} <small style="opacity:.6">(${settings().playlists[n].items.length})</small></span>`);
        b.onclick = async () => {
          hideMenu();
          snd('success');
          await ow.setSettings({ playlist: { ...settings().playlists[n], index: 0, active: true } });
          toast(`Playlist « ${n} » chargée.`, 'success');
        };
        const del = el('button', 'danger', icon('trash'));
        del.style.width = '36px';
        del.title = 'Supprimer cette playlist';
        del.onclick = async () => {
          hideMenu();
          const p = { ...settings().playlists };
          delete p[n];
          snd('remove');
          await ow.setSettings({ playlists: p });
        };
        row.append(b, del);
        return { node: row };
      }) : [{ label: 'Aucune playlist sauvegardée', disabled: true }])
    ]);
  }

  // ================================================================ Paramètres
  function openSettings(initialTab = 'performance') {
    const body = el('div', 'settings');
    const nav = el('div', 'settings-nav');
    const pane = el('div', 'settings-pane');
    body.append(nav, pane);
    const TABS = [['performance', 'Performances', 'sliders'], ['audio', 'Audio', 'volume'], ['general', 'Général', 'gear'], ['interface', 'Interface', 'layers'], ['about', 'À propos', 'info']];
    let tab = initialTab;

    const set = (patch) => ow.setSettings(patch);
    const row = (label, sub, control) => {
      const r = el('div', 'set-row', `<div class="set-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
      r.appendChild(control);
      return r;
    };
    const selectCtl = (options, value, onChange) => {
      const s = el('select', '', options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join(''));
      s.onchange = () => { snd('click'); onChange(s.value); };
      return s;
    };
    const switchCtl = (value, onChange) => {
      const l = el('label', 'switch', `<input type="checkbox" ${value ? 'checked' : ''}><span></span>`);
      const c = l.querySelector('input');
      c.onchange = () => { snd(c.checked ? 'toggleOn' : 'toggleOff'); onChange(c.checked); };
      return l;
    };
    const sliderCtl = (min, max, step, value, fmt, onChange) => {
      const box = el('div', 'slider-box', `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><span class="val"></span>`);
      const r = box.querySelector('input'), v = box.querySelector('.val');
      const sync = () => { v.textContent = fmt(+r.value); r.style.setProperty('--fill', ((r.value - min) / (max - min)) * 100 + '%'); };
      sync();
      r.oninput = () => { sync(); snd('tick', (r.value - min) / (max - min)); };
      r.onchange = () => onChange(+r.value);
      return box;
    };
    const h3 = (t) => el('h3', '', esc(t));

    const PANES = {
      performance() {
        const p = settings().performance;
        const presets = el('div', 'presets');
        [['Économie', 20, 'low'], ['Équilibré', 30, 'high'], ['Qualité', 60, 'high'], ['Ultra', 144, 'high']].forEach(([l, fps, q]) => {
          const b = el('button', 'btn small' + (p.fps === fps && p.quality === q ? ' active' : ''), esc(l));
          b.onclick = async () => { snd('select'); await set({ performance: { fps, quality: q } }); draw(); };
          presets.appendChild(b);
        });
        pane.append(
          h3('Qualité'),
          row('Préréglage', 'Applique rapidement un niveau de performance', presets),
          row('Images par seconde (FPS)', 'Limite pour les scènes animées. Moins = moins de processeur/carte graphique', sliderCtl(10, 240, 1, p.fps, (v) => v + ' FPS', (v) => set({ performance: { fps: v } }))),
          row('Qualité de rendu', 'Résolution interne des scènes', selectCtl([['low', 'Basse (50 %)'], ['medium', 'Moyenne (75 %)'], ['high', 'Haute (100 %)']], p.quality, (v) => set({ performance: { quality: v } }))),
          h3('Lecture'),
          row('Autre application au premier plan', '', selectCtl(ACTIONS, p.otherFocused, (v) => set({ performance: { otherFocused: v } }))),
          row('Autre application maximisée', '', selectCtl(ACTIONS, p.otherMaximized, (v) => set({ performance: { otherMaximized: v } }))),
          row('Autre application en plein écran', 'Jeux, films, présentations…', selectCtl(ACTIONS, p.otherFullscreen, (v) => set({ performance: { otherFullscreen: v } }))),
          row('Ordinateur sur batterie', '', selectCtl(ACTIONS, p.onBattery, (v) => set({ performance: { onBattery: v } }))),
          row('Session verrouillée', '', selectCtl(ACTIONS, p.onLock, (v) => set({ performance: { onLock: v } })))
        );
        if (state.platform !== 'win32') {
          pane.appendChild(el('div', 'note', `${icon('info')}<span>Les règles « premier plan / maximisée / plein écran » ne sont disponibles que sous Windows.</span>`));
        }
      },
      audio() {
        const a = settings().audio;
        pane.append(
          h3('Son des fonds d’écran'),
          row('Volume principal', 'Multiplie le volume de chaque fond vidéo', sliderCtl(0, 100, 1, a.masterVolume, (v) => v + ' %', (v) => set({ audio: { masterVolume: v } }))),
          row('Couper tous les sons', '', switchCtl(a.muteAll, (v) => set({ audio: { muteAll: v } }))),
          h3('Visualiseurs audio'),
          row('Capturer le son du système', 'Permet aux fonds réactifs au son d’écouter ce que joue votre PC (Windows)', switchCtl(a.capture, (v) => set({ audio: { capture: v } })))
        );
      },
      general() {
        const g = settings().general;
        const dataBtn = el('button', 'btn small', `${icon('folder')}Ouvrir`);
        dataBtn.onclick = () => { snd('click'); ow.openData(); };
        pane.append(
          h3('Démarrage'),
          row(state.platform === 'darwin' ? 'Lancer à l’ouverture de session' : 'Lancer au démarrage de Windows', 'Vos fonds d’écran reviennent automatiquement', switchCtl(g.startWithOS, (v) => set({ general: { startWithOS: v } }))),
          row('Démarrer réduit', 'Ne pas ouvrir cette fenêtre au lancement', switchCtl(g.startMinimized, (v) => set({ general: { startMinimized: v } }))),
          h3('Zone de notification'),
          row('Afficher l’icône de notification', '', switchCtl(g.showTray, (v) => set({ general: { showTray: v } }))),
          row('Fermer = réduire dans la zone de notification', 'Les fonds continuent de tourner après la fermeture de cette fenêtre', switchCtl(g.closeToTray, (v) => set({ general: { closeToTray: v } }))),
          h3('Bibliothèque'),
          row('Copier les fichiers importés', 'Copie vos vidéos/images dans le dossier d’OpenWall (vous pourrez déplacer les originaux)', switchCtl(g.copyImports, (v) => set({ general: { copyImports: v } }))),
          row('Dossier de données', 'Bibliothèque, miniatures et fichiers importés', dataBtn)
        );
      },
      interface() {
        const u = settings().ui;
        const sw = el('div', 'swatches');
        ACCENTS.forEach((c) => {
          const s = el('div', 'swatch' + (u.accent === c ? ' on' : ''));
          s.style.background = c;
          s.onclick = async () => { snd('select'); await set({ ui: { accent: c } }); draw(); };
          sw.appendChild(s);
        });
        const custom = el('label', 'color-btn', `<i style="background:${esc(u.accent)}"></i><input type="color" value="${esc(u.accent)}">`);
        custom.style.width = '34px';
        custom.querySelector('input').onchange = async (e) => { await set({ ui: { accent: e.target.value } }); draw(); };
        sw.appendChild(custom);
        pane.append(
          h3('Apparence'),
          row('Thème', '', selectCtl([['dark', 'Sombre'], ['light', 'Clair']], u.theme, (v) => set({ ui: { theme: v } }))),
          row('Couleur d’accent', '', sw),
          row('Taille des vignettes', '', selectCtl([['small', 'Petite'], ['medium', 'Moyenne'], ['large', 'Grande']], u.gridSize, (v) => set({ ui: { gridSize: v } }))),
          row('Aperçu vidéo au survol', 'Lit la vidéo dans la vignette quand la souris passe dessus', switchCtl(u.previewOnHover, (v) => set({ ui: { previewOnHover: v } }))),
          h3('Sons'),
          row('Sons de l’interface', 'Clics, curseurs, transitions…', switchCtl(u.sounds, (v) => { window.UISound.configure({ enabled: v }); set({ ui: { sounds: v } }); })),
          row('Volume des sons', '', sliderCtl(0, 100, 1, u.soundVolume, (v) => v + ' %', (v) => { window.UISound.configure({ volume: v / 100 }); set({ ui: { soundVolume: v } }); }))
        );
      },
      about() {
        const gh = el('div', 'about', `
          <img src="../assets/icon.png" alt="">
          <h2>OpenWall</h2>
          <p>Version ${esc(state.version)} — gratuit et open source (licence MIT)</p>
          <p>Fonds d'écran animés : vidéos MP4/WebM, images, GIF, pages web,<br>scènes interactives, visualiseurs audio, playlists, multi-écrans.</p>
          <h3>Raccourcis</h3>
          <p><span class="kbd">Ctrl</span> + <span class="kbd">O</span> importer · <span class="kbd">Ctrl</span> + <span class="kbd">F</span> rechercher ·
             <span class="kbd">F2</span> renommer · <span class="kbd">Suppr</span> supprimer · <span class="kbd">Espace</span> pause<br>
             Double-clic sur un curseur : valeur par défaut</p>`);
        pane.appendChild(gh);
      }
    };

    const draw = () => {
      nav.innerHTML = '';
      TABS.forEach(([k, l, ic]) => {
        const b = el('button', k === tab ? 'active' : '', `${icon(ic)}<span>${esc(l)}</span>`);
        b.onclick = () => { tab = k; snd('tab'); draw(); };
        nav.appendChild(b);
      });
      pane.innerHTML = '';
      PANES[tab]();
    };
    draw();
    modal({ title: 'Paramètres', body, width: 820, buttons: [{ label: 'Fermer', primary: true }] }).body.style.padding = '0';
  }

  // ================================================================ Évènements
  hydrateIcons();

  $$('.tb-win button').forEach((b) => b.addEventListener('click', () => { snd('click'); ow.win(b.dataset.win); }));
  ow.onMaximized((m) => {
    $('[data-win="max"]').innerHTML = m
      ? '<svg viewBox="0 0 10 10"><rect x="1.5" y="3" width="5.5" height="5.5"/><path d="M3 3V1.5h5.5V7H7"/></svg>'
      : '<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" /></svg>';
  });
  ow.onNavigate((p) => { if (p === 'settings') openSettings(); });

  $$('.tabs button').forEach((b) => {
    b.addEventListener('click', () => { snd('tab'); switchTab(b.dataset.tab); });
    b.addEventListener('mouseenter', () => snd('hover'));
  });
  $('#btn-settings').onclick = () => openSettings();
  $('#btn-display').onclick = () => { snd('click'); openDisplayMenu(); };
  $('#btn-pause').onclick = () => { snd(state.rules.manualPause ? 'toggleOn' : 'toggleOff'); ow.togglePause(); };
  $('#btn-mute').onclick = () => { snd('click'); ow.setSettings({ audio: { muteAll: !settings().audio.muteAll } }); };

  // Filtres
  $('#search').addEventListener('input', (e) => { ui.search = e.target.value; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { ui.sort = e.target.value; snd('click'); renderGrid(); });
  $('#sort-dir').addEventListener('click', () => { ui.dir *= -1; snd('click'); renderFilters(); renderGrid(); });
  $$('input[name="show"]').forEach((r) => r.addEventListener('change', () => { ui.show = r.value; snd('click'); renderGrid(); }));
  $('#filters').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.type) { t.checked ? ui.types.add(t.dataset.type) : ui.types.delete(t.dataset.type); snd(t.checked ? 'toggleOn' : 'toggleOff'); renderGrid(); }
    if (t.dataset.res) { t.checked ? ui.res.add(t.dataset.res) : ui.res.delete(t.dataset.res); snd(t.checked ? 'toggleOn' : 'toggleOff'); renderGrid(); }
  });
  $('#tag-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    ui.tag = ui.tag === b.dataset.tag ? null : b.dataset.tag;
    snd('click');
    renderFilters();
    renderGrid();
  });
  const resetFilters = () => {
    ui.search = ''; ui.types.clear(); ui.res.clear(); ui.tag = null; ui.show = 'all';
    $('#search').value = '';
    $$('input[name="show"]').forEach((r) => (r.checked = r.value === 'all'));
    snd('click');
    renderFilters();
    renderGrid();
  };
  $('#reset-filters').onclick = resetFilters;
  $$('#grid-size button').forEach((b) => (b.onclick = () => { snd('click'); ow.setSettings({ ui: { gridSize: b.dataset.size } }); }));

  // Grille
  const grid = $('#grid');
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    const it = getItem(t.dataset.id);
    if (!it) return;
    if (ui.plEdit) togglePlaylist(it); else select(it.id, true);
  });
  grid.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    e.preventDefault();
    const it = getItem(t.dataset.id);
    if (!it) return;
    if (ui.selected !== it.id) select(it.id, false);
    tileMenu(it, e.clientX, e.clientY);
  });
  grid.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.tile');
    if (t === hoverTile) return;
    tileLeave(hoverTile);
    hoverTile = t;
    tileEnter(t);
  });
  grid.addEventListener('mouseleave', () => { tileLeave(hoverTile); hoverTile = null; });
  $('#grid-empty').addEventListener('click', (e) => {
    if (e.target.closest('#empty-reset')) resetFilters();
    if (e.target.closest('#empty-import')) importDialog('video');
    if (e.target.closest('#empty-discover')) { snd('tab'); switchTab('discover'); }
  });

  // Pied de grille
  $('#btn-open').onclick = () => importDialog();
  $('#btn-open-url').onclick = () => { snd('click'); addUrl(); };
  $('#pl-add').onclick = () => { ui.plEdit = !ui.plEdit; snd(ui.plEdit ? 'toggleOn' : 'toggleOff'); renderTopbar(); renderGrid(); };
  $('#pl-done').onclick = () => { ui.plEdit = false; snd('toggleOff'); renderTopbar(); renderGrid(); };
  $('#pl-config').onclick = () => openPlaylistConfig();
  $('#pl-save').onclick = () => { snd('click'); savePlaylist(); };
  $('#pl-load').onclick = () => { snd('click'); loadPlaylistMenu(); };
  $('#pl-toggle').onclick = async () => {
    const pl = settings().playlist;
    if (!pl.active && !plItems().filter(getItem).length) {
      snd('error');
      toast('Ajoutez d’abord des fonds à la playlist (« Ajouter des fonds »).', 'error');
      return;
    }
    snd(pl.active ? 'toggleOff' : 'apply');
    await ow.setSettings({ playlist: { active: !pl.active } });
    if (!pl.active) toast('Playlist démarrée.', 'success');
  };
  $$('#grid-footer .btn').forEach((b) => b.addEventListener('mouseenter', () => snd('hover')));

  // Détails
  $('#det-title').addEventListener('change', (e) => {
    const it = getItem(ui.selected);
    const v = e.target.value.trim();
    if (it && v && v !== it.title) { snd('click'); ow.updateItem(it.id, { title: v }); }
  });
  $('#det-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#det-tags').addEventListener('click', (e) => {
    const it = getItem(ui.selected);
    if (!it) return;
    if (e.target.closest('#add-tag')) { snd('click'); addTag(it); return; }
    const b = e.target.closest('[data-tag]');
    if (b) { snd('remove'); ow.updateItem(it.id, { tags: (it.tags || []).filter((t) => t !== b.dataset.tag) }); }
  });
  const withSel = (fn) => () => { const it = getItem(ui.selected); if (it) fn(it); };
  $('#det-fav').onclick = withSel(toggleFavorite);
  $('#det-playlist').onclick = withSel(togglePlaylist);
  $('#det-apply-all').onclick = withSel((it) => { snd('apply'); ow.apply(it.id, 'all'); });
  $('#det-dup').onclick = withSel(duplicate);
  $('#det-folder').onclick = withSel((it) => { snd('click'); ow.showInFolder(it.id); });
  $('#det-reset').onclick = withSel(async (it) => {
    if (!(it.id in ui.snapshot.props)) ui.snapshot.props[it.id] = clone(it.properties || {});
    snd('remove');
    await ow.updateItem(it.id, { properties: {} });
    const fresh = getItem(it.id);
    if (fresh) { renderDetails(true); postPreview('props', { id: it.id, props: Schemas.resolveProps({ ...fresh, properties: {} }) }); }
  });
  $('#det-delete').onclick = withSel(removeWithConfirm);
  $$('.det-actions .icon-btn').forEach((b) => b.addEventListener('mouseenter', () => snd('hover')));

  $('#btn-ok').onclick = () => {
    snd('apply');
    ui.snapshot = { assignments: clone(settings().display.assignments), props: {} };
    setTimeout(() => ow.win('close'), 250);
  };
  $('#btn-cancel').onclick = async () => {
    snd('close');
    await ow.restore(ui.snapshot);
    ui.snapshot = { assignments: clone(settings().display.assignments), props: {} };
    setTimeout(() => ow.win('close'), 150);
  };

  // Découvrir / Créer
  $('#discover-grid').addEventListener('click', (e) => {
    const dl = e.target.closest('[data-dl]');
    const ap = e.target.closest('[data-apply]');
    const retry = e.target.closest('[data-retry]');
    if (dl) discDownload(dl.closest('.dcard'));
    if (ap) {
      const url = ap.closest('.dcard').dataset.url;
      const it = state.items.find((i) => i.sourceUrl === url);
      if (it) { snd('apply'); ow.apply(it.id, applyTarget()); toast(`« ${it.title} » est maintenant votre fond d'écran.`, 'success'); }
    }
    if (retry) {
      snd('click');
      disc.data[retry.dataset.retry] = null;
      ensureCatalog(false);
    }
  });
  $('#discover-grid').addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('film') }));
  }, true);
  $('#disc-sites').addEventListener('click', (e) => {
    const b = e.target.closest('[data-site-filter]');
    if (!b) return;
    disc.site = b.dataset.siteFilter;
    snd('click');
    renderDiscover(true);
  });
  let discSearchTimer = null;
  $('#disc-search').addEventListener('input', (e) => {
    clearTimeout(discSearchTimer);
    discSearchTimer = setTimeout(() => { disc.q = e.target.value; renderDiscover(true); }, 150);
  });
  $('#discover-refresh').onclick = () => { snd('click'); ensureCatalog(true); };
  $('#discover-import').onclick = () => importDialog('video');
  $('#discover-site').onclick = () => { snd('click'); openSiteImport(); };
  $$('.create-card').forEach((c) => {
    c.addEventListener('mouseenter', () => snd('hover'));
    c.addEventListener('click', () => {
      const k = c.dataset.create;
      if (k === 'url') { snd('click'); addUrl(); }
      else if (k === 'scene') { snd('click'); createScene(); }
      else if (k === 'site') { snd('click'); openSiteImport(); }
      else importDialog(k);
    });
  });
  $('#create-drop').addEventListener('click', () => importDialog());

  // Clavier
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
    if (e.key === 'Escape') { hideMenu(); if (ui.plEdit) { ui.plEdit = false; renderTopbar(); renderGrid(); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); switchTab('installed'); $('#search').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); importDialog(); }
    if (typing || $('#modal-root').children.length) return;
    const it = getItem(ui.selected);
    if (e.key === 'Delete' && it) removeWithConfirm(it);
    if (e.key === 'F2' && it) { e.preventDefault(); $('#det-title').focus(); $('#det-title').select(); }
    if (e.key === ' ' && ui.tab === 'installed') { e.preventDefault(); ow.togglePause(); snd('click'); }
    if (e.key === 'Enter' && it) select(it.id, true);
  });

  // ================================================================ Démarrage
  renderAll();
  const cur = getItem(assignedFor(ui.target));
  if (cur) {
    ui.selected = cur.id;
    renderGrid();
    renderDetails(true);
    loadPreview(cur);
    requestAnimationFrame(() => { const t = tileEls.get(cur.id); if (t) t.scrollIntoView({ block: 'nearest' }); });
  }
})();
