// Outils communs aux tests : lancement d'un vrai serveur, client MCP, et plugin Studio simulé.
//
// FakeStudio reproduit le protocole et la sémantique de plugin/RoSwarm.lua (appairage, sessions, lastPollId,
// cache des résultats, numéros d'ordre, scripts marqués, suppression sûre). Il ne remplace pas un test dans
// un vrai Roblox Studio : voir docs/TESTS-STUDIO.md.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import net from 'node:net';
import { fnv1a } from '../server/syncCore.js';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Port libre attribué par le système (les fichiers de test tournent en parallèle). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function until(fn, ms = 10000, label = 'condition') {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(50);
  }
  throw new Error(`Délai dépassé en attendant : ${label}`);
}

/** Lance un vrai serveur RoSwarm. `home` permet de redémarrer sur le même état. */
export async function startServer({ home, port, env = {} } = {}) {
  home = home || fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-test-'));
  port = port || (await freePort());
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--no-open'], {
    env: {
      ...process.env,
      ROSWARM_PORT: String(port),
      ROSWARM_HOME: home,
      ROSWARM_PLUGIN_DIR: path.join(home, 'Plugins'),
      GEMINI_CLI_TRUSTED_FOLDERS_PATH: path.join(home, 'gemini-trust.json'),
      ...env,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  await until(() => fetch(base + '/api/ping').then((r) => r.ok).catch(() => false), 10000, 'démarrage du serveur');
  const token = fs.readFileSync(path.join(home, 'token'), 'utf8').trim();
  const srv = {
    home,
    port,
    base,
    token,
    proc,
    get stderr() {
      return stderr;
    },
    async api(method, url, body) {
      const r = await fetch(base + url, {
        method,
        headers: { 'content-type': 'application/json', 'x-roswarm-token': token },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(j.error || 'HTTP ' + r.status);
        e.status = r.status;
        throw e;
      }
      return j;
    },
    async stop() {
      if (proc.exitCode !== null) return;
      const done = new Promise((r) => proc.once('exit', r));
      proc.kill('SIGTERM');
      await done;
    },
  };
  return srv;
}

/** Requête brute vers une route du plugin. Renvoie { status, body }. */
export async function pluginRequest(base, route, body, headers = {}) {
  const r = await fetch(base + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Client MCP (comme Claude Code) qui passe par server/bridge.cjs. */
export function mcpClient(agentId, home) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'bridge.cjs'), '--agent', agentId, '--home', home]);
  const waiting = new Map();
  let id = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.(msg);
  });
  return {
    request(method, params) {
      const myId = ++id;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
      return new Promise((resolve) => waiting.set(myId, resolve));
    },
    async call(name, args = {}) {
      const r = await this.request('tools/call', { name, arguments: args });
      return { text: r.result.content[0].text, isError: r.result.isError };
    },
    close: () => child.kill(),
  };
}

/** Plugin Roblox Studio simulé, fidèle au protocole de plugin/RoSwarm.lua. */
export class FakeStudio {
  constructor(base, { placeName = 'MonJeu', instanceId = 'inst-' + Math.random().toString(16).slice(2) } = {}) {
    this.base = base;
    this.placeName = placeName;
    this.instanceId = instanceId;
    this.token = null;
    this.sessionId = null;
    this.lastPollId = 0;
    this.running = false;
    this.scripts = new Map(); // 'Service/A/B' -> { className, source, tagged, seq }
    this.received = []; // commandes reçues (y compris doublons)
    this.executed = new Map(); // id -> payload (cache comme le plugin)
    this.loseResponses = 0; // nombre de réponses de poll à « perdre »
    this.delays = []; // [{ match(cmd), ms }]
    this.failures = []; // [{ match(cmd), error }]
    this.stalls = []; // [match(cmd)] : jamais de réponse
    this.errors = [];
  }

  headers() {
    return this.token ? { 'x-roswarm-plugin': this.token } : {};
  }

  post(route, body) {
    return pluginRequest(this.base, route, body, this.headers());
  }

  /** Appairage complet : demande, approbation par l'interface (srv.api), récupération du jeton. */
  async pair(srv) {
    const requestId = 'req-' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    const r = await this.post('/plugin/pair', { requestId, code: '1234', placeName: this.placeName });
    if (r.status !== 200) throw new Error('pair: ' + JSON.stringify(r.body));
    await srv.api('POST', `/api/pairing/${requestId}/approve`);
    const st = await this.post('/plugin/pair-status', { requestId });
    this.token = st.body.token;
    return this.token;
  }

  async hello() {
    const r = await this.post('/plugin/hello', { instanceId: this.instanceId, placeName: this.placeName, placeId: 1, version: 'test' });
    if (r.status !== 200) throw new Error('hello: ' + JSON.stringify(r.body));
    if (!r.body.resumed) this.lastPollId = 0;
    this.sessionId = r.body.sessionId;
    return r.body;
  }

  start() {
    this.running = true;
    this.loop = this.run();
    return this;
  }

  async stop() {
    this.running = false;
    await this.loop?.catch(() => {});
  }

  async run() {
    while (this.running) {
      if (!this.sessionId) {
        try {
          await this.hello();
        } catch {
          await sleep(100);
          continue;
        }
      }
      let r;
      try {
        r = await this.post('/plugin/poll', { sessionId: this.sessionId, lastPollId: this.lastPollId });
      } catch {
        await sleep(100);
        continue;
      }
      if (!this.running) break;
      if (r.status === 401 && r.body.code === 'BAD_SESSION') {
        this.sessionId = null;
        continue;
      }
      if (r.status !== 200) {
        await sleep(100);
        continue;
      }
      if (this.loseResponses > 0 && r.body.commands.length) {
        this.loseResponses--; // la réponse « n'arrive pas » : on n'avance pas lastPollId
        continue;
      }
      this.lastPollId = r.body.pollId;
      for (const cmd of r.body.commands) this.handle(cmd);
    }
  }

  async handle(cmd) {
    this.received.push(cmd);
    if (this.executed.has(cmd.id)) {
      const p = this.executed.get(cmd.id);
      if (p) await this.post('/plugin/result', { ...p, sessionId: this.sessionId });
      return;
    }
    this.executed.set(cmd.id, null);
    if (this.stalls.some((m) => m(cmd))) return;
    const d = this.delays.find((x) => x.match(cmd));
    if (d) await sleep(d.ms);
    let payload;
    const f = this.failures.find((x) => x.match(cmd));
    try {
      if (f) throw new Error(f.error);
      const fn = this['tool_' + cmd.tool];
      if (!fn) throw new Error('Outil inconnu : ' + cmd.tool);
      payload = { id: cmd.id, ok: true, result: fn.call(this, cmd.args || {}) };
    } catch (e) {
      payload = { id: cmd.id, ok: false, error: e.message };
    }
    this.executed.set(cmd.id, payload);
    const r = await this.post('/plugin/result', { ...payload, sessionId: this.sessionId });
    if (r.status !== 200) this.errors.push(r);
  }

  /** Simule une modification faite à la main dans Studio sur un script synchronisé. */
  async editInStudio(key, source) {
    const s = this.scripts.get(key);
    s.source = source;
    return this.post('/plugin/changes', { sessionId: this.sessionId, items: [{ path: key.split('/'), className: s.className, source }] });
  }

  // ----- outils (même sémantique que le plugin) -----
  tool_sync_upsert({ items }) {
    return {
      items: items.map((it) => {
        if (!Array.isArray(it.path) || it.path.length < 2) return { status: 'error', error: 'chemin invalide' };
        const key = it.path.join('/');
        const cur = this.scripts.get(key);
        if (cur && it.seq && cur.seq > it.seq) return { status: 'stale' };
        const res = { status: 'applied' };
        if (cur && !cur.tagged && fnv1a(cur.source) !== fnv1a(it.source)) res.replacedUntagged = cur.source;
        this.scripts.set(key, { className: it.className, source: it.source, tagged: true, seq: it.seq || 0 });
        if (it.source.includes('@@SYNTAXE@@')) res.syntaxError = 'Expected identifier, got @@SYNTAXE@@';
        return res;
      }),
    };
  }
  tool_sync_delete({ path: p }) {
    const key = p.join('/');
    const cur = this.scripts.get(key);
    if (!cur) return { status: 'missing' };
    if (!cur.tagged) return { status: 'kept', reason: 'non synchronisé' };
    this.scripts.delete(key);
    return { status: 'deleted' };
  }
  tool_sync_manifest() {
    return {
      scripts: [...this.scripts]
        .filter(([, s]) => s.tagged)
        .map(([k, s]) => ({ path: k.split('/'), className: s.className, hash: fnv1a(s.source) })),
    };
  }
  tool_get_sources({ paths }) {
    return { sources: paths.map((p) => (this.scripts.has(p.join('/')) ? { source: this.scripts.get(p.join('/')).source } : { missing: true })) };
  }
  tool_pull_scripts() {
    const out = [...this.scripts].map(([k, s]) => {
      s.tagged = true;
      return { path: k.split('/'), className: s.className, source: s.source };
    });
    return { scripts: out, total: out.length };
  }
  tool_check_scripts({ paths }) {
    const keys = paths ? paths.map((p) => p.join('/')) : [...this.scripts.keys()];
    const errors = keys.filter((k) => this.scripts.get(k)?.source.includes('@@SYNTAXE@@')).map((k) => ({ path: k, error: 'syntaxe' }));
    return { checked: keys.length, errors };
  }
  tool_get_tree() {
    return [...this.scripts.keys()].join('\n') || 'Workspace [Workspace]';
  }
  tool_list_children() {
    return [{ name: 'Workspace', className: 'Workspace', childCount: 0, path: 'Workspace', isScript: false }];
  }
  tool_run_luau({ code }) {
    return { output: 'ran ' + code.length, returns: [] };
  }
}

/** Projet de test avec un dossier temporaire. */
export async function makeProject(srv, name = 'Jeu', files = {}) {
  const dir = path.join(srv.home, 'proj-' + Math.random().toString(16).slice(2));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, 'src', rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', rel), content);
  }
  const p = await srv.api('POST', '/api/projects', { name, dir });
  return { ...p, dir, src: path.join(dir, 'src') };
}
