// Import depuis un site web : analyse une page (ex. une page « tag » d'un site de fonds animés),
// trouve les fonds vidéo qu'elle liste, puis télécharge la version choisie (HD, 4K…) sur le PC.
// Fonctionne de façon générique : liens directs .mp4/.webm, pages de détail avec boutons
// « Download », balises <video>, pagination « suivant ».
const { BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');

const PARTITION = 'persist:openwall-web';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VIDEO_RE = /\.(mp4|webm|m4v|mov)(\?|#|$)/i;
const NAV_RE = /(\/tags?[:/]|\/categor|\/search|[?&]q=|\/page[/:=]?\d|[?&]page=|\/log-?in|\/sign-?up|\/register|\/privacy|\/terms|\/about|\/contact|\/dmca|\/faq|\/rss|\/feed|\/sitemap|\/user\/|\/profile|\/upload|\/submit|\/random|\/popular|\/latest|\/new\/?$|\/top\/?$)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sesReady = false;
function ses() {
  const s = session.fromPartition(PARTITION);
  if (!sesReady) {
    s.setUserAgent(UA);
    sesReady = true;
  }
  return s;
}

const abs = (u, base) => {
  try {
    const x = new URL(u.trim().replace(/&amp;/g, '&'), base);
    return /^https?:$/.test(x.protocol) ? x.href.replace(/#.*$/, '') : null;
  } catch {
    return null;
  }
};
const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

// ---- Lecture d'une page : HTML brut d'abord (rapide), navigateur caché en secours (JS, protections) ----
function parseHTML(html, base) {
  const anchors = [];
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html))) {
    const href = abs(attr(m[1], 'href') || '', base);
    if (!href) continue;
    const imgTag = /<img\b[^>]*>/i.exec(m[2]);
    // Image de la carte : <img> (y compris chargement différé) ou image de fond CSS.
    let img = null;
    if (imgTag) {
      const t = imgTag[0];
      const srcset = (attr(t, 'data-srcset') || attr(t, 'srcset') || '').split(',')[0].trim().split(/\s+/)[0];
      img = abs(attr(t, 'data-src') || attr(t, 'data-lazy-src') || attr(t, 'data-original') || srcset || attr(t, 'src') || '', base);
      if (img && /^data:|\.svg(\?|$)|blank|placeholder|lazy\.(gif|png)/i.test(img)) img = abs(srcset || '', base);
    }
    if (!img) {
      const bg = /(?:data-bg|data-background|data-bg-src)\s*=\s*["']([^"']+)["']|background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)/i.exec(m[1] + m[2]);
      if (bg) img = abs(bg[1] || bg[2] || '', base);
    }
    anchors.push({
      href,
      text: clean(m[2]).slice(0, 160),
      title: clean(attr(m[1], 'title') || ''),
      img,
      alt: imgTag ? clean(attr(imgTag[0], 'alt') || '') : '',
      rel: (attr(m[1], 'rel') || '').toLowerCase(),
      download: /\bdownload\b/i.test(m[1])
    });
  }
  const videos = [];
  const vRe = /<(?:video|source)\b[^>]*>/gi;
  while ((m = vRe.exec(html))) {
    const u = abs(attr(m[0], 'src') || attr(m[0], 'data-src') || '', base);
    if (u) videos.push(u);
  }
  const metaRe = /<meta\b[^>]*>/gi;
  let ogImage = null;
  while ((m = metaRe.exec(html))) {
    const prop = (attr(m[0], 'property') || attr(m[0], 'name') || '').toLowerCase();
    const content = attr(m[0], 'content');
    if (!content) continue;
    if (/^og:video(:url|:secure_url)?$/.test(prop)) { const u = abs(content, base); if (u) videos.push(u); }
    if (prop === 'og:image' && !ogImage) ogImage = abs(content, base);
  }
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return { anchors, videos, ogImage, h1: h1 ? clean(h1[1]) : '', title: title ? clean(title[1]) : '', finalUrl: base };
}

const COLLECT_JS = `(() => {
  const abs = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href.replace(/#.*$/, '') : null; } catch { return null; } };
  const bgOf = (el) => { const m = /url\\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage || ''); return m ? abs(m[1]) : null; };
  const anchors = [...document.querySelectorAll('a[href]')].map((a) => {
    const img = a.querySelector('img');
    let src = img ? abs(img.currentSrc || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.src || '') : null;
    if (!src) { src = bgOf(a); if (!src) { const c = a.querySelector('[style*="background"], div, span'); if (c) src = bgOf(c); } }
    return { href: abs(a.getAttribute('href')), text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      title: a.title || '', img: src, alt: img ? img.alt || '' : '', rel: (a.rel || '').toLowerCase(), download: a.hasAttribute('download') };
  }).filter((a) => a.href);
  const videos = [...document.querySelectorAll('video, video source')].map((v) => abs(v.currentSrc || v.src || v.getAttribute('src') || '')).filter(Boolean);
  document.querySelectorAll('meta[property^="og:video"]').forEach((m) => { const u = abs(m.content); if (u) videos.push(u); });
  const og = document.querySelector('meta[property="og:image"]');
  const h1 = document.querySelector('h1');
  return { anchors, videos, ogImage: og ? abs(og.content) : null, h1: h1 ? h1.textContent.trim() : '', title: document.title, finalUrl: location.href };
})()`;

async function readWithBrowser(url) {
  const win = new BrowserWindow({
    show: false, width: 1366, height: 900,
    webPreferences: { partition: PARTITION, sandbox: true, backgroundThrottling: false, images: false }
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await Promise.race([win.loadURL(url, { userAgent: UA }), sleep(30000)]);
    await sleep(1500);
    await win.webContents.executeJavaScript(
      '(async () => { for (let i = 0; i < 10; i++) { window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 250)); } })()'
    ).catch(() => {});
    return await win.webContents.executeJavaScript(COLLECT_JS);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function readPage(url, { browser = false } = {}) {
  if (browser) return readWithBrowser(url);
  try {
    const res = await ses().fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    const type = res.headers.get('content-type') || '';
    const text = res.ok ? await res.text() : '';
    if (res.ok && (/html/i.test(type) || (!type && /^\s*</.test(text)))) {
      const data = parseHTML(text, res.url || url);
      if (data.anchors.length > 5 || data.videos.length) return data;
    }
  } catch {
    /* on tente le navigateur caché */
  }
  return readWithBrowser(url);
}

// ---- Analyse d'une page de liste ----
const sameSite = (a, b) => {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, ''), hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb || ha.endsWith('.' + hb) || hb.endsWith('.' + ha);
  } catch {
    return false;
  }
};

function titleFromUrl(u) {
  try {
    const p = decodeURIComponent(new URL(u).pathname).split('/').filter(Boolean).pop() || 'video';
    return p.replace(VIDEO_RE, '').replace(/[-_]+/g, ' ').replace(/\b\d{3,4}x\d{3,4}\b/g, '').trim() || 'Vidéo';
  } catch {
    return 'Vidéo';
  }
}

function findNext(data, current, pageNum) {
  const a = data.anchors;
  let n = a.find((x) => /\bnext\b/.test(x.rel));
  if (!n) n = a.find((x) => /^(next|suivant|next page|page suivante|›|»|>|→)$/i.test(x.text) || /^(next|suivant)/i.test(x.title));
  if (!n) n = a.find((x) => x.text === String(pageNum + 1) && sameSite(x.href, current));
  return n && n.href !== current ? n.href : null;
}

// « Forme » d'une adresse : /anime/xxx-live-wallpaper/ -> "2:anime" ; sert à repérer la série
// de liens qui forment la grille de fonds d'écran sur une page de liste.
function pathShape(u) {
  const segs = new URL(u).pathname.split('/').filter(Boolean);
  return segs.length + ':' + (segs.length > 1 ? segs[0] : '');
}

// Liens vers les pages de détail d'une page de liste.
function listingLinks(data, base) {
  const links = new Map(); // href -> infos fusionnées (un même fond a souvent 2 liens : image + titre)
  for (const a of data.anchors) {
    if (VIDEO_RE.test(a.href) || !sameSite(a.href, base)) continue;
    const u = new URL(a.href);
    if (u.pathname === '/' || a.href === base || NAV_RE.test(u.pathname + u.search) || /\.(jpe?g|png|gif|webp|css|js|xml|pdf|zip)(\?|$)/i.test(u.pathname)) continue;
    const cur = links.get(a.href) || { href: a.href, img: null, title: '', count: 0 };
    cur.count++;
    cur.img = cur.img || a.img;
    const t = a.alt || a.title || a.text;
    if (t && t.length > cur.title.length && t.length < 120) cur.title = t;
    links.set(a.href, cur);
  }
  const all = [...links.values()];
  // 1) Cartes avec image : le cas le plus courant.
  const withImg = all.filter((l) => l.img);
  // 2) Sinon (images en CSS, chargées en JS…) : la plus grande famille de liens de même forme.
  const groups = new Map();
  for (const l of all) {
    const k = pathShape(l.href);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  const imgShapes = new Set(withImg.map((l) => pathShape(l.href)));
  let best = [];
  for (const [k, g] of groups) {
    const score = g.length + (imgShapes.has(k) ? 1000 : 0);
    const bestScore = best.length + (best.length && imgShapes.has(pathShape(best[0].href)) ? 1000 : 0);
    if (g.length >= 6 && score > bestScore) best = g;
  }
  if (best.length) {
    const shape = pathShape(best[0].href);
    // garde l'ordre de la page ; ajoute les cartes avec image d'une autre forme seulement si peu nombreuses
    return all.filter((l) => pathShape(l.href) === shape || (l.img && withImg.length < 6));
  }
  return withImg;
}

async function scanListing(url, maxPages, onProgress, limit = Infinity) {
  const entries = [];
  const seen = new Set();
  let pageUrl = url;
  for (let p = 1; p <= maxPages && pageUrl && entries.length < limit; p++) {
    onProgress && onProgress({ page: p, found: entries.length });
    let data = await readPage(pageUrl);
    let base = data.finalUrl || pageUrl;
    let links = listingLinks(data, base);
    // Grille construite en JavaScript : on relit la page avec le navigateur caché.
    if (links.length < 4) {
      try {
        const d2 = await readPage(pageUrl, { browser: true });
        const l2 = listingLinks(d2, d2.finalUrl || pageUrl);
        if (l2.length > links.length) { data = d2; base = d2.finalUrl || pageUrl; links = l2; }
      } catch { /* on garde la lecture simple */ }
    }
    const before = entries.length;
    for (const l of links) {
      if (seen.has(l.href)) continue;
      seen.add(l.href);
      entries.push({ kind: 'page', url: l.href, title: l.title || titleFromUrl(l.href), thumb: l.img, from: base });
    }
    // Page qui liste directement des fichiers vidéo (sans pages de détail).
    if (entries.length === before && !links.length) {
      for (const v of [...data.anchors.map((x) => x.href), ...data.videos]) {
        if (VIDEO_RE.test(v) && !seen.has(v)) {
          seen.add(v);
          entries.push({ kind: 'video', url: v, title: titleFromUrl(v), thumb: null, from: base });
        }
      }
    }
    const next = findNext(data, base, p);
    pageUrl = next && !seen.has('page:' + next) ? next : null;
    if (next) seen.add('page:' + next);
    if (pageUrl) await sleep(400);
  }
  return entries.slice(0, limit);
}

// ---- Choix du meilleur lien de téléchargement sur une page de détail ----
function qualityOf(s) {
  const wh = /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(s);
  if (wh) {
    const h = Math.min(+wh[1], +wh[2]);
    if (h >= 2000) return '4k';
    if (h >= 1400) return '2k';
    if (h >= 1000) return 'hd';
    if (h >= 700) return '720';
    return 'low';
  }
  if (/\b(4k|uhd|2160p?|3840)\b/i.test(s)) return '4k';
  if (/\b(2k|1440p?|2560)\b/i.test(s)) return '2k';
  if (/\b(hd|fhd|full ?hd|1080p?|1920)\b/i.test(s)) return 'hd';
  if (/\b(720p?|1280)\b/i.test(s)) return '720';
  if (/\b(preview|thumb|small|sd|480p?|540p?|360p?|960x540|640x360)\b/i.test(s)) return 'low';
  return '?';
}

const ORDER = {
  hd: ['hd', '2k', '?', '4k', '720', 'low'],
  '4k': ['4k', '2k', 'hd', '?', '720', 'low'],
  small: ['720', 'hd', '?', 'low', '2k', '4k']
};

function rankCandidates(data, quality) {
  const cands = [];
  const seen = new Set();
  const add = (url, label, isFile, isPreview) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    cands.push({ url, q: isPreview ? 'low' : qualityOf(label + ' ' + url), isFile, isPreview });
  };
  for (const a of data.anchors) {
    const label = `${a.text} ${a.title}`;
    const isFile = VIDEO_RE.test(a.href);
    const isDl = a.download || /\/(dl|download|downloads|get)\//i.test(a.href) || /\b(download|télécharger|telecharger)\b/i.test(label);
    if (isFile || isDl) add(a.href, label, isFile, false);
  }
  for (const v of data.videos) add(v, '', true, true);
  const order = ORDER[quality] || ORDER.hd;
  cands.sort((a, b) => order.indexOf(a.q) - order.indexOf(b.q) || (b.isFile ? 1 : 0) - (a.isFile ? 1 : 0));
  return cands;
}

// ---- Téléchargement (via la pile réseau du navigateur : cookies, redirections, en-têtes) ----
function downloadTo(url, destNoExt, referer, onProgress, isCancelled) {
  return new Promise((resolve, reject) => {
    const s = ses();
    let done = false;
    const onWill = (_e, item) => {
      const chain = item.getURLChain();
      if (chain[0] !== url) return;
      s.removeListener('will-download', onWill);
      const mime = item.getMimeType() || '';
      const extFromName = path.extname(item.getFilename() || '').toLowerCase();
      const ext = /webm/.test(mime) ? '.webm' : /quicktime/.test(mime) ? '.mov' : /html/.test(mime) ? '.html'
        : ['.mp4', '.webm', '.m4v', '.mov'].includes(extFromName) ? extFromName : '.mp4';
      const dest = destNoExt + ext;
      item.setSavePath(dest);
      const timer = setInterval(() => { if (isCancelled()) item.cancel(); }, 500);
      item.on('updated', () => {
        const total = item.getTotalBytes();
        onProgress(total ? item.getReceivedBytes() / total : 0, item.getReceivedBytes(), total);
      });
      item.once('done', (_ev, state) => {
        clearInterval(timer);
        done = true;
        if (state === 'completed') resolve({ file: dest, mime, finalUrl: chain[chain.length - 1] });
        else { fs.promises.unlink(dest).catch(() => {}); reject(new Error(state === 'cancelled' ? 'annulé' : 'échec du téléchargement')); }
      });
    };
    s.on('will-download', onWill);
    s.downloadURL(url, referer ? { headers: { Referer: referer } } : undefined);
    setTimeout(() => {
      if (!done) { s.removeListener('will-download', onWill); }
    }, 10 * 60 * 1000);
  });
}

const isVideoFile = (file) => {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    return b.toString('latin1', 4, 8) === 'ftyp' || b.readUInt32BE(0) === 0x1a45dfa3; // MP4/MOV ou WebM/MKV
  } catch {
    return false;
  }
};

const slug = (s) => String(s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase() || 'video';

// ---- Navigateur caché pour les pages de téléchargement « difficiles » ----
// Compte à rebours, bouton à cliquer, formulaire, lien généré en JavaScript, nouvel onglet…
// On ouvre la page, on clique sur « Download », et on récupère l'adresse de la vidéo
// (téléchargement déclenché, nouvel onglet, lien .mp4 qui apparaît, ou vidéo lue par la page).
const captures = new Map(); // id du webContents -> Set d'adresses vidéo vues sur le réseau
let hooked = false;
function hookSession() {
  if (hooked) return;
  hooked = true;
  ses().webRequest.onBeforeRequest((details, cb) => {
    const set = captures.get(details.webContentsId);
    if (set && (details.resourceType === 'media' || VIDEO_RE.test(details.url))) set.add(details.url);
    cb({});
  });
}

const CLICK_JS = `(() => {
  const re = /(download|télécharger|telecharger|get (the )?(video|file|wallpaper))/i;
  const els = [...document.querySelectorAll('a, button, input[type=submit], input[type=button], [role=button]')];
  const el = els.find((e) => !e.dataset.owClicked && e.offsetParent !== null &&
    re.test([e.textContent, e.value, e.title, e.getAttribute('aria-label'), e.id, e.className].join(' ')));
  if (!el) return false;
  el.dataset.owClicked = '1';
  el.click();
  return true;
})()`;

// Si la page déclenche elle-même un téléchargement (formulaire, lien à usage unique…), on le garde
// directement dans `base` au lieu de le relancer : retourne alors { downloaded: { file, url } }.
async function resolveWithBrowser(url, { base, onProgress, isCancelled, waitMs = 16000 } = {}) {
  hookSession();
  const win = new BrowserWindow({
    show: false, width: 1366, height: 900,
    webPreferences: { partition: PARTITION, sandbox: true, backgroundThrottling: false }
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  const strong = new Set(); // liens de téléchargement certains
  const weak = new Set(); // vidéos lues par la page (souvent un aperçu)
  const id = wc.id;
  captures.set(id, weak);
  let pending = null; // téléchargement lancé par la page
  wc.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/.test(u)) strong.add(u);
    return { action: 'deny' };
  });
  const onWill = (_e, item, src) => {
    if (!src || src.id !== id) return;
    const u = item.getURL();
    if (pending || !base) { strong.add(u); item.cancel(); return; }
    const ext = /webm/.test(item.getMimeType() || '') ? '.webm' : '.mp4';
    const file = base + ext;
    item.setSavePath(file);
    pending = new Promise((resolve) => {
      const timer = setInterval(() => { if (isCancelled && isCancelled()) item.cancel(); }, 500);
      item.on('updated', () => {
        const total = item.getTotalBytes();
        if (onProgress) onProgress(total ? item.getReceivedBytes() / total : 0);
      });
      item.once('done', (_ev, state) => {
        clearInterval(timer);
        if (state === 'completed' && isVideoFile(file)) resolve({ file, url: u });
        else { fs.promises.unlink(file).catch(() => {}); strong.add(u); resolve(null); }
      });
    });
  };
  ses().on('will-download', onWill);
  try {
    wc.loadURL(url, { userAgent: UA }).catch(() => {});
    const t0 = Date.now();
    let clicks = 0;
    let misses = 0; // aucun bouton « Download » trouvé
    while (Date.now() - t0 < waitMs && !strong.size && !pending && misses < 4) {
      await sleep(800);
      if (win.isDestroyed() || (isCancelled && isCancelled())) break;
      const data = await wc.executeJavaScript(COLLECT_JS).catch(() => null);
      if (data) {
        for (const a of data.anchors) if (VIDEO_RE.test(a.href)) strong.add(a.href);
        for (const v of data.videos) weak.add(v);
      }
      if (strong.size || pending) break;
      // Laisse la page s'afficher (et un éventuel compte à rebours tourner), puis clique sur « Download ».
      if (Date.now() - t0 > 2500 && clicks < 4 && (Date.now() - t0) / 3000 > clicks) {
        if (await wc.executeJavaScript(CLICK_JS).catch(() => false)) clicks++;
        else if (!clicks) misses++;
      }
    }
    const downloaded = pending ? await pending : null;
    return { downloaded, strong: [...strong], weak: [...weak] };
  } finally {
    ses().removeListener('will-download', onWill);
    captures.delete(id);
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Récupère une entrée : trouve le bon lien, télécharge, vérifie que c'est bien une vidéo.
 * Ordre d'essai : liens « Download » de la page → pages intermédiaires (lecture simple puis
 * navigateur caché avec clic) → navigateur caché sur la page elle-même → vidéo affichée sur la page.
 * Retourne { file, title, thumb, sourceUrl, quality }.
 */
async function fetchEntry(entry, { quality, dir, onProgress, isCancelled }) {
  let title = entry.title;
  let thumb = entry.thumb;
  let data = null;
  if (entry.kind !== 'video') {
    data = await readPage(entry.url);
    title = (data.h1 || title).replace(/\s*[-–|:]?\s*(4k|hd)?\s*(live|animated|moving)?\s*(wallpapers?|backgrounds?)\s*$/i, '').trim() || title;
    thumb = data.ogImage || thumb;
  }
  fs.mkdirSync(dir, { recursive: true });
  let base = path.join(dir, slug(title));
  for (let i = 2; fs.existsSync(base + '.mp4') || fs.existsSync(base + '.webm'); i++) base = path.join(dir, `${slug(title)}-${i}`);

  const order = ORDER[quality] || ORDER.hd;
  const byQ = (a, b) => order.indexOf(qualityOf(a)) - order.indexOf(qualityOf(b));
  const tried = new Set();
  const browsed = new Set();
  const weak = [];
  const result = (res, url) => ({ file: res.file, title, thumb, sourceUrl: entry.url, quality: qualityOf(url) });

  // Télécharge `url` : { ok } si c'est une vidéo, { html, finalUrl } si c'est une page, null sinon.
  const attempt = async (url, referer) => {
    if (!url || tried.has(url)) return null;
    if (isCancelled()) throw new Error('annulé');
    tried.add(url);
    try {
      const res = await downloadTo(url, base, referer, onProgress, isCancelled);
      if (isVideoFile(res.file)) return { ok: res };
      let html = '';
      try { html = fs.readFileSync(res.file, 'utf8'); } catch { /* ignore */ }
      fs.promises.unlink(res.file).catch(() => {});
      return /<html|<body|<a\b/i.test(html) ? { html, finalUrl: res.finalUrl || url } : null;
    } catch (e) {
      if (isCancelled()) throw e;
      return null;
    }
  };

  const viaBrowser = async (pageUrl) => {
    if (browsed.has(pageUrl) || isCancelled()) return null;
    browsed.add(pageUrl);
    const r = await resolveWithBrowser(pageUrl, { base, onProgress, isCancelled });
    if (r.downloaded) return result(r.downloaded, r.downloaded.url);
    for (const u of r.strong.sort(byQ)) {
      const a = await attempt(u, pageUrl);
      if (a && a.ok) return result(a.ok, u);
    }
    weak.push(...r.weak);
    return null;
  };

  if (entry.kind === 'video') {
    const a = await attempt(entry.url, entry.from || null);
    if (a && a.ok) return result(a.ok, entry.url);
    throw new Error('le lien ne mène pas à une vidéo');
  }

  const cands = rankCandidates(data, quality);
  for (const c of cands.filter((x) => !x.isPreview).slice(0, 4)) {
    const a = await attempt(c.url, entry.url);
    if (!a) continue;
    if (a.ok) return result(a.ok, c.url);
    // Page intermédiaire : lien direct dans le HTML ?
    const inner = rankCandidates(parseHTML(a.html, a.finalUrl), quality).filter((x) => x.isFile && !x.isPreview);
    for (const ic of inner.slice(0, 3)) {
      const b = await attempt(ic.url, a.finalUrl);
      if (b && b.ok) return result(b.ok, ic.url);
    }
    // Sinon : compte à rebours / bouton / JavaScript → navigateur caché.
    const r = await viaBrowser(a.finalUrl);
    if (r) return r;
  }
  const r = await viaBrowser(entry.url);
  if (r) return r;
  // Dernier recours : la vidéo affichée sur la page (souvent la vidéo complète sur ces sites).
  const fallback = [...cands.filter((x) => x.isPreview).map((x) => x.url), ...weak].sort(byQ);
  for (const u of fallback) {
    const a = await attempt(u, entry.url);
    if (a && a.ok) return result(a.ok, u);
  }
  throw new Error('aucun lien vidéo trouvé (le site a peut-être changé)');
}

module.exports = { scanListing, fetchEntry, parseHTML, rankCandidates, qualityOf, PARTITION };
