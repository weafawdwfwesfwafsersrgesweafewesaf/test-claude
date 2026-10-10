#!/usr/bin/env node
// RoSwarm — serveur local : interface web, API, pont MCP des agents et pont du plugin Roblox Studio.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { APP_ROOT, PORT, TOKEN, VERSION, IS_WIN, writeConnectionFile } from './config.js';
import { bus } from './bus.js';
import * as projects from './projects.js';
import * as agents from './agents.js';
import * as studio from './studio.js';
import * as coord from './coord.js';
import * as sync from './sync.js';
import * as setup from './setup.js';
import { callTool, instructionsFor } from './tools.js';
import { ROLES, TEAM_ORDER } from './roles.js';

const NO_OPEN = process.argv.includes('--no-open') || process.env.ROSWARM_NO_OPEN === '1';
const URL_BASE = `http://127.0.0.1:${PORT}`;

// ---------- utilitaires HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function json(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Requête trop grosse'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function hostOk(req) {
  const h = String(req.headers.host || '');
  return h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`;
}

function serveFile(res, file, transform) {
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Introuvable' });
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(transform ? transform(data.toString('utf8')) : data);
  });
}

const STATIC = {
  '/vendor/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
  '/vendor/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
  '/vendor/addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
};

// ---------- état complet pour l'interface ----------

function snapshot() {
  const pid = projects.activeId();
  return {
    version: VERSION,
    platform: process.platform,
    projects: projects.list(),
    activeProjectId: pid,
    agents: agents.list(),
    studio: studio.status(),
    locks: coord.listLocks(),
    board: pid ? coord.board(pid) : null,
    activity: pid ? coord.getActivity(pid).slice(-150) : [],
    logs: studio.getLogs(200),
    roles: { list: ROLES, order: TEAM_ORDER },
    types: Object.fromEntries(Object.entries(setup.AGENT_TYPES).map(([k, t]) => [k, { label: t.label, color: t.color, hint: t.hint }])),
  };
}

// ---------- routes ----------

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/ping$/, () => ({ ok: true, app: 'roswarm', version: VERSION }));
route('GET', /^\/api\/state$/, () => snapshot());
route('GET', /^\/api\/setup$/, () => setup.status());
route('POST', /^\/api\/setup\/plugin$/, () => setup.installPlugin());
route('POST', /^\/api\/setup\/terminal$/, (b) => {
  const t = setup.AGENT_TYPES[b.type];
  if (!t || !t.bin) throw new Error('Type inconnu');
  const command = b.kind === 'login' ? t.login : t.install;
  const a = agents.spawn({ type: b.type, setup: true, command, cols: b.cols || 100, rows: b.rows || 24 });
  a.name = (b.kind === 'login' ? 'Connexion — ' : 'Installation — ') + t.label;
  return agents.publicInfo(a);
});
route('POST', /^\/api\/setup\/open-plugins$/, () => {
  const dir = setup.pluginDir();
  if (dir) openPath(dir);
  return { ok: true };
});

route('POST', /^\/api\/projects$/, (b) => projects.create(b));
route('POST', /^\/api\/projects\/(\w+)\/open$/, (b, m) => {
  projects.setActive(m[1]);
  sync.forProject(m[1]);
  if (studio.status().connected) sync.onStudioConnected();
  return { ok: true };
});
route('PATCH', /^\/api\/projects\/(\w+)$/, (b, m) => {
  const p = projects.update(m[1], b);
  if (b.sync === true && m[1] === projects.activeId() && studio.status().connected) sync.onStudioConnected();
  return p;
});
route('DELETE', /^\/api\/projects\/(\w+)$/, (b, m) => {
  for (const a of agents.all()) if (a.projectId === m[1]) agents.kill(a.id);
  projects.remove(m[1]);
  return { ok: true };
});
route('POST', /^\/api\/projects\/(\w+)\/reveal$/, (b, m) => {
  const p = projects.get(m[1]);
  if (p) openPath(p.dir);
  return { ok: true };
});
route('POST', /^\/api\/projects\/(\w+)\/tabs$/, (b, m) => projects.addTab(m[1]));
route('DELETE', /^\/api\/projects\/(\w+)\/tabs\/(\w+)$/, (b, m) => {
  for (const a of agents.all()) if (a.projectId === m[1] && a.tabId === m[2]) agents.kill(a.id);
  projects.removeTab(m[1], m[2]);
  return { ok: true };
});
route('POST', /^\/api\/projects\/(\w+)\/pull$/, async (b, m) => {
  const s = sync.forProject(m[1]);
  return s.pullAll();
});
route('POST', /^\/api\/projects\/(\w+)\/push$/, async (b, m) => {
  const s = sync.forProject(m[1]);
  return { count: await s.pushAll() };
});

route('POST', /^\/api\/projects\/(\w+)\/tasks$/, (b, m) => coord.createTask(m[1], { ...b, createdBy: 'Toi' }));
route('PATCH', /^\/api\/projects\/(\w+)\/tasks\/(\d+)$/, (b, m) => coord.updateTask(m[1], m[2], b, 'Toi'));
route('DELETE', /^\/api\/projects\/(\w+)\/tasks\/(\d+)$/, (b, m) => {
  coord.deleteTask(m[1], m[2]);
  return { ok: true };
});
route('POST', /^\/api\/projects\/(\w+)\/messages$/, (b, m) => coord.postMessage(m[1], { from: 'Toi', to: b.to, text: b.text }));
route('POST', /^\/api\/projects\/(\w+)\/broadcast$/, (b, m) => {
  const targets = agents.all().filter((a) => a.projectId === m[1] && !a.setup && a.status !== 'exited' && (!b.tabId || a.tabId === b.tabId));
  for (const a of targets) agents.sendText(a.id, b.text);
  coord.log(m[1], 'Toi', `message envoyé à ${targets.length} agent(s)`, 'user');
  return { sent: targets.length };
});

route('POST', /^\/api\/agents$/, (b) => agents.publicInfo(agents.spawn(b)));
route('POST', /^\/api\/projects\/(\w+)\/team$/, (b, m) => {
  // Lance une équipe de Claude : [{ role, model }], tous avec le même mode d'autorisation.
  const members = (Array.isArray(b.members) ? b.members : []).slice(0, 8);
  if (!members.length) throw new Error('Équipe vide');
  return members.map((x) =>
    agents.publicInfo(
      agents.spawn({ projectId: m[1], tabId: b.tabId, type: 'claude', role: x.role, model: x.model || b.model, permissionMode: b.permissionMode }),
    ),
  );
});
route('GET', /^\/api\/roles$/, () => ({ roles: ROLES, order: TEAM_ORDER }));
route('POST', /^\/api\/agents\/(\w+)\/restart$/, (b, m) => {
  agents.restart(m[1]);
  return { ok: true };
});
route('DELETE', /^\/api\/agents\/(\w+)$/, (b, m) => {
  agents.kill(m[1]);
  return { ok: true };
});
route('POST', /^\/api\/agents\/(\w+)\/send$/, (b, m) => {
  agents.sendText(m[1], b.text);
  return { ok: true };
});
route('POST', /^\/api\/agents\/(\w+)\/task$/, (b, m) => {
  const a = agents.get(m[1]);
  if (!a) throw new Error('Agent introuvable');
  const t = coord.updateTask(a.projectId, b.taskId, { assignee: a.name, status: 'doing' }, 'Toi');
  if (!t) throw new Error('Tâche introuvable');
  agents.notify(
    a.id,
    `[RoSwarm] Nouvelle tâche #${t.id} pour toi (de l'utilisateur) : ${t.title}` +
      (t.details ? `\n${t.details}` : '') +
      `\nCommence par agents_status, réserve ce que tu modifies avec claim, ` +
      `et quand c'est fini appelle task_update(id=${t.id}, status="done", note="résumé") puis release.`,
  );
  return t;
});

route('POST', /^\/api\/studio\/call$/, async (b) => {
  const r = await callTool('user', b.tool, b.args || {});
  if (r.isError) throw new Error(r.text);
  return { text: r.text };
});
route('POST', /^\/api\/studio\/raw$/, async (b) => ({ result: await studio.call(b.tool, b.args || {}) }));
route('POST', /^\/api\/studio\/active$/, (b) => {
  studio.setActive(b.sessionId);
  sync.onStudioConnected();
  return studio.status();
});

// MCP (pont des agents)
route('GET', /^\/api\/mcp\/hello$/, (b, m, url) => ({ instructions: instructionsFor(url.searchParams.get('agent')) }));
route('POST', /^\/api\/mcp\/call$/, (b) => callTool(b.agentId, b.tool, b.args));

// Hooks Claude Code
route('POST', /^\/api\/hook$/, (b) => {
  const a = agents.get(b.agentId);
  if (!a) return { ok: true };
  const p = b.payload || {};
  const project = projects.get(a.projectId);
  if (b.event === 'prompt') agents.setHookStatus(a.id, 'working');
  else if (b.event === 'start') agents.setHookStatus(a.id, 'idle');
  else if (b.event === 'notify') {
    // « Claude needs your permission… » = attend une réponse ; « waiting for your input » = simplement libre.
    agents.setHookStatus(a.id, /permission|approv|autoris/i.test(p.message || '') ? 'waiting' : 'idle');
  }
  else if (b.event === 'stop') agents.setHookStatus(a.id, 'idle');
  else if (b.event === 'pre') {
    agents.setHookStatus(a.id, 'working');
    const file = p.tool_input?.file_path || p.tool_input?.notebook_path;
    if (file && project) {
      const rel = path.relative(project.dir, path.resolve(project.dir, file));
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        const r = coord.claim(a.projectId, a, [rel]);
        if (!r.ok) {
          coord.log(a.projectId, a.name, `bloqué sur ${rel} (réservé par ${r.conflicts[0].holder.agentName})`, 'lock');
          return {
            block: true,
            reason:
              'RoSwarm : ' +
              r.conflicts.map(coord.describeConflict).join(' ; ') +
              '. Ne modifie pas ce fichier maintenant : choisis une autre tâche, ou écris à cet agent avec post_message (outil roswarm).',
          };
        }
      }
    }
  } else if (b.event === 'post') {
    agents.setHookStatus(a.id, 'working');
    const tool = p.tool_name || '';
    const file = p.tool_input?.file_path;
    if (file && project && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) {
      const rel = path.relative(project.dir, path.resolve(project.dir, file)).replace(/\\/g, '/');
      agents.setLastAction(a.id, 'modifie ' + rel);
      coord.log(a.projectId, a.name, 'a modifié ' + rel, 'edit');
    } else if (tool === 'Bash' && p.tool_input?.command) {
      agents.setLastAction(a.id, '$ ' + String(p.tool_input.command).slice(0, 100));
    }
  }
  return { ok: true };
});

// ---------- plugin Roblox Studio ----------
// Pas de jeton (le plugin ne le connaît pas) : on refuse tout ce qui vient d'un navigateur
// (en-tête Origin) et on exige du JSON, ce qu'un site web ne peut pas envoyer sans pré-vol CORS.
async function handlePlugin(req, res, pathname) {
  if (req.method !== 'POST' || req.headers.origin || !/application\/json/.test(req.headers['content-type'] || '')) {
    return json(res, 403, { error: 'Interdit' });
  }
  const body = await readBody(req);
  if (pathname === '/plugin/poll') return studio.handlePoll(body, res);
  if (pathname === '/plugin/result') studio.handleResult(body);
  else if (pathname === '/plugin/log') studio.handleLog(body);
  else if (pathname === '/plugin/changes') {
    const s = sync.forActive();
    for (const item of Array.isArray(body.items) ? body.items : []) s?.applyStudioChange(item);
  } else return json(res, 404, { error: 'Introuvable' });
  json(res, 200, { ok: true });
}

// ---------- serveur ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, URL_BASE);
  const pathname = url.pathname;
  if (!hostOk(req)) return json(res, 403, { error: 'Hôte refusé' });
  try {
    if (pathname.startsWith('/plugin/')) return await handlePlugin(req, res, pathname);

    if (pathname === '/' || pathname === '/index.html') {
      return serveFile(res, path.join(APP_ROOT, 'public', 'index.html'), (html) => html.replace('__ROSWARM_TOKEN__', TOKEN));
    }
    if (STATIC[pathname]) return serveFile(res, path.join(APP_ROOT, STATIC[pathname]));
    if (pathname.startsWith('/static/')) {
      const file = path.normalize(path.join(APP_ROOT, 'public', pathname.slice('/static/'.length)));
      if (!file.startsWith(path.join(APP_ROOT, 'public'))) return json(res, 403, { error: 'Interdit' });
      return serveFile(res, file);
    }

    if (pathname.startsWith('/api/')) {
      if (pathname !== '/api/ping' && req.headers['x-roswarm-token'] !== TOKEN) return json(res, 401, { error: 'Jeton invalide' });
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.pattern);
        if (!m) continue;
        const body = req.method === 'GET' ? {} : await readBody(req);
        const out = await r.handler(body, m, url);
        return json(res, 200, out ?? { ok: true });
      }
    }
    json(res, 404, { error: 'Introuvable' });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

// ---------- WebSocket de l'interface ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, URL_BASE);
  const origin = req.headers.origin || '';
  const originOk = origin === `http://127.0.0.1:${PORT}` || origin === `http://localhost:${PORT}`;
  if (url.pathname !== '/ws' || !hostOk(req) || !originOk || url.searchParams.get('token') !== TOKEN) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data);
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', state: snapshot() }));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'input') agents.write(msg.agentId, msg.data);
    else if (msg.type === 'resize') agents.resize(msg.agentId, msg.cols, msg.rows);
    else if (msg.type === 'attach') {
      const a = agents.get(msg.agentId);
      if (a) ws.send(JSON.stringify({ type: 'replay', agentId: a.id, data: a.buffer }));
    }
  });
});

// Regroupe les événements fréquents pour ne pas inonder l'interface.
let pendingAgents = false;
bus.on('agents', () => {
  if (pendingAgents) return;
  pendingAgents = true;
  setTimeout(() => {
    pendingAgents = false;
    broadcast({ type: 'agents', agents: agents.list() });
  }, 100);
});
bus.on('term', (agentId, data) => broadcast({ type: 'term', agentId, data }));
bus.on('projects', () => broadcast({ type: 'projects', projects: projects.list(), activeProjectId: projects.activeId() }));
bus.on('studio', () => broadcast({ type: 'studio', studio: studio.status() }));
bus.on('studio-log', (entries) => broadcast({ type: 'logs', entries }));
bus.on('locks', () => broadcast({ type: 'locks', locks: coord.listLocks() }));
bus.on('board', (projectId) => broadcast({ type: 'board', projectId, board: coord.board(projectId) }));
bus.on('activity', (projectId, entry) => broadcast({ type: 'activity', projectId, entry }));

// ---------- démarrage ----------

function openPath(p) {
  if (IS_WIN) execFile('explorer.exe', [p]);
  else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [p], () => {});
}

function openApp(url) {
  if (NO_OPEN) return;
  if (IS_WIN) {
    // Edge en mode « application » : une vraie fenêtre sans barre d'adresse.
    exec(`start "" msedge --app=${url}`, (err) => err && exec(`start "" "${url}"`));
  } else if (process.platform === 'darwin') {
    execFile('open', ['-na', 'Google Chrome', '--args', `--app=${url}`], (err) => err && execFile('open', [url]));
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    try {
      const r = await fetch(`${URL_BASE}/api/ping`);
      const j = await r.json();
      if (j.app === 'roswarm') {
        console.log('RoSwarm tourne déjà : ouverture de la fenêtre.');
        openApp(URL_BASE);
        process.exit(0);
      }
    } catch {}
    console.error(`Le port ${PORT} est déjà utilisé. Lance avec ROSWARM_PORT=34901 (et règle le même port dans le plugin).`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  writeConnectionFile(PORT);
  const active = projects.activeId();
  if (active) sync.forProject(active);
  console.log(`\n  RoSwarm ${VERSION} — ${URL_BASE}\n  Laisse cette fenêtre ouverte pendant que tu travailles.\n`);
  openApp(URL_BASE);
});

function shutdown() {
  agents.killAll();
  sync.stopAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
