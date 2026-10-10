// Sécurité des routes du plugin et de l'API, contre un vrai serveur.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { startServer, FakeStudio, makeProject, pluginRequest, until, sleep } from './helpers.js';

let srv;
let project;
const leaks = [];
const check = (r) => {
  // aucune réponse ne doit contenir le jeton de l'application
  if (JSON.stringify(r.body).includes(srv.token)) leaks.push(r);
  return r;
};
const P = (route, body, headers) => pluginRequest(srv.base, route, body, headers).then(check);

before(async () => {
  srv = await startServer({ env: { ROSWARM_SESSION_TTL_MS: '1500', ROSWARM_POLL_HOLD_MS: '300' } });
  project = await makeProject(srv, 'Sécu', { 'ServerScriptService/Main.server.luau': 'print(1)' });
});

after(async () => {
  await srv.stop();
  assert.deepEqual(leaks, [], 'le jeton de l’application ne doit jamais apparaître dans une réponse du plugin');
});

describe('client sans autorisation', () => {
  const routes = ['/plugin/hello', '/plugin/poll', '/plugin/result', '/plugin/log', '/plugin/changes'];

  test('aucune route ne répond sans jeton de plugin, avec un faux jeton, ou avec le jeton de l’application', async () => {
    for (const route of routes) {
      for (const headers of [{}, { 'x-roswarm-plugin': 'f'.repeat(64) }, { 'x-roswarm-plugin': srv.token }, { 'x-roswarm-token': srv.token }]) {
        const r = await P(route, { sessionId: 'x', items: [{ path: ['ServerScriptService', 'Evil'], className: 'Script', source: 'evil' }] }, headers);
        assert.equal(r.status, 401, `${route} ${JSON.stringify(Object.keys(headers))}`);
      }
    }
    assert.equal(fs.existsSync(path.join(project.src, 'ServerScriptService', 'Evil.server.luau')), false, 'aucun script injecté');
  });

  test('supprimer ou modifier les en-têtes ne contourne rien', async () => {
    assert.equal((await P('/plugin/poll', {}, { origin: 'http://127.0.0.1:' + srv.port })).status, 403, 'Origin refusé même local');
    const raw = await fetch(srv.base + '/plugin/poll', { method: 'POST', body: '{}' }); // sans Content-Type JSON
    assert.equal(raw.status, 403);
    const get = await fetch(srv.base + '/plugin/poll');
    assert.equal(get.status, 403);
    const text = await fetch(srv.base + '/plugin/hello', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(text.status, 403);
  });

  test('ne peut pas consulter les sessions ni approuver sa propre demande d’appairage', async () => {
    const requestId = 'attaquant00000000000000000';
    assert.equal((await P('/plugin/pair', { requestId, code: '9999', placeName: 'pirate' })).status, 200);
    assert.equal((await P('/plugin/pair-status', { requestId })).body.status, 'pending');
    const approve = await fetch(`${srv.base}/api/pairing/${requestId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' } });
    assert.equal(approve.status, 401, 'approbation réservée à l’interface');
    assert.equal((await fetch(srv.base + '/api/state')).status, 401);
    assert.equal((await P('/plugin/pair-status', { requestId })).body.token, undefined);
    await srv.api('POST', `/api/pairing/${requestId}/reject`);
    assert.equal((await P('/plugin/pair-status', { requestId })).body.status, 'rejected');
  });

  test('données malformées : refusées proprement', async () => {
    const bad = async (body, headers = {}) =>
      fetch(srv.base + '/plugin/pair', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }).then((r) => r.status);
    assert.equal(await bad('{pas du json'), 400);
    assert.equal(await bad('[1,2,3]'), 400);
    assert.equal(await bad('"texte"'), 400);
    assert.equal(await bad(JSON.stringify({ requestId: 42, code: 1234 })), 400);
    assert.equal(await bad(JSON.stringify({ requestId: 'x'.repeat(30), code: '1234', pad: 'y'.repeat(9 * 1024 * 1024) })), 413);
  });
});

describe('plugin appairé', () => {
  let a;
  let b;
  before(async () => {
    a = new FakeStudio(srv.base, { placeName: 'A' });
    await a.pair(srv);
    b = new FakeStudio(srv.base, { placeName: 'B' });
    await b.pair(srv);
  });

  test('une session ne peut pas être utilisée avec le jeton d’un autre plugin', async () => {
    await a.hello();
    const r = await pluginRequest(srv.base, '/plugin/poll', { sessionId: a.sessionId, lastPollId: 0 }, { 'x-roswarm-plugin': b.token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'BAD_SESSION');
    const forged = await pluginRequest(srv.base, '/plugin/poll', { sessionId: 'deadbeef'.repeat(4), lastPollId: 0 }, { 'x-roswarm-plugin': a.token });
    assert.equal(forged.body.code, 'BAD_SESSION');
  });

  test('faux résultats : commande d’une autre session refusée, identifiant inconnu ignoré sans effet', async () => {
    a.start();
    await until(async () => (await srv.api('GET', '/api/state')).studio.connected, 5000, 'connexion de A');
    a.stalls.push((c) => c.tool === 'get_tree'); // A reçoit la commande mais ne répond pas
    const call = srv.api('POST', '/api/studio/raw', { tool: 'get_tree', args: {} }).catch((e) => e);
    const cmd = await until(() => a.received.find((c) => c.tool === 'get_tree'), 5000, 'livraison');
    await b.hello();
    const wrong = await pluginRequest(srv.base, '/plugin/result', { sessionId: b.sessionId, id: cmd.id, ok: true, result: 'falsifié' }, { 'x-roswarm-plugin': b.token });
    assert.equal(wrong.status, 403);
    const unknown = await pluginRequest(srv.base, '/plugin/result', { sessionId: a.sessionId, id: 'inconnu', ok: true, result: 'x' }, { 'x-roswarm-plugin': a.token });
    assert.equal(unknown.body.ignored, true);
    // le vrai résultat est accepté une fois, le doublon est ignoré
    const real = await pluginRequest(srv.base, '/plugin/result', { sessionId: a.sessionId, id: cmd.id, ok: true, result: 'vrai' }, { 'x-roswarm-plugin': a.token });
    assert.equal(real.status, 200);
    const dup = await pluginRequest(srv.base, '/plugin/result', { sessionId: a.sessionId, id: cmd.id, ok: true, result: 'doublon' }, { 'x-roswarm-plugin': a.token });
    assert.equal(dup.body.ignored, true);
    assert.equal((await call).result, 'vrai');
    a.stalls.length = 0;
  });

  test('changements Studio : chemins hors projet, classes inconnues et contenus géants refusés', async () => {
    const items = [
      { path: ['..', '..', 'evil'], className: 'Script', source: 'x' },
      { path: ['ServerScriptService', '..', '..', 'evil'], className: 'Script', source: 'x' },
      { path: ['ServerScriptService', 'ok'], className: 'Folder', source: 'x' },
      { path: ['ServerScriptService', 'CON'], className: 'Script', source: 'x' },
      { path: ['ServerScriptService', 'big'], className: 'Script', source: 'x'.repeat(2 * 1024 * 1024 + 1) },
      { path: 'ServerScriptService/str', className: 'Script', source: 'x' },
      null,
    ];
    const r = await pluginRequest(srv.base, '/plugin/changes', { sessionId: a.sessionId, items }, { 'x-roswarm-plugin': a.token });
    assert.deepEqual(r.body.results, ['invalid', 'invalid', 'invalid', 'invalid', 'too_big', 'invalid', 'invalid']);
    assert.equal(fs.existsSync(path.join(project.dir, '..', 'evil.server.luau')), false);
    assert.equal(fs.existsSync(path.join(srv.home, 'evil.server.luau')), false);
  });

  test('révocation : sessions fermées, jeton refusé, commandes en cours en échec', async () => {
    const tokens = (await srv.api('GET', '/api/state')).pluginTokens;
    const idA = tokens.find((t) => t.label === 'A').id;
    a.stalls.push((c) => c.tool === 'get_tree');
    const pending = srv.api('POST', '/api/studio/raw', { tool: 'get_tree', args: {} }).catch((e) => e);
    await until(() => a.received.filter((c) => c.tool === 'get_tree').length >= 2, 5000, 'livraison');
    await srv.api('DELETE', '/api/plugin-tokens/' + idA);
    const err = await pending;
    assert.match(err.message, /inconnu|déconnecté/);
    const r = await pluginRequest(srv.base, '/plugin/poll', { sessionId: a.sessionId, lastPollId: 0 }, { 'x-roswarm-plugin': a.token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'BAD_TOKEN');
    const h = await pluginRequest(srv.base, '/plugin/hello', { instanceId: 'x' }, { 'x-roswarm-plugin': a.token });
    assert.equal(h.status, 401);
    await a.stop();
  });

  test('session expirée : refusée, il faut en rouvrir une', async () => {
    await b.hello();
    const sid = b.sessionId;
    await sleep(2600); // TTL de test : 1,5 s
    const r = await pluginRequest(srv.base, '/plugin/poll', { sessionId: sid, lastPollId: 0 }, { 'x-roswarm-plugin': b.token });
    assert.equal(r.body.code, 'BAD_SESSION');
    const again = await b.hello();
    assert.notEqual(again.sessionId, sid);
  });
});

describe('API de l’interface', () => {
  test('outils Studio en écriture interdits via la route de lecture', async () => {
    await assert.rejects(srv.api('POST', '/api/studio/raw', { tool: 'sync_upsert', args: { items: [] } }), /non autorisé/);
    await assert.rejects(srv.api('POST', '/api/studio/raw', { tool: 'run_luau', args: { code: 'x' } }), /non autorisé/);
  });

  test('fichiers statiques : pas de sortie du dossier public', async () => {
    const get = (p) =>
      new Promise((resolve) => {
        http.get({ host: '127.0.0.1', port: srv.port, path: p, headers: { host: `127.0.0.1:${srv.port}` } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
      });
    assert.equal(await get('/static/..%2fserver%2fconfig.js'), 403);
    assert.equal(await get('/static/../server/config.js'), 404);
    assert.equal(await get('/static/..%2f..%2fpackage.json'), 403);
    assert.equal(await get('/static/style.css'), 200);
  });

  test('hôte inattendu refusé (rebinding DNS)', async () => {
    const status = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: srv.port, path: '/api/ping', headers: { host: 'evil.example:80' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
    });
    assert.equal(status, 403);
  });
});
