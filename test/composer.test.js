// Zone de message : pièces jointes, réglages des agents (modèle, effort, mode) avec reprise de la conversation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer, makeProject, until } from './helpers.js';

let srv;
let project;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

before(async () => {
  srv = await startServer();
  project = await makeProject(srv, 'Composeur');
});
after(() => srv.stop());

test('pièces jointes : enregistrées dans .roswarm/uploads, types et tailles contrôlés', async () => {
  const r = await srv.api('POST', `/api/projects/${project.id}/uploads`, { name: 'Capture écran.png', mime: 'image/png', data: PNG_1PX });
  assert.ok(r.path.startsWith(path.join(project.dir, '.roswarm', 'uploads') + path.sep));
  assert.match(path.basename(r.path), /_Capture_ecran\.png$/);
  assert.deepEqual(fs.readFileSync(r.path), Buffer.from(PNG_1PX, 'base64'));
  await assert.rejects(srv.api('POST', `/api/projects/${project.id}/uploads`, { name: 'x.exe', mime: 'application/x-msdownload', data: 'AAAA' }), /non pris en charge/);
  await assert.rejects(srv.api('POST', `/api/projects/${project.id}/uploads`, { name: 'vide.png', mime: 'image/png', data: '' }), /vide ou trop gros/);
  const big = Buffer.alloc(21 * 1024 * 1024).toString('base64');
  await assert.rejects(srv.api('POST', `/api/projects/${project.id}/uploads`, { name: 'gros.png', mime: 'image/png', data: big }), /trop gros/);
});

test('message avec pièces jointes : chemins transmis à l’agent, fichiers étrangers ignorés', async () => {
  const up = await srv.api('POST', `/api/projects/${project.id}/uploads`, { name: 'map.png', mime: 'image/png', data: PNG_1PX });
  const a = await srv.api('POST', '/api/agents', { projectId: project.id, type: 'shell' });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?token=${srv.token}`, { origin: srv.base });
  let out = '';
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if ((m.type === 'term' || m.type === 'replay') && m.agentId === a.id) out += m.data;
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'attach', agentId: a.id }));
  await srv.api('POST', `/api/agents/${a.id}/send`, {
    text: 'echo regarde',
    attachments: [
      { path: up.path, note: 'vidéo « test.mp4 » (3.0 s), image 1/4 à 0.4 s' },
      { path: '/etc/passwd' },
    ],
  });
  await until(() => out.includes('Pièces jointes'), 8000, 'message reçu');
  const flat = out.replace(/\r?\n/g, '');
  assert.ok(flat.includes(path.basename(up.path)), 'chemin de la pièce jointe transmis');
  assert.ok(flat.includes('image 1/4 à 0.4 s'), 'note de la vidéo transmise');
  assert.equal(flat.includes('/etc/passwd'), false, 'un fichier hors des pièces jointes du projet est ignoré');
  ws.close();
  await assert.rejects(srv.api('POST', `/api/agents/${a.id}/config`, { model: 'opus' }), /que pour Claude/);
  await srv.api('DELETE', '/api/agents/' + a.id);
});

const hasClaude = (process.env.PATH || '').split(path.delimiter).some((d) => fs.existsSync(path.join(d, 'claude')));

test('réglages d’un Claude : modèle, effort, mode ; la conversation est reprise après le changement', { skip: !hasClaude && 'Claude Code non installé' }, async () => {
  const a = await srv.api('POST', '/api/agents', { projectId: project.id, type: 'claude', model: 'sonnet', effort: 'medium' });
  assert.match(a.command, /--model sonnet/);
  assert.match(a.command, /--effort medium/);
  const sid = a.command.match(/--session-id ([0-9a-f-]{36})/)[1];
  assert.equal(a.mode, 'autonome');
  // pas encore de conversation : un changement redémarre sur une nouvelle session
  await srv.api('POST', `/api/agents/${a.id}/send`, { text: 'bonjour' }); // la conversation commence
  const r = await srv.api('POST', `/api/agents/${a.id}/config`, { model: 'opus', effort: 'max', mode: 'plan' });
  assert.ok(['applied', 'queued'].includes(r.result));
  const st = await until(async () => {
    const x = (await srv.api('GET', '/api/state')).agents.find((y) => y.id === a.id);
    return x && x.command.includes('--resume') ? x : null;
  }, 15000, 'redémarrage avec reprise');
  assert.match(st.command, new RegExp(`--resume ${sid}`), 'même conversation');
  assert.match(st.command, /--model opus/);
  assert.match(st.command, /--effort max/);
  assert.match(st.command, /--permission-mode plan/);
  assert.equal(st.mode, 'plan');
  await assert.rejects(srv.api('POST', `/api/agents/${a.id}/config`, { model: 'gpt-9' }), /Modèle inconnu/);
  await assert.rejects(srv.api('POST', `/api/agents/${a.id}/config`, { effort: 'enorme' }), /Effort inconnu/);
  await srv.api('DELETE', '/api/agents/' + a.id);
});
