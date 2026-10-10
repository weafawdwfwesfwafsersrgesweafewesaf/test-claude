// Tests unitaires : logique pure et modules isolés (dossier de données temporaire).
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.ROSWARM_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-unit-'));
const core = await import('../server/syncCore.js');
const coord = await import('../server/coord.js');
const auth = await import('../server/pluginAuth.js');

describe('chemins et noms', () => {
  test('fichier <-> instance', () => {
    assert.deepEqual(core.fileToInstance('ServerScriptService/Shop.server.luau'), { path: ['ServerScriptService', 'Shop'], className: 'Script' });
    assert.deepEqual(core.fileToInstance('StarterPlayer\\StarterPlayerScripts\\Hud.client.lua'), {
      path: ['StarterPlayer', 'StarterPlayerScripts', 'Hud'],
      className: 'LocalScript',
    });
    assert.deepEqual(core.fileToInstance('ReplicatedStorage/M/Config.luau'), { path: ['ReplicatedStorage', 'M', 'Config'], className: 'ModuleScript' });
    assert.equal(core.instanceToFile(['ServerScriptService', 'Shop'], 'Script'), 'ServerScriptService/Shop.server.luau');
    assert.equal(core.fileToInstance('Shop.server.luau'), null, 'un service est obligatoire');
    assert.equal(core.fileToInstance('ServerScriptService/notes.txt'), null);
    assert.equal(core.fileToInstance('ServerScriptService/.server.luau'), null);
  });

  test('noms refusés : traversée, caractères interdits, noms réservés Windows', () => {
    for (const bad of ['..', '.', '.cache', 'a/b', 'a\\b', 'CON', 'nul.txt', 'x:y', 'fin.', 'fin ', '', 'a\0b']) {
      assert.equal(core.validName(bad), false, bad);
    }
    assert.equal(core.instanceToFile(['ServerScriptService', '..', 'x'], 'Script'), null);
    assert.equal(core.instanceToFile(['..', 'x'], 'Script'), null);
    assert.equal(core.instanceToFile(['ServerScriptService', 'x'], 'Folder'), null);
    assert.equal(core.fileToInstance('../ServerScriptService/x.luau'), null);
  });

  test('resolveInside confine au dossier, y compris face aux liens symboliques', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-out-'));
    assert.equal(core.resolveInside(root, 'A/b.luau'), path.join(root, 'A', 'b.luau'));
    for (const bad of ['../x', 'A/../../x', '/etc/passwd', 'C:\\x', 'C:/x', '..\\x', '']) {
      assert.throws(() => core.resolveInside(root, bad), Error, bad);
    }
    fs.symlinkSync(outside, path.join(root, 'lien'), 'dir');
    assert.throws(() => core.resolveInside(root, 'lien/x.luau'), /symbolique/);
  });
});

describe('empreintes', () => {
  test('FNV-1a 32 bits : valeurs de référence et normalisation des fins de ligne', () => {
    assert.equal(core.fnv1a(''), '811c9dc5');
    assert.equal(core.fnv1a('a'), 'e40c292c');
    assert.equal(core.fnv1a('foobar'), 'bf9cf968');
    assert.equal(core.fnv1a('a\r\nb'), core.fnv1a('a\nb'));
  });

  // Exécute la vraie fonction Luau du plugin si un interpréteur Luau est disponible (LUAU_BIN ou « luau » dans le PATH).
  const luau = process.env.LUAU_BIN || (() => {
    try {
      execFileSync('luau', ['--help'], { stdio: 'ignore' });
      return 'luau';
    } catch {
      return null;
    }
  })();
  test('FNV-1a : le plugin Luau calcule exactement la même chose que le serveur', { skip: !luau && 'interpréteur luau introuvable (définis LUAU_BIN)' }, () => {
    const plugin = fs.readFileSync(path.join(import.meta.dirname, '..', 'plugin', 'RoSwarm.lua'), 'utf8');
    const fn = plugin.slice(plugin.indexOf('-- roswarm:fnv1a:begin'), plugin.indexOf('-- roswarm:fnv1a:end'));
    const samples = ['', 'a', 'foobar', 'print("héllo 🌍")\r\nlocal x = 1\n', 'x'.repeat(10000) + 'é'];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roswarm-luau-'));
    const script = path.join(dir, 'parity.luau');
    // Chaque échantillon devient une chaîne Luau écrite octet par octet (\xHH) : aucune conversion d'encodage possible.
    const lit = (str) => '"' + [...Buffer.from(str, 'utf8')].map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('') + '"';
    fs.writeFileSync(script, fn + '\n' + samples.map((str) => `print(fnv1a(${lit(str)}))`).join('\n'));
    const out = execFileSync(luau, [script], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(out, samples.map((s) => core.fnv1a(s)));
  });
});

describe('plan de réconciliation (fichiers / Studio / base)', () => {
  test('chaque cas', () => {
    const plan = core.planReconcile(
      { same: 'h1', localChanged: 'L2', studioChanged: 'B3', both: 'L4', newLocal: 'h5', noBase: 'L9' },
      { same: 'h1', localChanged: 'B2', studioChanged: 'S3', both: 'S4', deletedLocally: 'B6', deletedButEdited: 'S7', newStudio: 'h8', noBase: 'S9' },
      { same: 'h1', localChanged: 'B2', studioChanged: 'B3', both: 'B4', deletedLocally: 'B6', deletedButEdited: 'B7' },
    );
    assert.deepEqual(plan.same, ['same']);
    assert.deepEqual(plan.push.sort(), ['localChanged', 'newLocal']);
    assert.deepEqual(plan.pull.sort(), ['newStudio', 'studioChanged']);
    assert.deepEqual(plan.conflict.sort(), ['both', 'deletedButEdited', 'noBase']);
    assert.deepEqual(plan.deleteInStudio, ['deletedLocally']);
  });
});

describe('tâches', () => {
  const P = 'proj-unit';
  const chef = 'Chef';
  test('création, review obligatoire, validation par le créateur seulement', () => {
    const t = coord.createTask(P, { title: 'A', createdBy: chef, acceptance: 'ça marche' });
    assert.equal(t.status, 'todo');
    assert.equal(coord.updateTask(P, t.id, { status: 'doing', assignee: 'Dev' }, 'Dev').task.status, 'doing');
    const r = coord.updateTask(P, t.id, { status: 'done' }, 'Dev');
    assert.equal(r.task.status, 'review', 'un agent qui finit la tâche d’un autre la met « à valider »');
    assert.throws(() => coord.updateTask(P, t.id, { status: 'done' }, 'Autre'), /Seul Chef/);
    assert.equal(coord.updateTask(P, t.id, { status: 'done' }, chef).task.status, 'done');
    const again = coord.updateTask(P, t.id, { status: 'done' }, chef);
    assert.equal(again.changed, false, 'terminer deux fois ne change rien');
    assert.deepEqual(
      coord.board(P).tasks.find((x) => x.id === t.id).history.map((h) => h.to),
      ['doing', 'review', 'done'],
    );
  });

  test('transitions interdites, statut inconnu, dépendances', () => {
    const a = coord.createTask(P, { title: 'base', createdBy: chef });
    const b = coord.createTask(P, { title: 'dépend', createdBy: chef, dependsOn: [a.id] });
    assert.throws(() => coord.updateTask(P, b.id, { status: 'doing' }, 'Dev'), /dépendances/);
    assert.throws(() => coord.updateTask(P, b.id, { status: 'review' }, 'Dev'), /Transition interdite/);
    assert.throws(() => coord.updateTask(P, b.id, { status: 'n_importe_quoi' }, 'Dev'), /Statut inconnu/);
    assert.throws(() => coord.createTask(P, { title: 'x', dependsOn: [99999] }), /introuvable/);
    coord.updateTask(P, a.id, { status: 'done' }, chef);
    assert.equal(coord.updateTask(P, b.id, { status: 'doing' }, 'Dev').task.status, 'doing');
    // l'utilisateur peut tout forcer
    assert.equal(coord.updateTask(P, b.id, { status: 'done' }, 'Toi', { asUser: true }).task.status, 'done');
  });

  test('agent parti : ses tâches en cours reviennent « à faire »', () => {
    const t = coord.createTask(P, { title: 'orpheline', createdBy: chef });
    coord.updateTask(P, t.id, { status: 'doing', assignee: '#3 Claude' }, '#3 Claude');
    const released = coord.releaseTasksOf(P, '#3 Claude', 'a été fermé');
    assert.deepEqual(released.map((x) => x.id), [t.id]);
    assert.equal(coord.board(P).tasks.find((x) => x.id === t.id).status, 'todo');
  });
});

describe('réservations', () => {
  const P = 'proj-locks';
  const a = { id: 'a1', name: '#1' };
  const b = { id: 'a2', name: '#2' };
  test('tout ou rien, renouvellement par le propriétaire, libération par le propriétaire seulement', () => {
    assert.equal(coord.claim(P, a, ['src/A.luau', 'src/B.luau']).ok, true);
    const r = coord.claim(P, b, ['src/C.luau', 'src/B.luau']);
    assert.equal(r.ok, false);
    assert.equal(r.conflicts[0].holder.agentId, 'a1');
    assert.equal(coord.listLocks(P).some((l) => l.resource === 'src/C.luau'), false, 'aucune réservation partielle');
    assert.equal(coord.claim(P, a, ['src/A.luau']).ok, true, 'renouvellement');
    assert.equal(coord.release(P, 'a2', ['src/A.luau']), 0, 'un autre agent ne peut pas libérer');
    assert.equal(coord.claim(P, b, ['SRC\\a.luau']).ok, false, 'casse et séparateurs normalisés');
    assert.equal(coord.release(P, 'a1'), 2);
    assert.equal(coord.claim(P, b, ['src/A.luau']).ok, true);
    coord.release(P, 'a2');
  });

  test('expiration après 10 minutes', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      assert.equal(coord.claim(P, a, ['src/X.luau']).ok, true);
      mock.timers.tick(coord.LOCK_MS - 1000);
      assert.equal(coord.claim(P, b, ['src/X.luau']).ok, false);
      mock.timers.tick(2000);
      assert.equal(coord.claim(P, b, ['src/X.luau']).ok, true, 'réservation expirée récupérée');
    } finally {
      mock.timers.reset();
      coord.release(P, 'a1');
      coord.release(P, 'a2');
    }
  });

  test('détection des écrasements entre agents', () => {
    assert.equal(coord.noteWrite(P, 'src/Z.luau', a), null);
    assert.equal(coord.noteWrite(P, 'src/Z.luau', a), null, 'même agent : rien');
    assert.equal(coord.noteWrite(P, 'src/Z.luau', b)?.agentId, 'a1');
  });
});

describe('appairage du plugin', () => {
  test('demande, approbation, jeton délivré une seule fois, vérification, révocation', () => {
    const requestId = 'abcdefabcdefabcdefabcdef';
    assert.throws(() => auth.requestPairing({ requestId: 'court', code: '1234' }), /requestId/);
    assert.throws(() => auth.requestPairing({ requestId, code: '12a4' }), /code/);
    assert.deepEqual(auth.requestPairing({ requestId, code: '1234', placeName: 'Jeu' }), { status: 'pending' });
    assert.equal(auth.pairingStatus(requestId).status, 'pending');
    assert.ok(auth.listPending().some((p) => p.requestId === requestId && p.code === '1234'));
    const { id } = auth.approve(requestId);
    const st = auth.pairingStatus(requestId);
    assert.equal(st.status, 'approved');
    assert.match(st.token, /^[0-9a-f]{64}$/);
    assert.equal(auth.pairingStatus(requestId).status, 'unknown', 'jeton délivré une seule fois');
    assert.equal(auth.verify(st.token).id, id);
    assert.throws(() => auth.verify('0'.repeat(64)), /inconnu/);
    assert.throws(() => auth.verify(undefined), /non appairé/);
    const stored = fs.readFileSync(path.join(process.env.ROSWARM_HOME, 'plugin-tokens.json'), 'utf8');
    assert.equal(stored.includes(st.token), false, 'le jeton n’est pas stocké en clair');
    auth.revoke(id);
    assert.throws(() => auth.verify(st.token), /révoqué/);
  });

  test('refus et limitation du nombre de demandes', () => {
    const rid = 'refusrefusrefusrefusrefus';
    auth.requestPairing({ requestId: rid, code: '0000' });
    auth.reject(rid);
    assert.equal(auth.pairingStatus(rid).status, 'rejected');
    let limited = false;
    for (let i = 0; i < 15; i++) {
      try {
        auth.requestPairing({ requestId: 'spam' + String(i).padStart(22, '0'), code: '1111' });
      } catch (e) {
        if (e.status === 429) limited = true;
      }
    }
    assert.equal(limited, true);
    assert.ok(auth.listPending().length <= 5, 'demandes en attente bornées');
  });
});
