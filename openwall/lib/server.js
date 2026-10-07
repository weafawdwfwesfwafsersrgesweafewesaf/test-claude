// Petit serveur HTTP local (127.0.0.1 uniquement) qui sert l'interface, les fonds d'écran
// et les fichiers médias importés, avec prise en charge des requêtes "Range" (lecture/seek vidéo).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// Vérifie que `target` est bien à l'intérieur de `root` (anti "../").
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const type = mimeOf(file);
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    };
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (m && !m[1] && m[2]) { // suffixe : les N derniers octets
        start = Math.max(0, st.size - parseInt(m[2], 10));
        end = st.size - 1;
      }
      if (!m || start >= st.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    }
  });
}

function listen(handler) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        handler(req, res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e && e.message));
      }
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/**
 * Démarre deux serveurs :
 *  - `app` : interface + fonds d'écran + médias de la bibliothèque (/TOKEN/app/..., /TOKEN/media/<id>, /TOKEN/thumb/<id>)
 *  - `site` : pages web HTML locales importées, sur une autre origine pour les isoler (/TOKEN/site/<id>/...)
 * Le jeton aléatoire empêche d'autres pages locales de lire vos fichiers.
 */
async function startServers({ appRoot, resolveMedia, resolveThumb, resolveSite }) {
  const token = crypto.randomBytes(16).toString('hex');
  const allowedAppDirs = ['ui', 'wallpaper', 'shared', 'assets'];

  const appSrv = await listen((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== token) { res.writeHead(403); return res.end('Forbidden'); }
    const kind = parts[1];
    if (kind === 'app') {
      const rel = parts.slice(2);
      if (!allowedAppDirs.includes(rel[0])) { res.writeHead(404); return res.end(); }
      const file = path.join(appRoot, ...rel);
      if (!isInside(appRoot, file)) { res.writeHead(403); return res.end(); }
      return sendFile(req, res, file);
    }
    if (kind === 'media') {
      const file = resolveMedia(parts[2]);
      if (!file) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, file);
    }
    if (kind === 'thumb') {
      const file = resolveThumb(parts[2]);
      if (!file) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, file);
    }
    res.writeHead(404);
    res.end();
  });

  const siteSrv = await listen((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== token || parts[1] !== 'site') { res.writeHead(403); return res.end('Forbidden'); }
    const root = resolveSite(parts[2]);
    if (!root) { res.writeHead(404); return res.end(); }
    const file = path.join(root, ...parts.slice(3));
    if (!isInside(root, file)) { res.writeHead(403); return res.end(); }
    return sendFile(req, res, file);
  });

  const appBase = `http://127.0.0.1:${appSrv.address().port}/${token}`;
  const siteBase = `http://127.0.0.1:${siteSrv.address().port}/${token}`;
  return {
    token,
    appBase,
    siteBase,
    close() { appSrv.close(); siteSrv.close(); }
  };
}

module.exports = { startServers, mimeOf, isInside };
