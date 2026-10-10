// Fiabilité de la synchronisation src/ <-> Studio : ordre, pertes, échecs, conflits, boucles, suppressions, redémarrage.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, FakeStudio, makeProject, until, sleep } from './helpers.js';

const servers = [];
const studios = [];
after(async () => {
  for (const st of studios) await st.stop();
  for (const s of servers) await s.stop();
});

// Délais courts pour simuler déconnexions et absences de réponse.
const FAST = { ROSWARM_SESSION_TTL_MS: '1500', ROSWARM_POLL_HOLD_MS: '300', ROSWARM_SYNC_TIMEOUT_MS: '1500' };

async function setup(files = {}, studioScripts = {}, env = FAST) {
  const srv = await startServer({ env });
  servers.push(srv);
  const project = await makeProject(srv, 'Jeu', files);
  const studio = new FakeStudio(srv.base);
  for (const [k, v] of Object.entries(studioScripts)) studio.scripts.set(k, { className: 'Script', tagged: true, seq: 0, ...v });
  await studio.pair(srv);
  studio.start();
  studios.push(studio);
  await until(async () => (await srv.api('GET', '/api/state')).studio.connected, 5000, 'connexion');
  await until(() => studio.received.some((c) => c.tool === 'sync_manifest'), 5000, 'réconciliation');
  await sleep(200);
  return { srv, project, studio };
}

const write = (project, rel, content) => {
  const f = path.join(project.src, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};
const stats = async (srv, project) => (await srv.api('GET', `/api/projects/${project.id}/sync`)).counts;
const upsertsFor = (studio, key) => studio.received.filter((c) => c.tool === 'sync_upsert' && c.args.items.some((i) => i.path.join('/') === key));

describe('synchronisation', () => {
  test('écritures rapides : Studio finit toujours avec la DERNIÈRE version (régression : l’ancienne arrivait après)', async () => {
    const { project, studio } = await setup({ 'ServerScriptService/A.server.luau': 'v0' });
    await until(() => studio.scripts.get('ServerScriptService/A')?.source === 'v0', 5000, 'v0');
    studio.delays.push({ match: (c) => c.tool === 'sync_upsert' && c.args.items.some((i) => i.source === 'v1'), ms: 800 });
    write(project, 'ServerScriptService/A.server.luau', 'v1');
    await sleep(450);
    for (let i = 2; i <= 6; i++) {
      write(project, 'ServerScriptService/A.server.luau', 'v' + i);
      await sleep(60);
    }
    await until(() => studio.scripts.get('ServerScriptService/A')?.source === 'v6', 8000, 'v6');
    await sleep(1500);
    assert.equal(studio.scripts.get('ServerScriptService/A').source, 'v6', 'aucune version plus ancienne ne repasse par-dessus');
    // jamais deux envois simultanés pour le même fichier
    const sends = upsertsFor(studio, 'ServerScriptService/A').map((c) => c.args.items.find((i) => i.path.at(-1) === 'A').seq);
    assert.deepEqual([...sends].sort((x, y) => x - y), sends, 'numéros d’ordre croissants');
  });

  test('réponse de poll perdue : la commande est renvoyée, exécutée une seule fois', async () => {
    const { project, studio } = await setup();
    let executions = 0;
    const orig = studio.tool_sync_upsert.bind(studio);
    studio.tool_sync_upsert = (a) => {
      executions++;
      return orig(a);
    };
    studio.loseResponses = 1;
    write(project, 'ServerScriptService/B.server.luau', 'hello');
    await until(() => studio.scripts.get('ServerScriptService/B')?.source === 'hello', 5000, 'B');
    const ids = upsertsFor(studio, 'ServerScriptService/B').map((c) => c.id);
    assert.equal(executions, 1);
    assert.ok(ids.length >= 1);
  });

  test('pas de réponse (résultat inconnu) : nouvelles tentatives puis succès, rien n’est perdu', async () => {
    const { srv, project, studio } = await setup();
    let stalled = 0;
    studio.stalls.push((c) => c.tool === 'sync_upsert' && stalled++ < 2); // les 2 premiers envois restent sans réponse
    write(project, 'ServerScriptService/C.server.luau', 'important');
    await until(async () => (await stats(srv, project)).unknown >= 1, 5000, 'état inconnu');
    await until(() => studio.scripts.get('ServerScriptService/C')?.source === 'important', 15000, 'succès après nouvelles tentatives');
    await until(async () => (await stats(srv, project)).applied >= 1, 3000, 'appliqué');
  });

  test('erreur permanente : marquée en échec, pas de boucle, relancée au prochain changement', async () => {
    const { srv, project, studio } = await setup();
    studio.failures.push({ match: (c) => c.tool === 'sync_upsert', error: 'Service inconnu : Nope' });
    write(project, 'ServerScriptService/D.server.luau', 'x');
    await until(async () => (await stats(srv, project)).failed === 1, 5000, 'échec');
    const n = upsertsFor(studio, 'ServerScriptService/D').length;
    await sleep(1500);
    assert.equal(upsertsFor(studio, 'ServerScriptService/D').length, n, 'aucune nouvelle tentative pour une erreur permanente');
    const st = await srv.api('GET', `/api/projects/${project.id}/sync`);
    assert.match(st.problems[0].error, /Service inconnu/);
    studio.failures.length = 0;
    write(project, 'ServerScriptService/D.server.luau', 'y');
    await until(() => studio.scripts.get('ServerScriptService/D')?.source === 'y', 5000, 'relance');
  });

  test('déconnexion en plein envoi : reprise après reconnexion', async () => {
    const { project, studio, srv } = await setup();
    studio.stalls.push((c) => c.tool === 'sync_upsert');
    write(project, 'ServerScriptService/E.server.luau', 'survit');
    await until(() => upsertsFor(studio, 'ServerScriptService/E').length >= 1, 5000, 'envoi');
    await studio.stop(); // Studio fermé
    await until(async () => !(await srv.api('GET', '/api/state')).studio.connected, 5000, 'déconnexion');
    const studio2 = new FakeStudio(srv.base, { placeName: 'MonJeu' });
    studio2.token = studio.token;
    studio2.scripts = studio.scripts;
    studio2.start();
    await until(() => studio2.scripts.get('ServerScriptService/E')?.source === 'survit', 10000, 'appliqué après reconnexion');
    await studio2.stop();
  });

  test('conflit : modifié localement ET dans Studio -> le fichier gagne, la version Studio est sauvegardée', async () => {
    const { project, studio } = await setup({ 'ServerScriptService/F.server.luau': 'base' });
    await until(() => studio.scripts.get('ServerScriptService/F')?.source === 'base', 5000, 'base');
    studio.delays.push({ match: (c) => c.tool === 'sync_upsert', ms: 1000 });
    write(project, 'ServerScriptService/F.server.luau', 'travail de l’agent');
    await until(() => upsertsFor(studio, 'ServerScriptService/F').length >= 2, 5000, 'envoi local en cours');
    const r = await studio.editInStudio('ServerScriptService/F', 'édition à la main dans Studio');
    assert.deepEqual(r.body.results, ['conflict']);
    assert.equal(fs.readFileSync(path.join(project.src, 'ServerScriptService/F.server.luau'), 'utf8'), 'travail de l’agent', 'travail local jamais écrasé');
    const dir = path.join(project.dir, '.roswarm', 'conflicts', 'ServerScriptService');
    const copies = fs.readdirSync(dir).filter((f) => f.startsWith('F.server.luau'));
    assert.equal(fs.readFileSync(path.join(dir, copies[0]), 'utf8'), 'édition à la main dans Studio', 'version Studio sauvegardée');
    await until(() => studio.scripts.get('ServerScriptService/F')?.source === 'travail de l’agent', 8000, 'Studio aligné');
  });

  test('pas de boucle : un changement venu de Studio n’est pas renvoyé à Studio', async () => {
    const { project, studio } = await setup({ 'ServerScriptService/G.server.luau': 'un' });
    await until(() => studio.scripts.get('ServerScriptService/G')?.source === 'un', 5000, 'un');
    const before = upsertsFor(studio, 'ServerScriptService/G').length;
    const r = await studio.editInStudio('ServerScriptService/G', 'deux (Studio)');
    assert.deepEqual(r.body.results, ['written']);
    assert.equal(fs.readFileSync(path.join(project.src, 'ServerScriptService/G.server.luau'), 'utf8'), 'deux (Studio)');
    await sleep(1500);
    assert.equal(upsertsFor(studio, 'ServerScriptService/G').length, before, 'aucun renvoi');
  });

  test('suppressions : vraie suppression propagée ; remplacement atomique par un éditeur non', async () => {
    const { project, studio } = await setup({ 'ServerScriptService/H.server.luau': 'h', 'ServerScriptService/I.server.luau': 'i' });
    await until(() => studio.scripts.has('ServerScriptService/I'), 5000, 'I');
    // remplacement atomique (comme beaucoup d'éditeurs) : supprimé puis recréé très vite
    const f = path.join(project.src, 'ServerScriptService/H.server.luau');
    fs.rmSync(f);
    await sleep(100);
    fs.writeFileSync(f, 'h2');
    await until(() => studio.scripts.get('ServerScriptService/H')?.source === 'h2', 5000, 'H mis à jour');
    assert.equal(studio.received.some((c) => c.tool === 'sync_delete' && c.args.path.at(-1) === 'H'), false, 'pas de suppression parasite');
    fs.rmSync(path.join(project.src, 'ServerScriptService/I.server.luau'));
    await until(() => !studio.scripts.has('ServerScriptService/I'), 6000, 'I supprimé dans Studio');
  });

  test('script écrit à la main dans Studio (non synchronisé) remplacé : copie sauvegardée', async () => {
    const { project, studio } = await setup();
    studio.scripts.set('ServerScriptService/J', { className: 'Script', source: 'code écrit à la main', tagged: false, seq: 0 });
    write(project, 'ServerScriptService/J.server.luau', 'version des agents');
    await until(() => studio.scripts.get('ServerScriptService/J')?.source === 'version des agents', 5000, 'J');
    const dir = path.join(project.dir, '.roswarm', 'conflicts', 'ServerScriptService');
    await until(() => fs.existsSync(dir), 3000, 'copie');
    const copy = fs.readdirSync(dir).find((x) => x.startsWith('J.server.luau'));
    assert.equal(fs.readFileSync(path.join(dir, copy), 'utf8'), 'code écrit à la main');
  });

  test('erreur de syntaxe signalée par Studio et visible dans l’état de synchronisation', async () => {
    const { srv, project, studio } = await setup();
    write(project, 'ServerScriptService/K.server.luau', 'local x = @@SYNTAXE@@');
    await until(() => studio.scripts.has('ServerScriptService/K'), 5000, 'K');
    await until(async () => (await srv.api('GET', `/api/projects/${project.id}/sync`)).problems.some((p) => /syntaxe/.test(p.error)), 3000, 'syntaxe');
  });

  test('lien symbolique dans src/ vers l’extérieur : jamais lu ni envoyé', async () => {
    const { srv, project, studio } = await setup();
    const outside = path.join(srv.home, 'secret');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'Leak.server.luau'), 'secret');
    fs.symlinkSync(outside, path.join(project.src, 'ServerStorage'), 'dir');
    write(project, 'ServerScriptService/Ok.server.luau', 'ok');
    await until(() => studio.scripts.has('ServerScriptService/Ok'), 5000, 'Ok');
    await sleep(800);
    assert.equal([...studio.scripts.values()].some((s) => s.source === 'secret'), false);
  });
});

describe('changement de projet', () => {
  test('Studio connecté puis nouveau projet : la session suit le projet actif (régression : modifications ignorées)', async () => {
    const { srv, studio } = await setup({ 'ServerScriptService/A.server.luau': 'a' });
    const other = await makeProject(srv, 'Autre', { 'ServerScriptService/B.server.luau': 'b' });
    await until(() => studio.scripts.get('ServerScriptService/B')?.source === 'b', 5000, 'B envoyé au nouveau projet');
    const r = await studio.editInStudio('ServerScriptService/B', 'b modifié dans Studio');
    assert.deepEqual(r.body.results, ['written']);
    assert.equal(fs.readFileSync(path.join(other.src, 'ServerScriptService/B.server.luau'), 'utf8'), 'b modifié dans Studio');
  });
});

describe('redémarrage et reprise', () => {
  test('changements des deux côtés pendant que RoSwarm est arrêté : réconciliation correcte', async () => {
    const srv = await startServer({ env: FAST });
    const project = await makeProject(srv, 'Reprise', {
      'ServerScriptService/Local.server.luau': 'L0',
      'ServerScriptService/Studio.server.luau': 'S0',
      'ServerScriptService/Gone.server.luau': 'G0',
      'ServerScriptService/Same.server.luau': 'same',
    });
    const studio = new FakeStudio(srv.base);
    await studio.pair(srv);
    studio.start();
    await until(() => studio.scripts.size === 4, 5000, 'envoi initial');
    await sleep(800); // laisse la base se sauvegarder
    await srv.stop();
    await studio.stop();

    // pendant l'arrêt : un fichier modifié, un script modifié dans Studio, un fichier supprimé
    write(project, 'ServerScriptService/Local.server.luau', 'L1');
    studio.scripts.get('ServerScriptService/Studio').source = 'S1';
    fs.rmSync(path.join(project.src, 'ServerScriptService/Gone.server.luau'));

    const srv2 = await startServer({ home: srv.home, port: srv.port, env: FAST });
    servers.push(srv2);
    studio.received = [];
    studio.sessionId = null;
    studio.start();
    await until(() => studio.scripts.get('ServerScriptService/Local')?.source === 'L1', 8000, 'push du changement local');
    await until(() => fs.readFileSync(path.join(project.src, 'ServerScriptService/Studio.server.luau'), 'utf8') === 'S1', 8000, 'import du changement Studio');
    await until(() => !studio.scripts.has('ServerScriptService/Gone'), 8000, 'suppression propagée');
    assert.equal(upsertsFor(studio, 'ServerScriptService/Same').length, 0, 'fichier inchangé : aucun trafic');
    assert.equal(upsertsFor(studio, 'ServerScriptService/Studio').length, 0, 'le changement Studio n’est pas écrasé');
    await studio.stop();
  });
});

describe('protection contre la perte', () => {
  test('src/ vidé pendant l’arrêt (dossier déplacé…) : rien n’est supprimé dans Studio, tout est réimporté', async () => {
    const srv = await startServer({ env: FAST });
    servers.push(srv);
    const project = await makeProject(srv, 'Vide', { 'ServerScriptService/X.server.luau': 'x', 'ReplicatedStorage/Y.luau': 'y' });
    const studio = new FakeStudio(srv.base);
    studios.push(studio);
    await studio.pair(srv);
    studio.start();
    await until(() => studio.scripts.size === 2, 5000, 'envoi');
    await sleep(800);
    await srv.stop();
    await studio.stop();
    fs.rmSync(project.src, { recursive: true });
    const srv2 = await startServer({ home: srv.home, port: srv.port, env: FAST });
    servers.push(srv2);
    studio.sessionId = null;
    studio.received = [];
    studio.start();
    await until(() => fs.existsSync(path.join(project.src, 'ReplicatedStorage/Y.luau')), 8000, 'réimport');
    assert.equal(studio.scripts.size, 2);
    assert.equal(studio.received.some((c) => c.tool === 'sync_delete'), false);
  });
});

describe('volume', () => {
  test('1000 scripts : envoi initial complet, puis une modification isolée', { timeout: 120000 }, async () => {
    const files = {};
    for (let i = 0; i < 1000; i++) files[`ServerScriptService/Dossier${i % 20}/Script${i}.server.luau`] = `-- script ${i}\n` + 'local x = 1\n'.repeat(50);
    const t0 = Date.now();
    const { srv, project, studio } = await setup(files, {}, { ROSWARM_POLL_HOLD_MS: '300' });
    await until(() => studio.scripts.size === 1000, 90000, '1000 scripts');
    const initialMs = Date.now() - t0;
    const commands = studio.received.filter((c) => c.tool === 'sync_upsert').length;
    await until(async () => (await stats(srv, project)).applied === 1000, 10000, 'tous appliqués');
    const before = studio.received.length;
    const t1 = Date.now();
    write(project, 'ServerScriptService/Dossier3/Script3.server.luau', 'modifié');
    await until(() => studio.scripts.get('ServerScriptService/Dossier3/Script3')?.source === 'modifié', 5000, 'modification');
    const oneMs = Date.now() - t1;
    assert.equal(studio.received.length - before, 1, 'une seule commande pour une seule modification');
    console.log(`[mesure] 1000 scripts (~600 Ko) : envoi initial ${initialMs} ms en ${commands} commandes groupées ; modification isolée ${oneMs} ms`);
  });
});
