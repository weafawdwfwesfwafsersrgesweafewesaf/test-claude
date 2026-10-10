// Test de bout en bout : serveur + pont MCP + plugin Studio simulé (appairé) + terminaux.
// Lancer : npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer, FakeStudio, mcpClient as bridgeClient, until, sleep, pluginRequest } from './helpers.js';

let srv;
let HOME;
let BASE;
let PORT;
let token;
let project;
let PROJECT_DIR;
let studio;
const api = (...a) => srv.api(...a);
const mcpClient = (id) => bridgeClient(id, HOME);

before(async () => {
  srv = await startServer();
  ({ home: HOME, base: BASE, port: PORT, token } = srv);
  PROJECT_DIR = path.join(HOME, 'mon-jeu');
});

after(async () => {
  await studio?.stop();
  await srv?.stop();
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('sécurité : jeton exigé, navigateurs refusés sur les routes du plugin', async () => {
  assert.equal((await fetch(BASE + '/api/state')).status, 401);
  const r = await pluginRequest(BASE, '/plugin/poll', {}, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  const page = await (await fetch(BASE + '/')).text();
  assert.ok(page.includes(token), 'le jeton est injecté dans la page');
});

test('création de projet', async () => {
  project = await api('POST', '/api/projects', { name: 'Mon Jeu', dir: PROJECT_DIR });
  assert.ok(fs.existsSync(path.join(PROJECT_DIR, 'src', 'ServerScriptService')));
  assert.match(fs.readFileSync(path.join(PROJECT_DIR, 'AGENTS.md'), 'utf8'), /équipe d'agents IA/);
  assert.ok(fs.existsSync(path.join(PROJECT_DIR, 'CLAUDE.md')));
  // skills installés là où Claude Code les découvre, avec l'en-tête YAML en première ligne
  const skillsDir = path.join(PROJECT_DIR, '.claude', 'skills');
  const names = fs.readdirSync(skillsDir).sort();
  for (const n of ['coordination-equipe', 'memoire-projet', 'reponses-courtes', 'roblox-luau', 'roblox-map', 'sobriete-code']) assert.ok(names.includes(n), n);
  for (const n of names) {
    const text = fs.readFileSync(path.join(skillsDir, n, 'SKILL.md'), 'utf8');
    assert.match(text, new RegExp(`^---\\nname: ${n}\\ndescription: .+\\n---\\n<!-- roswarm:auto`), n);
  }
  assert.ok(fs.existsSync(path.join(PROJECT_DIR, 'MEMOIRE.md')));
  // un skill personnalisé (marqueur retiré) n'est jamais écrasé
  const custom = path.join(skillsDir, 'roblox-map', 'SKILL.md');
  fs.writeFileSync(custom, '---\nname: roblox-map\ndescription: perso\n---\nma version');
  await api('POST', `/api/projects/${project.id}/open`);
  assert.equal(fs.readFileSync(custom, 'utf8'), '---\nname: roblox-map\ndescription: perso\n---\nma version');
  assert.ok((await api('GET', '/api/state')).skills.length >= 12);
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

test('Studio se connecte (après appairage) : import initial, outils relayés, sync des fichiers', async () => {
  studio = new FakeStudio(BASE);
  studio.scripts.set('ServerScriptService/Main', { className: 'Script', source: 'print("hello")', tagged: false, seq: 0 });
  await studio.pair(srv);
  studio.start();
  await until(async () => (await api('GET', '/api/state')).studio.connected, 10000, 'connexion de Studio');
  // src/ était vide et Studio n'avait aucun script synchronisé -> import depuis Studio
  const mainFile = path.join(PROJECT_DIR, 'src', 'ServerScriptService', 'Main.server.luau');
  await until(() => fs.existsSync(mainFile), 10000, 'import');
  assert.equal(fs.readFileSync(mainFile, 'utf8'), 'print("hello")');

  const c = mcpClient('nobody');
  const r = await c.call('get_tree', { path: 'game' });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /ServerScriptService\/Main/);
  c.close();

  // un fichier écrit par un agent part dans Studio, et n'est « à jour » qu'après confirmation
  fs.mkdirSync(path.join(PROJECT_DIR, 'src', 'ReplicatedStorage'), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, 'src', 'ReplicatedStorage', 'Config.luau'), 'return { coins = 10 }');
  await until(() => studio.scripts.get('ReplicatedStorage/Config')?.source === 'return { coins = 10 }', 10000, 'envoi de Config');
  assert.equal(studio.scripts.get('ReplicatedStorage/Config').className, 'ModuleScript');

  // modification faite dans Studio -> fichier
  const r2 = await studio.editInStudio('ServerScriptService/Main', 'print("modifié dans Studio")');
  assert.deepEqual(r2.body.results, ['written']);
  await until(() => fs.readFileSync(mainFile, 'utf8').includes('modifié dans Studio'), 5000, 'écriture du fichier');
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
  await until(() => output.includes('roswarm-42'), 10000, 'sortie du terminal');
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
  assert.match(r.text, /confirmé par Studio/);
  assert.equal(studio.scripts.get('ServerScriptService/Shop').source, '-- boutique');

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
  await until(() => out[dev.id].includes('[RoSwarm] Nouvelle tâche'), 30000, 'notification de tâche');

  const taskId = Number(r.text.match(/#(\d+)/)[1]);
  r = await cDev.call('task_update', { id: taskId, status: 'done', note: 'fini' });
  assert.equal(r.isError, false, r.text);
  // terminée par un autre que le créateur -> « à valider », et le chef est prévenu
  assert.match(r.text, /à valider/);
  await until(() => out[chef.id].includes('dit avoir fini'), 30000);
  r = await cChef.call('task_update', { id: taskId, status: 'done' });
  assert.match(r.text, /Fait/);

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
