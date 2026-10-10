// Test de bout en bout : serveur + pont MCP + faux plugin Roblox Studio + terminaux.
// Lancer : npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import WebSocket from 'ws';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 34950 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-test-'));
const PROJECT_DIR = path.join(HOME, 'mon-jeu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let token;
let project;
const studio = { received: [], running: true };

async function api(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-roswarm-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error('Délai dépassé');
}

// ---- faux plugin Studio : même protocole que plugin/RoSwarm.lua ----
const fakeTools = {
  get_tree: () => 'Workspace [Workspace]\n  Baseplate [Part]\nServerScriptService [ServerScriptService]',
  pull_scripts: () => ({ scripts: [{ path: ['ServerScriptService', 'Main'], className: 'Script', source: 'print("hello")' }], total: 1 }),
  sync_upsert: (a) => ({ updated: a.items.length, errors: [] }),
  list_children: () => [{ name: 'Workspace', className: 'Workspace', childCount: 1, path: 'Workspace', isScript: false }],
};

async function pluginPost(route, body) {
  const r = await fetch(BASE + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

async function runFakeStudio() {
  while (studio.running) {
    const data = await pluginPost('/plugin/poll', { sessionId: 'fake-session', placeName: 'MonJeu', placeId: 123 }).catch(() => null);
    if (!data) {
      await sleep(200);
      continue;
    }
    for (const cmd of data.commands || []) {
      studio.received.push(cmd);
      const fn = fakeTools[cmd.tool];
      const ok = !!fn;
      pluginPost('/plugin/result', { id: cmd.id, ok, result: ok ? fn(cmd.args) : undefined, error: ok ? undefined : 'inconnu' });
    }
  }
}

// ---- client MCP (comme le ferait Claude Code / Codex) ----
function mcpClient(agentId) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'bridge.cjs'), '--agent', agentId, '--home', HOME]);
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

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--no-open'], {
    env: { ...process.env, ROSWARM_PORT: String(PORT), ROSWARM_HOME: HOME, ROSWARM_PLUGIN_DIR: path.join(HOME, 'Plugins') },
    stdio: 'ignore',
  });
  await until(() => fetch(BASE + '/api/ping').then((r) => r.ok).catch(() => false));
  token = fs.readFileSync(path.join(HOME, 'token'), 'utf8').trim();
});

after(() => {
  studio.running = false;
  server?.kill();
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('sécurité : jeton exigé, navigateurs refusés sur les routes du plugin', async () => {
  assert.equal((await fetch(BASE + '/api/state')).status, 401);
  const r = await fetch(BASE + '/plugin/poll', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  });
  assert.equal(r.status, 403);
  const page = await (await fetch(BASE + '/')).text();
  assert.ok(page.includes(token), 'le jeton est injecté dans la page');
});

test('création de projet', async () => {
  project = await api('POST', '/api/projects', { name: 'Mon Jeu', dir: PROJECT_DIR });
  assert.ok(fs.existsSync(path.join(PROJECT_DIR, 'src', 'ServerScriptService')));
  assert.match(fs.readFileSync(path.join(PROJECT_DIR, 'AGENTS.md'), 'utf8'), /équipe d'agents IA/);
  assert.ok(fs.existsSync(path.join(PROJECT_DIR, 'CLAUDE.md')));
});

test('installation du plugin', async () => {
  const st = await api('POST', '/api/setup/plugin');
  assert.equal(st.installed, true);
  assert.equal(st.upToDate, true);
});

test('pont MCP : initialize, liste des outils, Studio absent', async () => {
  const c = mcpClient('nobody');
  const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'roswarm');
  assert.match(init.result.instructions, /TEAM/);
  const tools = await c.request('tools/list', {});
  const names = tools.result.tools.map((t) => t.name);
  for (const n of ['run_luau', 'get_tree', 'claim', 'board_read', 'task_create', 'asset_search']) assert.ok(names.includes(n), n);
  const r = await c.call('get_tree');
  assert.equal(r.isError, true);
  assert.match(r.text, /pas connecté/);
  c.close();
});

test('Studio se connecte : import initial des scripts, outils relayés, sync des fichiers', async () => {
  runFakeStudio();
  await until(async () => (await api('GET', '/api/state')).studio.connected);
  // src/ était vide -> import depuis Studio
  const mainFile = path.join(PROJECT_DIR, 'src', 'ServerScriptService', 'Main.server.luau');
  await until(() => fs.existsSync(mainFile));
  assert.equal(fs.readFileSync(mainFile, 'utf8'), 'print("hello")');

  const c = mcpClient('nobody');
  const r = await c.call('get_tree', { path: 'game' });
  assert.equal(r.isError, false);
  assert.match(r.text, /Baseplate/);
  c.close();

  // un fichier écrit par un agent part dans Studio
  fs.mkdirSync(path.join(PROJECT_DIR, 'src', 'ReplicatedStorage'), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, 'src', 'ReplicatedStorage', 'Config.luau'), 'return { coins = 10 }');
  const cmd = await until(() =>
    studio.received.find((x) => x.tool === 'sync_upsert' && x.args.items.some((i) => i.path.join('/') === 'ReplicatedStorage/Config')),
  );
  assert.equal(cmd.args.items.find((i) => i.path.at(-1) === 'Config').className, 'ModuleScript');

  // modification faite dans Studio -> fichier
  await pluginPost('/plugin/changes', { items: [{ path: ['ServerScriptService', 'Main'], className: 'Script', source: 'print("modifié dans Studio")' }] });
  await until(() => fs.readFileSync(mainFile, 'utf8').includes('modifié dans Studio'));
});

test('plusieurs agents : terminaux, réservations, hooks, tableau de tâches', async () => {
  const a1 = await api('POST', '/api/agents', { projectId: project.id, type: 'shell' });
  const a2 = await api('POST', '/api/agents', { projectId: project.id, type: 'shell' });
  assert.equal(a1.name, '#1 Terminal');
  assert.equal(a2.name, '#2 Terminal');

  // le terminal fonctionne vraiment
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`, { origin: BASE });
  let output = '';
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if ((m.type === 'term' || m.type === 'replay') && m.agentId === a1.id) output += m.data;
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'attach', agentId: a1.id }));
  await sleep(500);
  await api('POST', `/api/agents/${a1.id}/send`, { text: 'echo roswarm-$((40+2))' });
  await until(() => output.includes('roswarm-42'));
  ws.close();

  const c1 = mcpClient(a1.id);
  const c2 = mcpClient(a2.id);
  let r = await c1.call('claim', { resources: ['src/ServerScriptService/Shop.server.luau'], note: 'boutique' });
  assert.equal(r.isError, false, r.text);
  r = await c2.call('claim', { resources: ['src/ServerScriptService/Shop.server.luau'] });
  assert.equal(r.isError, true);
  assert.match(r.text, /#1 Terminal/);

  // hook Claude Code : écriture refusée sur un fichier réservé par un autre agent
  const hook = await api('POST', '/api/hook', {
    agentId: a2.id,
    event: 'pre',
    payload: { tool_name: 'Write', tool_input: { file_path: path.join(PROJECT_DIR, 'src/ServerScriptService/Shop.server.luau') } },
  });
  assert.equal(hook.block, true);

  // set_script_source -> fichier dans src/ + envoi à Studio
  r = await c1.call('set_script_source', { path: 'ServerScriptService/Shop', source: '-- boutique' });
  assert.equal(r.isError, false, r.text);
  assert.equal(fs.readFileSync(path.join(PROJECT_DIR, 'src/ServerScriptService/Shop.server.luau'), 'utf8'), '-- boutique');
  await until(() => studio.received.some((x) => x.tool === 'sync_upsert' && x.args.items.some((i) => i.source === '-- boutique')));

  r = await c1.call('task_create', { title: 'Faire la map', assignee: '#2' });
  assert.match(r.text, /Tâche #1/);
  r = await c2.call('task_update', { id: 1, status: 'doing' });
  r = await c2.call('post_message', { text: 'Je fais la map' });
  r = await c2.call('board_read');
  assert.match(r.text, /Faire la map/);
  assert.match(r.text, /Je fais la map/);
  r = await c2.call('agents_status');
  assert.match(r.text, /#2 Terminal ← toi/);
  assert.match(r.text, /Shop\.server\.luau/);

  await c1.call('release');
  r = await c2.call('claim', { resources: ['src/ServerScriptService/Shop.server.luau'] });
  assert.equal(r.isError, false);
  c1.close();
  c2.close();

  await api('DELETE', '/api/agents/' + a1.id);
  await api('DELETE', '/api/agents/' + a2.id);
});

test('équipe de Claude : rôles, modèle, mode d’autorisation', { skip: !whichSync('claude') && 'Claude Code non installé' }, async () => {
  const team = await api('POST', `/api/projects/${project.id}/team`, {
    permissionMode: 'acceptEdits',
    members: [{ role: 'chef', model: 'opus' }, { role: 'map' }],
  });
  assert.equal(team.length, 2);
  assert.match(team[0].name, /^#\d+ Claude · Chef$/);
  assert.match(team[1].name, /Claude · Map$/);
  assert.match(team[0].command, /--append-system-prompt/);
  assert.match(team[0].command, /CHEF D/);
  assert.match(team[0].command, /--model opus/);
  assert.match(team[0].command, /--permission-mode acceptEdits/);
  assert.doesNotMatch(team[1].command, /--model/);
  const settings = JSON.parse(fs.readFileSync(path.join(HOME, 'run', team[0].id, 'settings.json'), 'utf8'));
  assert.ok(settings.hooks.PreToolUse && settings.hooks.SessionStart && settings.hooks.Stop);
  for (const a of team) await api('DELETE', '/api/agents/' + a.id);
});

test('notifications : tâche assignée -> tapée chez l’agent, tâche finie -> le chef est prévenu', { timeout: 60000 }, async (t) => {
  const chef = await api('POST', '/api/agents', { projectId: project.id, type: 'shell', role: 'chef' });
  const dev = await api('POST', '/api/agents', { projectId: project.id, type: 'shell', role: 'gameplay' });
  assert.match(chef.name, /Terminal · Chef$/);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`, { origin: BASE });
  const out = { [chef.id]: '', [dev.id]: '' };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if ((m.type === 'term' || m.type === 'replay') && out[m.agentId] !== undefined) out[m.agentId] += m.data;
  });
  await new Promise((r) => ws.on('open', r));

  const cChef = mcpClient(chef.id);
  const cDev = mcpClient(dev.id);
  t.after(() => {
    cChef.close();
    cDev.close();
    ws.close();
  });
  let r = await cChef.call('task_create', { title: 'Coder le jardin de pièces', assignee: '#' + dev.num });
  assert.match(r.text, /envoyée à/);
  assert.equal((await api('GET', '/api/state')).agents.find((a) => a.id === dev.id).inbox, 1);
  await until(() => out[dev.id].includes('[RoSwarm] Nouvelle tâche'), 30000);

  const taskId = Number(r.text.match(/#(\d+)/)[1]);
  r = await cDev.call('task_update', { id: taskId, status: 'done', note: 'fini' });
  assert.equal(r.isError, false, r.text);
  await until(() => out[chef.id].includes('a terminé la tâche'), 30000);

  r = await cDev.call('post_message', { text: 'coucou chef', to: '#' + chef.num });
  assert.match(r.text, /envoyé à/);
  cChef.close();
  cDev.close();
  ws.close();
  await api('DELETE', '/api/agents/' + chef.id);
  await api('DELETE', '/api/agents/' + dev.id);
});

function whichSync(bin) {
  return (process.env.PATH || '').split(path.delimiter).some((d) => fs.existsSync(path.join(d, bin)));
}
