// Coordination entre agents (vrais terminaux + vrai pont MCP) : réservations concurrentes, agents interrompus,
// cycle de vie des tâches, écrasements, rattachement au bon projet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, makeProject, mcpClient } from './helpers.js';

let srv;
let project;
const clients = [];
const agentIds = [];
const client = (id) => {
  const c = mcpClient(id, srv.home);
  clients.push(c);
  return c;
};
const spawnAgent = async (extra = {}) => {
  const a = await srv.api('POST', '/api/agents', { projectId: project.id, type: 'shell', ...extra });
  agentIds.push(a.id);
  return a;
};
const inbox = async (id) => (await srv.api('GET', '/api/state')).agents.find((a) => a.id === id)?.inbox ?? 0;

before(async () => {
  srv = await startServer();
  project = await makeProject(srv, 'Coordination');
});

after(async () => {
  for (const c of clients) c.close();
  for (const id of agentIds) await srv.api('DELETE', '/api/agents/' + id).catch(() => {});
  await srv.stop();
});

test('deux agents réservent le même fichier au même instant : exactement un gagne (20 essais)', async () => {
  const a = await spawnAgent();
  const b = await spawnAgent();
  const ca = client(a.id);
  const cb = client(b.id);
  for (let i = 0; i < 20; i++) {
    const file = `src/ServerScriptService/F${i}.server.luau`;
    const [ra, rb] = await Promise.all([ca.call('claim', { resources: [file] }), cb.call('claim', { resources: [file] })]);
    assert.equal([ra, rb].filter((r) => !r.isError).length, 1, `essai ${i}`);
    const loser = ra.isError ? ra : rb;
    assert.match(loser.text, /réservé par #\d+ Terminal/, 'le refus dit qui tient le fichier');
  }
  await ca.call('release');
  await cb.call('release');
});

test('agent fermé en pleine tâche : réservations libérées, tâche remise à faire, créateur prévenu', async () => {
  const chef = await spawnAgent({ role: 'chef' });
  const dev = await spawnAgent({ role: 'gameplay' });
  const cChef = client(chef.id);
  const cDev = client(dev.id);
  const r = await cChef.call('task_create', { title: 'Boutique', assignee: '#' + dev.num });
  const id = Number(r.text.match(/#(\d+)/)[1]);
  await cDev.call('task_update', { id, status: 'doing' });
  assert.equal((await cDev.call('claim', { resources: ['src/ServerScriptService/Shop.server.luau'] })).isError, false);
  const before = await inbox(chef.id);
  await srv.api('DELETE', '/api/agents/' + dev.id);
  const state = await srv.api('GET', '/api/state');
  assert.equal(state.locks.some((l) => l.agentId === dev.id), false, 'réservations libérées');
  const t = state.board.tasks.find((x) => x.id === id);
  assert.equal(t.status, 'todo');
  assert.match(t.notes.at(-1).text, /a été fermé/);
  assert.equal(await inbox(chef.id), before + 1, 'le chef est prévenu');
  // le fichier est de nouveau disponible
  assert.equal((await cChef.call('claim', { resources: ['src/ServerScriptService/Shop.server.luau'] })).isError, false);
  await cChef.call('release');
});

test('cycle de vie : dépendances, « à valider », validation par le créateur seulement, double fin sans effet', async () => {
  const chef = await spawnAgent({ role: 'chef' });
  const dev = await spawnAgent();
  const other = await spawnAgent();
  const cChef = client(chef.id);
  const cDev = client(dev.id);
  const cOther = client(other.id);
  const base = Number((await cChef.call('task_create', { title: 'Modules partagés' })).text.match(/#(\d+)/)[1]);
  const r = await cChef.call('task_create', { title: 'Gameplay', assignee: '#' + dev.num, depends_on: [base], acceptance: 'les pièces apparaissent' });
  const id = Number(r.text.match(/#(\d+)/)[1]);
  let x = await cDev.call('task_update', { id, status: 'doing' });
  assert.equal(x.isError, true);
  assert.match(x.text, /dépendances/);
  await cChef.call('task_update', { id: base, status: 'done' });
  x = await cDev.call('task_update', { id, status: 'doing' });
  assert.equal(x.isError, false, x.text);
  x = await cDev.call('task_update', { id, status: 'done', note: 'fait' });
  assert.match(x.text, /à valider/);
  x = await cDev.call('task_update', { id, status: 'done' });
  assert.equal(x.isError, true, 'le développeur ne peut pas valider lui-même');
  x = await cOther.call('task_update', { id, status: 'done' });
  assert.match(x.text, /Seul/);
  x = await cChef.call('task_update', { id, status: 'done' });
  assert.match(x.text, /Fait/);
  x = await cChef.call('task_update', { id, status: 'done' });
  assert.match(x.text, /inchangée/, 'terminer deux fois ne fait rien');
  const board = (await cChef.call('board_read')).text;
  assert.match(board, /critères d'acceptation : les pièces apparaissent/);
});

test('écrasement : un agent modifie un fichier écrit récemment par un autre -> l’autre est prévenu', async () => {
  const a = await spawnAgent();
  const b = await spawnAgent();
  const file = path.join(project.dir, 'src/ServerScriptService/Commun.server.luau');
  const post = (agentId) =>
    srv.api('POST', '/api/hook', { agentId, event: 'post', payload: { tool_name: 'Write', tool_input: { file_path: file } } });
  await post(a.id);
  const before = await inbox(a.id);
  await post(b.id);
  assert.equal(await inbox(a.id), before + 1);
  const act = (await srv.api('GET', '/api/state')).activity.map((e) => e.text).join('\n');
  assert.match(act, /⚠ a modifié src\/ServerScriptService\/Commun\.server\.luau/);
});

test('un agent d’un autre projet ne peut pas piloter le Studio relié au projet actif', async () => {
  const other = await makeProject(srv, 'Autre projet'); // devient le projet actif
  const a = await spawnAgent(); // agent du premier projet
  const c = client(a.id);
  const r = await c.call('run_luau', { code: 'workspace:ClearAllChildren()' });
  assert.equal(r.isError, true);
  assert.match(r.text, /relié au projet « Autre projet »/);
  await srv.api('POST', `/api/projects/${project.id}/open`);
  void other;
});
