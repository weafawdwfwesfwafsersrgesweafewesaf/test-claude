// OpenWall — moteur de fonds d'écran animés gratuit et open source.
// Processus principal Electron : bibliothèque, fenêtres de fond d'écran par écran,
// playlist, règles de lecture, icône de la zone de notification et interface.
const {
  app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu, nativeImage,
  powerMonitor, shell, session, desktopCapturer
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { startServers } = require('./lib/server');
const { JsonStore, deepMerge } = require('./lib/store');
const Schemas = require('./shared/schemas');
const win32 = process.platform === 'win32' ? require('./lib/desktop-win') : null;

// Le calcul d'occultation de Chromium figerait le rendu une fois la fenêtre placée derrière les icônes.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.platform === 'win32') app.setAppUserModelId('app.openwall.desktop');

const VIDEO_EXT = ['.mp4', '.webm', '.m4v', '.mov', '.mkv', '.ogv'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'];
const WEB_EXT = ['.html', '.htm'];
const WALLPAPER_PARTITION = 'persist:openwall-wallpaper';

const DEFAULT_SETTINGS = {
  ui: { theme: 'dark', accent: '#3a8ee6', sounds: true, soundVolume: 60, gridSize: 'medium', previewOnHover: true },
  general: { startWithOS: false, startMinimized: false, closeToTray: true, copyImports: false, showTray: true },
  performance: {
    fps: 60, quality: 'high',
    otherFocused: 'run', otherMaximized: 'run', otherFullscreen: 'pause',
    onBattery: 'run', onLock: 'pause'
  },
  audio: { masterVolume: 100, muteAll: false, capture: true },
  display: { mode: 'per-display', assignments: {} },
  playlist: {
    active: false, items: [], mode: 'timer', interval: 15, order: 'sequential',
    transition: true, transitionDuration: 900, target: 'all', index: 0
  },
  playlists: {}
};

const RANK = { run: 0, mute: 1, pause: 2, stop: 3 };

let DATA, THUMBS, IMPORTS;
let settingsStore, libraryStore;
let servers;
let uiWin = null;
let tray = null;
let quitting = false;
const wallpapers = new Map(); // clé (id d'écran ou "span") -> { win, ready, itemId, pending, bounds, closing }
let playback = 'run';
const rules = { foreground: 'run', locked: false, onBattery: false, manualPause: false };
let stopForegroundWatch = null;
let playlistTimer = null;

// ------------------------------------------------------------------ utilitaires
const S = () => settingsStore.get();
const L = () => libraryStore.get();
const newId = () => crypto.randomBytes(6).toString('hex');
const findItem = (id) => L().items.find((i) => i.id === id);
const thumbPath = (id) => path.join(THUMBS, id + '.jpg');

function typeOfFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (WEB_EXT.includes(ext)) return 'web';
  return null;
}

function urlFor(item) {
  if (!item) return null;
  if (item.type === 'video' || item.type === 'image') return `${servers.appBase}/media/${item.id}?v=${item.mediaVersion || 0}`;
  if (item.type === 'web') {
    if (item.url) return item.url;
    return `${servers.siteBase}/site/${item.id}/${encodeURIComponent(path.basename(item.file))}`;
  }
  return null;
}

function decorate(item) {
  const hasThumb = fs.existsSync(thumbPath(item.id));
  return {
    ...item,
    thumbUrl: hasThumb ? `${servers.appBase}/thumb/${item.id}?v=${item.thumbVersion || 0}` : null,
    mediaUrl: urlFor(item),
    missing: !!item.file && !fs.existsSync(item.file)
  };
}

function displays() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    index: i + 1,
    primary: d.id === primary.id,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor)
  }));
}

function getState() {
  const lib = L();
  const removed = new Set(lib.removedBuiltins || []);
  return {
    version: app.getVersion(),
    platform: process.platform,
    appBase: servers.appBase,
    items: lib.items.map(decorate),
    builtins: Schemas.builtinItems().map((b) => ({ ...b, subscribed: !removed.has(b.id) })),
    settings: S(),
    displays: displays(),
    playback,
    rules: { ...rules }
  };
}

function pushState() {
  if (uiWin && !uiWin.isDestroyed()) uiWin.webContents.send('ow:state', getState());
  updateTray();
}

// ------------------------------------------------------------------ bibliothèque
function seedBuiltins() {
  const lib = L();
  const removed = new Set(lib.removedBuiltins || []);
  for (const b of Schemas.builtinItems()) {
    const existing = lib.items.find((i) => i.id === b.id);
    if (existing) {
      existing.title = existing.customTitle ? existing.title : b.title;
      existing.description = b.description;
    } else if (!removed.has(b.id)) {
      lib.items.push(b);
    }
  }
  libraryStore.save();
}

async function importPaths(paths) {
  const added = [];
  const copy = S().general.copyImports;
  for (const p of paths) {
    const type = typeOfFile(p);
    if (!type || !fs.existsSync(p)) continue;
    // Déjà dans la bibliothèque ? On renvoie l'existant au lieu de créer un doublon.
    const dup = L().items.find((i) => i.file === p || (i.sourceFile && i.sourceFile === p));
    if (dup) { added.push(dup.id); continue; }
    const id = newId();
    let file = p;
    if (copy && type !== 'web') {
      fs.mkdirSync(IMPORTS, { recursive: true });
      file = path.join(IMPORTS, id + path.extname(p).toLowerCase());
      await fs.promises.copyFile(p, file);
    }
    const st = fs.statSync(file);
    const item = {
      id,
      type,
      title: path.basename(p, path.extname(p)),
      file,
      sourceFile: p,
      size: st.size,
      tags: [],
      favorite: false,
      properties: {},
      createdAt: Date.now()
    };
    L().items.push(item);
    added.push(item.id);
    if (type === 'web') captureWebThumb(item);
  }
  libraryStore.save();
  pushState();
  return added;
}

function addWeb({ url, title }) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    throw new Error('Adresse invalide');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Seules les adresses http(s) sont acceptées');
  const item = {
    id: newId(), type: 'web', title: title || u.hostname, url: u.href,
    tags: [], favorite: false, properties: {}, createdAt: Date.now()
  };
  L().items.push(item);
  libraryStore.save();
  captureWebThumb(item);
  pushState();
  return item.id;
}

// Miniature d'une page web : rendu hors écran puis capture.
function captureWebThumb(item) {
  const w = new BrowserWindow({
    show: false, width: 1280, height: 720,
    webPreferences: { offscreen: true, partition: WALLPAPER_PARTITION, sandbox: true }
  });
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const done = async () => {
    try {
      const img = await w.webContents.capturePage();
      if (!img.isEmpty()) {
        fs.mkdirSync(THUMBS, { recursive: true });
        fs.writeFileSync(thumbPath(item.id), img.resize({ width: 480 }).toJPEG(82));
        const it = findItem(item.id);
        if (it) { it.thumbVersion = Date.now(); libraryStore.save(); pushState(); }
      }
    } catch (e) {
      console.warn('Miniature web impossible', e.message);
    }
    if (!w.isDestroyed()) w.destroy();
  };
  w.webContents.once('did-finish-load', () => setTimeout(done, 2500));
  w.webContents.once('did-fail-load', () => !w.isDestroyed() && w.destroy());
  w.loadURL(urlFor(item)).catch(() => {});
  setTimeout(() => !w.isDestroyed() && w.destroy(), 20000);
}

function saveThumbnail(id, dataUrl) {
  const item = findItem(id);
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!item || !m) return false;
  fs.mkdirSync(THUMBS, { recursive: true });
  fs.writeFileSync(thumbPath(id), Buffer.from(m[2], 'base64'));
  item.thumbVersion = Date.now();
  libraryStore.save();
  pushState();
  return true;
}

const EDITABLE = ['title', 'tags', 'favorite', 'properties', 'width', 'height', 'duration', 'rating', 'description'];

function updateItem(id, patch) {
  const item = findItem(id);
  if (!item) return;
  for (const k of EDITABLE) if (k in patch) item[k] = patch[k];
  if ('title' in patch && item.builtin) item.customTitle = true;
  libraryStore.save();
  if ('properties' in patch) sendProps(item);
  pushState();
}

function removeItem(id) {
  const lib = L();
  const item = findItem(id);
  if (!item) return;
  lib.items = lib.items.filter((i) => i.id !== id);
  if (item.builtin) {
    lib.removedBuiltins = Array.from(new Set([...(lib.removedBuiltins || []), id]));
  } else {
    if (item.file && IMPORTS && path.dirname(item.file) === IMPORTS) fs.promises.unlink(item.file).catch(() => {});
    fs.promises.unlink(thumbPath(id)).catch(() => {});
  }
  libraryStore.save();
  const s = S();
  for (const [k, v] of Object.entries(s.display.assignments)) if (v === id) delete s.display.assignments[k];
  s.playlist.items = s.playlist.items.filter((x) => x !== id);
  for (const pl of Object.values(s.playlists)) pl.items = (pl.items || []).filter((x) => x !== id);
  settingsStore.save();
  syncWallpapers();
  pushState();
}

function subscribe(id) {
  const lib = L();
  lib.removedBuiltins = (lib.removedBuiltins || []).filter((x) => x !== id);
  libraryStore.save();
  seedBuiltins();
  pushState();
}

function duplicateItem(id) {
  const item = findItem(id);
  if (!item) return null;
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = newId();
  copy.title = item.title + ' (copie)';
  copy.builtin = false;
  copy.customTitle = true;
  copy.createdAt = Date.now();
  delete copy.thumbVersion;
  L().items.push(copy);
  if (fs.existsSync(thumbPath(id))) {
    fs.copyFileSync(thumbPath(id), thumbPath(copy.id));
    copy.thumbVersion = Date.now();
  }
  libraryStore.save();
  pushState();
  return copy.id;
}

// ------------------------------------------------------------------ fenêtres de fond d'écran
function targets() {
  const ds = displays();
  if (S().display.mode === 'span') {
    const minX = Math.min(...ds.map((d) => d.bounds.x)), minY = Math.min(...ds.map((d) => d.bounds.y));
    const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width)), maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height));
    return [{ key: 'span', bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } }];
  }
  return ds.map((d) => ({ key: d.id, bounds: d.bounds }));
}

function wallpaperIdFor(key) {
  const { mode, assignments } = S().display;
  if (mode === 'per-display') return assignments[key] || assignments.all || null;
  return assignments.all || null;
}

function wpSettings() {
  const s = S();
  return {
    fps: s.performance.fps,
    quality: s.performance.quality,
    masterVolume: s.audio.masterVolume,
    muted: s.audio.muteAll,
    audioCapture: s.audio.capture,
    transition: s.playlist.transition,
    transitionDuration: s.playlist.transitionDuration
  };
}

function loadPayload(item) {
  return { item: { id: item.id, type: item.type, scene: item.scene, title: item.title }, url: urlFor(item), props: Schemas.resolveProps(item), settings: wpSettings() };
}

function send(w, channel, data) {
  if (w.win && !w.win.isDestroyed()) w.win.webContents.send(channel, data);
}

function createWallpaperWindow(t) {
  const b = t.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    title: 'OpenWall Wallpaper',
    ...(process.platform === 'win32' ? {} : { type: 'desktop' }),
    webPreferences: {
      preload: path.join(__dirname, 'wallpaper-preload.js'),
      partition: WALLPAPER_PARTITION,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });
  const w = { win, ready: false, itemId: null, pending: null, bounds: b, closing: false };
  // Sous Windows la fenêtre est placée sous la couche des icônes : les clics vont déjà au bureau.
  if (process.platform !== 'win32') win.setIgnoreMouseEvents(true);
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', async () => {
    win.setBounds(b);
    win.showInactive();
    if (win32) {
      const res = await win32.attachToDesktop(win);
      console.log('[OpenWall] Attache au bureau :', res);
      if (!res.startsWith('ok')) console.warn('[OpenWall] Impossible de placer le fond derrière les icônes :', res);
    }
  });
  win.on('closed', () => {
    if (wallpapers.get(t.key) === w) wallpapers.delete(t.key);
    // Fermeture inattendue (ex. redémarrage de l'Explorateur) : on recrée.
    if (!w.closing && !quitting) setTimeout(syncWallpapers, 3000);
  });
  win.loadURL(`${servers.appBase}/app/wallpaper/index.html`);
  wallpapers.set(t.key, w);
  return w;
}

function destroyWallpaper(key) {
  const w = wallpapers.get(key);
  if (!w) return;
  w.closing = true;
  wallpapers.delete(key);
  if (!w.win.isDestroyed()) w.win.destroy();
}

function destroyAllWallpapers() {
  const had = wallpapers.size > 0;
  for (const key of [...wallpapers.keys()]) destroyWallpaper(key);
  if (had && win32 && !quitting) setTimeout(() => win32.refreshDesktop(), 300);
}

function syncWallpapers(force = false) {
  if (!servers) return;
  if (playback === 'stop') return destroyAllWallpapers();
  const tg = targets();
  let removed = false;
  for (const key of [...wallpapers.keys()]) {
    if (!tg.find((t) => t.key === key)) { destroyWallpaper(key); removed = true; }
  }
  for (const t of tg) {
    const item = findItem(wallpaperIdFor(t.key));
    if (!item) {
      if (wallpapers.has(t.key)) { destroyWallpaper(t.key); removed = true; }
      continue;
    }
    let w = wallpapers.get(t.key);
    if (w && (w.bounds.width !== t.bounds.width || w.bounds.height !== t.bounds.height || w.bounds.x !== t.bounds.x || w.bounds.y !== t.bounds.y)) {
      destroyWallpaper(t.key);
      w = null;
    }
    if (!w) w = createWallpaperWindow(t);
    if (force || w.itemId !== item.id) {
      w.itemId = item.id;
      const payload = loadPayload(item);
      if (w.ready) send(w, 'wp:load', payload);
      else w.pending = payload;
    }
  }
  if (removed && win32) setTimeout(() => win32.refreshDesktop(), 300);
}

function sendProps(item) {
  const props = Schemas.resolveProps(item);
  for (const w of wallpapers.values()) if (w.itemId === item.id) send(w, 'wp:props', { id: item.id, props });
}

function broadcast(channel, data) {
  for (const w of wallpapers.values()) send(w, channel, data);
}

function applyWallpaper(id, target) {
  const s = S();
  const a = s.display.assignments;
  if (!findItem(id)) return;
  if (s.display.mode !== 'per-display' || !target || target === 'all') {
    a.all = id;
    if (s.display.mode === 'per-display') for (const d of displays()) a[d.id] = id;
  } else {
    a[target] = id;
    if (!a.all) a.all = id;
  }
  settingsStore.save();
  syncWallpapers();
  pushState();
}

// ------------------------------------------------------------------ règles de lecture
function computePlayback() {
  const p = S().performance;
  let a = 'run';
  const take = (x) => { if (RANK[x] > RANK[a]) a = x; };
  take(rules.foreground);
  if (rules.locked) take(p.onLock);
  if (rules.onBattery) take(p.onBattery);
  if (rules.manualPause) take('pause');
  return a;
}

function updatePlayback() {
  const next = computePlayback();
  if (next === playback) return;
  const prev = playback;
  playback = next;
  if (next === 'stop') destroyAllWallpapers();
  else if (prev === 'stop') syncWallpapers(true);
  broadcast('wp:playback', next);
  pushState();
}

function onForeground(st) {
  const p = S().performance;
  let a = 'run';
  if (!st.desktop && st.pid !== process.pid) {
    a = st.fullscreen ? p.otherFullscreen : st.maximized ? p.otherMaximized : p.otherFocused;
  }
  rules.foreground = a;
  updatePlayback();
}

// ------------------------------------------------------------------ playlist
function playlistItems() {
  return S().playlist.items.filter((id) => findItem(id));
}

function playlistApplyIndex(idx) {
  const pl = S().playlist;
  const items = playlistItems();
  if (!items.length) return;
  pl.index = ((idx % items.length) + items.length) % items.length;
  settingsStore.save();
  applyWallpaper(items[pl.index], pl.target);
}

function playlistNext(dir = 1) {
  const pl = S().playlist;
  const items = playlistItems();
  if (!items.length) return;
  if (pl.order === 'random' && items.length > 1) {
    let idx;
    do idx = Math.floor(Math.random() * items.length); while (idx === pl.index);
    playlistApplyIndex(idx);
  } else playlistApplyIndex(pl.index + dir);
}

function scheduledIndex(n) {
  const pl = S().playlist;
  const now = new Date();
  if (pl.mode === 'timeofday') return Math.floor(((now.getHours() * 60 + now.getMinutes()) / 1440) * n);
  if (pl.mode === 'weekday') return (now.getDay() + 6) % 7 % n;
  return null;
}

function restartPlaylist(initial = false) {
  clearInterval(playlistTimer);
  playlistTimer = null;
  const pl = S().playlist;
  if (!pl.active || !playlistItems().length) return;
  if (pl.mode === 'timer') {
    playlistTimer = setInterval(() => { if (playback !== 'stop') playlistNext(); }, Math.max(1, pl.interval) * 60000);
  } else if (pl.mode === 'timeofday' || pl.mode === 'weekday') {
    const check = () => {
      const idx = scheduledIndex(playlistItems().length);
      if (idx !== null && idx !== S().playlist.index) playlistApplyIndex(idx);
    };
    check();
    playlistTimer = setInterval(check, 60000);
  } else if (pl.mode === 'startup' && initial) {
    playlistNext();
  }
}

// ------------------------------------------------------------------ paramètres
function applySettings(patch) {
  const before = JSON.parse(JSON.stringify(S()));
  // Les tableaux/objets « remplaçables » ne doivent pas être fusionnés en profondeur.
  const s = deepMerge(S(), patch);
  if (patch.display && patch.display.assignments) s.display.assignments = patch.display.assignments;
  if (patch.playlists) s.playlists = patch.playlists;
  settingsStore.set(s);

  if (patch.general && 'startWithOS' in patch.general && process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: !!s.general.startWithOS, args: ['--hidden'] });
  }
  if (patch.general && 'showTray' in patch.general) setupTray();
  if (patch.performance || patch.audio || patch.playlist) broadcast('wp:settings', wpSettings());
  if (patch.performance) updatePlayback();
  if (patch.display && patch.display.mode && patch.display.mode !== before.display.mode) {
    destroyAllWallpapers();
    setTimeout(() => syncWallpapers(true), 400);
  } else if (patch.display) syncWallpapers();
  if (patch.playlist) {
    const changed = ['active', 'mode', 'interval', 'items', 'order'].some((k) => k in patch.playlist);
    if (changed) restartPlaylist();
    if (patch.playlist.active && !before.playlist.active) playlistApplyIndex(S().playlist.index || 0);
  }
  pushState();
}

// ------------------------------------------------------------------ zone de notification
function togglePause() {
  rules.manualPause = !rules.manualPause;
  updatePlayback();
  pushState();
}

function toggleMute() {
  applySettings({ audio: { muteAll: !S().audio.muteAll } });
}

function setupTray() {
  if (!S().general.showTray) {
    if (tray) { tray.destroy(); tray = null; }
    return;
  }
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'darwin' ? 'tray.png' : 'icon.png'));
  tray = new Tray(icon.resize({ width: process.platform === 'win32' ? 16 : 22 }));
  tray.setToolTip('OpenWall');
  tray.on('click', () => showUI());
  tray.on('double-click', () => showUI());
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const s = S();
  const hasPl = playlistItems().length > 0;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Changer de fond d’écran', click: () => showUI() },
    { type: 'separator' },
    { label: rules.manualPause ? 'Reprendre' : 'Mettre en pause', click: togglePause },
    { label: s.audio.muteAll ? 'Réactiver le son' : 'Couper le son', click: toggleMute },
    { label: 'Fond suivant (playlist)', enabled: hasPl, click: () => playlistNext() },
    { type: 'separator' },
    { label: 'Paramètres', click: () => showUI('settings') },
    { label: 'Ouvrir le dossier de données', click: () => shell.openPath(DATA) },
    { type: 'separator' },
    { label: 'Quitter OpenWall', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.setToolTip(`OpenWall — ${playback === 'run' ? 'en lecture' : playback === 'mute' ? 'muet' : playback === 'pause' ? 'en pause' : 'arrêté'}`);
}

// ------------------------------------------------------------------ interface
function showUI(page) {
  if (uiWin && !uiWin.isDestroyed()) {
    if (uiWin.isMinimized()) uiWin.restore();
    uiWin.show();
    uiWin.focus();
    if (page) uiWin.webContents.send('ow:navigate', page);
    return;
  }
  const dark = S().ui.theme !== 'light';
  uiWin = new BrowserWindow({
    width: 1340, height: 840, minWidth: 1020, minHeight: 640,
    frame: false,
    show: false,
    title: 'OpenWall',
    backgroundColor: dark ? '#17191d' : '#eef0f4',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });
  uiWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  uiWin.webContents.on('will-navigate', (e) => e.preventDefault());
  uiWin.once('ready-to-show', () => {
    uiWin.show();
    if (page) uiWin.webContents.send('ow:navigate', page);
  });
  uiWin.on('maximize', () => uiWin.webContents.send('ow:maximized', true));
  uiWin.on('unmaximize', () => uiWin.webContents.send('ow:maximized', false));
  uiWin.on('closed', () => {
    uiWin = null;
    if (!S().general.closeToTray || !S().general.showTray) { quitting = true; app.quit(); }
  });
  uiWin.loadURL(`${servers.appBase}/app/ui/index.html`);
}

function fromUI(e) {
  return uiWin && !uiWin.isDestroyed() && e.sender === uiWin.webContents;
}

function registerIPC() {
  const handle = (name, fn) => ipcMain.handle('ow:' + name, async (e, ...args) => {
    if (!fromUI(e)) throw new Error('Refusé');
    return fn(...args);
  });

  handle('getState', () => getState());
  handle('openFiles', async (kind) => {
    const filters = {
      video: [{ name: 'Vidéos', extensions: VIDEO_EXT.map((x) => x.slice(1)) }],
      image: [{ name: 'Images', extensions: IMAGE_EXT.map((x) => x.slice(1)) }],
      web: [{ name: 'Pages web', extensions: WEB_EXT.map((x) => x.slice(1)) }]
    }[kind] || [
      { name: 'Fonds d’écran pris en charge', extensions: [...VIDEO_EXT, ...IMAGE_EXT, ...WEB_EXT].map((x) => x.slice(1)) },
      { name: 'Vidéos', extensions: VIDEO_EXT.map((x) => x.slice(1)) },
      { name: 'Images', extensions: IMAGE_EXT.map((x) => x.slice(1)) },
      { name: 'Pages web', extensions: WEB_EXT.map((x) => x.slice(1)) }
    ];
    const res = await dialog.showOpenDialog(uiWin, {
      title: 'Importer des fonds d’écran',
      properties: ['openFile', 'multiSelections'],
      filters
    });
    if (res.canceled) return [];
    return importPaths(res.filePaths);
  });
  handle('importPaths', (paths) => importPaths((paths || []).filter((p) => typeof p === 'string')));
  handle('addWeb', (opts) => addWeb(opts || {}));
  handle('updateItem', (id, patch) => updateItem(id, patch || {}));
  handle('previewProps', (id, props) => {
    const item = findItem(id);
    if (item) sendProps({ ...item, properties: props });
  });
  handle('saveThumbnail', (id, dataUrl) => saveThumbnail(id, dataUrl));
  handle('removeItem', (id) => removeItem(id));
  handle('duplicateItem', (id) => duplicateItem(id));
  handle('subscribe', (id) => subscribe(id));
  handle('apply', (id, target) => applyWallpaper(id, target));
  handle('clearWallpaper', (target) => {
    const a = S().display.assignments;
    if (!target || target === 'all') for (const k of Object.keys(a)) delete a[k];
    else delete a[target];
    settingsStore.save();
    syncWallpapers();
    pushState();
  });
  handle('restore', (snap) => {
    if (!snap) return;
    S().display.assignments = snap.assignments || {};
    settingsStore.save();
    for (const [id, props] of Object.entries(snap.props || {})) {
      const it = findItem(id);
      if (it) { it.properties = props; sendProps(it); }
    }
    libraryStore.save();
    syncWallpapers();
    pushState();
  });
  handle('setSettings', (patch) => applySettings(patch || {}));
  handle('togglePause', () => togglePause());
  handle('playlistNext', (dir) => playlistNext(dir === -1 ? -1 : 1));
  handle('showInFolder', (id) => {
    const it = findItem(id);
    if (it && it.file) shell.showItemInFolder(it.file);
  });
  handle('openData', () => shell.openPath(DATA));
  handle('openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
  handle('win', (action) => {
    if (!uiWin) return;
    if (action === 'min') uiWin.minimize();
    else if (action === 'max') (uiWin.isMaximized() ? uiWin.unmaximize() : uiWin.maximize());
    else if (action === 'close') uiWin.close();
    else if (action === 'quit') { quitting = true; app.quit(); }
  });

  ipcMain.on('wp:ready', (e) => {
    for (const w of wallpapers.values()) {
      if (w.win.isDestroyed() || e.sender !== w.win.webContents) continue;
      w.ready = true;
      send(w, 'wp:settings', wpSettings());
      send(w, 'wp:playback', playback);
      if (w.pending) { send(w, 'wp:load', w.pending); w.pending = null; }
    }
  });
  ipcMain.on('wp:log', (_e, msg) => console.log('[fond]', msg));
}

// ------------------------------------------------------------------ sessions
function setupSessions() {
  const origin = new URL(servers.appBase).origin;
  for (const ses of [session.defaultSession, session.fromPartition(WALLPAPER_PARTITION)]) {
    // Autorise l'affichage des sites web en fond d'écran (en-têtes anti-iframe retirés pour les sous-cadres).
    ses.webRequest.onHeadersReceived((details, cb) => {
      if (details.resourceType !== 'subFrame' || !details.responseHeaders) return cb({});
      const h = { ...details.responseHeaders };
      for (const k of Object.keys(h)) {
        const lk = k.toLowerCase();
        if (lk === 'x-frame-options') delete h[k];
        else if (lk === 'content-security-policy') h[k] = h[k].map((v) => v.replace(/frame-ancestors[^;]*;?/gi, ''));
      }
      cb({ responseHeaders: h });
    });
    ses.setPermissionRequestHandler((wc, permission, cb, details) => {
      const url = (details && (details.requestingUrl || details.securityOrigin)) || '';
      const ours = url.startsWith(origin);
      cb(ours && ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write'].includes(permission));
    });
  }
  // Capture du son système (Windows) pour les fonds réactifs à l'audio.
  session.fromPartition(WALLPAPER_PARTITION).setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => cb(sources.length ? { video: sources[0], audio: 'loopback' } : {}))
      .catch(() => cb({}));
  });
}

// ------------------------------------------------------------------ démarrage
function watchDisplays() {
  let t;
  const onChange = () => {
    clearTimeout(t);
    t = setTimeout(() => { syncWallpapers(true); pushState(); }, 1200);
  };
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
  screen.on('display-metrics-changed', onChange);
}

function watchMouse() {
  let lx = -1, ly = -1;
  setInterval(() => {
    if (!wallpapers.size || playback === 'pause' || playback === 'stop') return;
    const p = screen.getCursorScreenPoint();
    if (p.x === lx && p.y === ly) return;
    lx = p.x; ly = p.y;
    for (const w of wallpapers.values()) {
      if (!w.ready) continue;
      const b = w.bounds;
      send(w, 'wp:mouse', { x: (p.x - b.x) / b.width, y: (p.y - b.y) / b.height });
    }
  }, 33);
}

function watchPower() {
  rules.onBattery = powerMonitor.isOnBatteryPower ? powerMonitor.isOnBatteryPower() : false;
  powerMonitor.on('on-battery', () => { rules.onBattery = true; updatePlayback(); });
  powerMonitor.on('on-ac', () => { rules.onBattery = false; updatePlayback(); });
  powerMonitor.on('lock-screen', () => { rules.locked = true; updatePlayback(); });
  powerMonitor.on('unlock-screen', () => { rules.locked = false; updatePlayback(); });
  if (win32) stopForegroundWatch = win32.watchForeground(onForeground);
}

async function main() {
  DATA = app.getPath('userData');
  THUMBS = path.join(DATA, 'thumbnails');
  IMPORTS = path.join(DATA, 'imports');
  fs.mkdirSync(THUMBS, { recursive: true });
  settingsStore = new JsonStore(path.join(DATA, 'settings.json'), DEFAULT_SETTINGS);
  libraryStore = new JsonStore(path.join(DATA, 'library.json'), { items: [], removedBuiltins: [] });
  seedBuiltins();

  servers = await startServers({
    appRoot: __dirname,
    resolveMedia: (id) => {
      const it = findItem(id);
      return it && (it.type === 'video' || it.type === 'image') ? it.file : null;
    },
    resolveThumb: (id) => (findItem(id) && fs.existsSync(thumbPath(id)) ? thumbPath(id) : null),
    resolveSite: (id) => {
      const it = findItem(id);
      return it && it.type === 'web' && it.file ? path.dirname(it.file) : null;
    }
  });

  setupSessions();
  registerIPC();
  setupTray();
  watchDisplays();
  watchMouse();
  watchPower();
  playback = computePlayback();
  syncWallpapers(true);
  restartPlaylist(true);

  const hidden = process.argv.includes('--hidden') || S().general.startMinimized;
  if (!hidden || !S().general.showTray) showUI();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showUI());
  app.whenReady().then(main);
  app.on('window-all-closed', () => {
    // On reste actif dans la zone de notification ; on quitte seulement sur demande.
    if (quitting) app.quit();
  });
  app.on('activate', () => showUI());
  app.on('before-quit', () => {
    quitting = true;
    clearInterval(playlistTimer);
    if (stopForegroundWatch) stopForegroundWatch();
    const had = wallpapers.size > 0;
    for (const key of [...wallpapers.keys()]) destroyWallpaper(key);
    if (had && win32) win32.refreshDesktop(true);
    if (settingsStore) settingsStore.flush();
    if (libraryStore) libraryStore.flush();
    if (servers) servers.close();
  });
}
