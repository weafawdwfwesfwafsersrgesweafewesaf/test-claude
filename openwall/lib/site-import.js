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
    const img = imgTag ? abs(attr(imgTag[0], 'data-src') || attr(imgTag[0], 'src') || '', base) : null;
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
  const anchors = [...document.querySelectorAll('a[href]')].map((a) => {
    const img = a.querySelector('img');
    return { href: abs(a.getAttribute('href')), text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      title: a.title || '', img: img ? abs(img.currentSrc || img.src || img.getAttribute('data-src') || '') : null,
      alt: img ? img.alt || '' : '', rel: (a.rel || '').toLowerCase(), download: a.hasAttribute('download') };
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

async function readPage(url) {
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

async function scanListing(url, maxPages, onProgress) {
  const entries = [];
  const seen = new Set();
  let pageUrl = url;
  for (let p = 1; p <= maxPages && pageUrl; p++) {
    onProgress && onProgress({ page: p, found: entries.length });
    const data = await readPage(pageUrl);
    const base = data.finalUrl || pageUrl;
    // 1) Liens directs vers des vidéos
    for (const v of [...data.anchors.map((x) => x.href), ...data.videos]) {
      if (VIDEO_RE.test(v) && !seen.has(v)) {
        seen.add(v);
        entries.push({ kind: 'video', url: v, title: titleFromUrl(v), thumb: null });
      }
    }
    // 2) Cartes (lien + image) vers une page de détail sur le même site
    for (const a of data.anchors) {
      if (!a.img || VIDEO_RE.test(a.href) || !sameSite(a.href, base) || seen.has(a.href)) continue;
      const u = new URL(a.href);
      if (u.pathname === '/' || a.href === base || NAV_RE.test(u.pathname + u.search)) continue;
      seen.add(a.href);
      entries.push({ kind: 'page', url: a.href, title: a.alt || a.title || a.text || titleFromUrl(a.href), thumb: a.img });
    }
    const next = findNext(data, base, p);
    pageUrl = next && !seen.has('page:' + next) ? next : null;
    if (next) seen.add('page:' + next);
    if (pageUrl) await sleep(400);
  }
  return entries;
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

/**
 * Récupère une entrée : trouve le bon lien, télécharge, vérifie que c'est bien une vidéo.
 * Retourne { file, title, thumb, sourceUrl }.
 */
async function fetchEntry(entry, { quality, dir, onProgress, isCancelled }) {
  let title = entry.title;
  let thumb = entry.thumb;
  let cands;
  if (entry.kind === 'video') cands = [{ url: entry.url, q: qualityOf(entry.url), isFile: true }];
  else {
    const data = await readPage(entry.url);
    title = (data.h1 || title).replace(/\s*[-–|:]?\s*(4k|hd)?\s*(live|animated|moving)?\s*(wallpapers?|backgrounds?)\s*$/i, '').trim() || title;
    thumb = data.ogImage || thumb;
    cands = rankCandidates(data, quality);
  }
  if (!cands.length) throw new Error('aucune vidéo trouvée sur la page');
  fs.mkdirSync(dir, { recursive: true });
  let base = path.join(dir, slug(title));
  for (let i = 2; fs.existsSync(base + '.mp4') || fs.existsSync(base + '.webm'); i++) base = path.join(dir, `${slug(title)}-${i}`);

  let lastErr = null;
  for (const c of cands.slice(0, 6)) {
    if (isCancelled()) throw new Error('annulé');
    try {
      const res = await downloadTo(c.url, base, entry.url, onProgress, isCancelled);
      if (isVideoFile(res.file)) return { file: res.file, title, thumb, sourceUrl: entry.url, quality: c.q };
      // C'était une page intermédiaire : on cherche la vidéo dedans.
      let html = '';
      try { html = fs.readFileSync(res.file, 'utf8'); } catch { /* ignore */ }
      fs.promises.unlink(res.file).catch(() => {});
      if (html) {
        const inner = rankCandidates(parseHTML(html, res.finalUrl || c.url), quality).filter((x) => x.isFile);
        for (const ic of inner.slice(0, 3)) {
          const r2 = await downloadTo(ic.url, base, res.finalUrl || c.url, onProgress, isCancelled);
          if (isVideoFile(r2.file)) return { file: r2.file, title, thumb, sourceUrl: entry.url, quality: ic.q };
          fs.promises.unlink(r2.file).catch(() => {});
        }
      }
      lastErr = new Error('le lien ne mène pas à une vidéo');
    } catch (e) {
      if (isCancelled()) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('téléchargement impossible');
}

module.exports = { scanListing, fetchEntry, parseHTML, rankCandidates, qualityOf, PARTITION };
