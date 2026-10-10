// Synchronisation des scripts : fichiers de src/ <-> scripts dans Roblox Studio.
//
//   src/ServerScriptService/Shop.server.luau                 -> Script       ServerScriptService.Shop
//   src/StarterPlayer/StarterPlayerScripts/Hud.client.luau   -> LocalScript
//   src/ReplicatedStorage/Modules/Config.luau                -> ModuleScript
//
// Machine à états par fichier :
//   pending      changement local détecté, pas encore envoyé
//   in_progress  envoyé à Studio, en attente de confirmation (un seul envoi à la fois par fichier)
//   applied      Studio a confirmé : la « base » (empreinte commune) est mise à jour à ce moment-là seulement
//   unknown      délai dépassé / déconnexion pendant l'envoi : on ne sait pas -> nouvelle tentative (opération idempotente)
//   failed       erreur. Temporaire : nouvelles tentatives avec attente croissante (max MAX_ATTEMPTS).
//                Permanente (refus du plugin, fichier trop gros) : pas de nouvelle tentative avant un nouveau changement.
//   conflict     Studio et le fichier ont changé tous les deux : le fichier gagne, la version Studio est sauvegardée
//                dans .roswarm/conflicts/ (jamais perdue).
// Anti-boucle : un changement venant de Studio est écrit dans le fichier ET dans la base ; l'événement du watcher qui suit
// voit alors « contenu == base » et ne renvoie rien.
// Reprise après redémarrage : la base est persistée (DATA_DIR/sync/<projet>.json). À chaque connexion de Studio,
// une réconciliation à trois points (fichiers / Studio / base) recalcule ce qui doit être envoyé ou rapatrié.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bus } from './bus.js';
import { DATA_DIR, readJson, writeJson } from './config.js';
import * as studio from './studio.js';
import * as projects from './projects.js';
import * as coord from './coord.js';
import * as agents from './agents.js';
import {
  MAX_SCRIPT_BYTES,
  SUFFIX,
  candidateFiles,
  defaultClassFor,
  fileToInstance,
  fnv1a,
  instanceToFile,
  normalizeSource,
  planReconcile,
  resolveInside,
  SCRIPT_CLASSES,
} from './syncCore.js';

export { fileToInstance, instanceToFile, defaultClassFor } from './syncCore.js';

const MAX_ATTEMPTS = 6;
const UPSERT_TIMEOUT_MS = Number(process.env.ROSWARM_SYNC_TIMEOUT_MS) || 60000;
const DELETE_GRACE_MS = 1500; // un fichier absent doit le rester ce temps avant d'être supprimé (écritures atomiques des éditeurs)
const BATCH_MAX_ITEMS = 40;
const BATCH_MAX_BYTES = 400_000;
const TICK_MS = 300;
const MAX_CONCURRENT_BATCHES = 4;

let seqCounter = 0;
/** Numéro d'ordre croissant, même après un redémarrage (basé sur l'horloge). */
function nextSeq() {
  seqCounter = Math.max(Date.now() * 1000, seqCounter + 1);
  return seqCounter;
}

function walk(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue; // jamais suivi
    if (e.isDirectory()) walk(full, base, out);
    else {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (fileToInstance(rel)) out.push(rel);
    }
  }
  return out;
}

/** Écriture atomique : fichier temporaire caché dans le même dossier puis renommage. */
export function writeAtomic(full, content) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = path.join(path.dirname(full), `.roswarm-tmp-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, full);
}

class ProjectSync {
  constructor(project) {
    this.projectId = project.id;
    this.files = new Map(); // rel -> état
    this.timers = new Map();
    this.waiters = new Map(); // rel -> [resolve]
    this.watcher = null;
    this.ticker = null;
    this.batches = 0;
    this.reconciling = null;
    this.baseFile = path.join(DATA_DIR, 'sync', project.id + '.json');
    this.base = readJson(this.baseFile, null)?.base || {};
    this.saveTimer = null;
    this.statsTimer = null;
  }

  get project() {
    return projects.get(this.projectId);
  }

  get src() {
    return path.join(this.project.dir, 'src');
  }

  enabled() {
    return !!this.project?.sync;
  }

  start() {
    this.stop();
    fs.mkdirSync(this.src, { recursive: true });
    try {
      this.watcher = fs.watch(this.src, { recursive: true }, (_ev, file) => {
        if (!file) return;
        const rel = String(file).replace(/\\/g, '/');
        if (rel.split('/').some((p) => p.startsWith('.'))) return; // fichiers temporaires / cachés
        clearTimeout(this.timers.get(rel));
        this.timers.set(
          rel,
          setTimeout(() => {
            this.timers.delete(rel);
            this.touchPath(rel);
          }, 250),
        );
      });
      this.watcher.on('error', (e) => coord.log(this.projectId, 'Sync', 'Surveillance de src/ interrompue : ' + e.message, 'error'));
    } catch (e) {
      coord.log(this.projectId, 'Sync', 'Surveillance de src/ impossible : ' + e.message, 'error');
    }
    this.ticker = setInterval(() => this.tick().catch((e) => coord.log(this.projectId, 'Sync', 'Erreur interne : ' + e.message, 'error')), TICK_MS);
    this.ticker.unref();
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    clearInterval(this.ticker);
    this.ticker = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.saveNow();
  }

  // ---------- état ----------

  entry(rel) {
    let e = this.files.get(rel);
    if (!e) {
      e = { rel, status: 'applied', attempts: 0, nextRetryAt: 0, lastError: '', permanent: false, inFlight: false, dirty: false, missingSince: 0, syntaxError: null, lastWriter: null };
      this.files.set(rel, e);
    }
    return e;
  }

  setBase(rel, hash) {
    if (hash === undefined) delete this.base[rel];
    else this.base[rel] = hash;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 500);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      writeJson(this.baseFile, { base: this.base, savedAt: Date.now() });
    } catch (e) {
      console.error('[RoSwarm] Sauvegarde de l’état de synchronisation impossible :', e.message);
    }
  }

  changed() {
    if (this.statsTimer) return;
    this.statsTimer = setTimeout(() => {
      this.statsTimer = null;
      bus.emit('sync', this.projectId);
    }, 300);
  }

  finish(e, status, error = '') {
    e.status = status;
    e.lastError = error;
    if (status === 'applied') {
      e.attempts = 0;
      e.permanent = false;
    }
    if (e.dirty) {
      e.dirty = false;
      e.status = 'pending';
      e.attempts = 0;
      e.nextRetryAt = 0;
    }
    if (e.status !== 'pending' && e.status !== 'in_progress') {
      for (const w of this.waiters.get(e.rel) || []) w(e);
      this.waiters.delete(e.rel);
    }
    this.changed();
  }

  /** Attend que le fichier ait un état final (appliqué, échec, conflit). */
  waitFor(rel, timeoutMs = 30000) {
    const e = this.files.get(rel);
    if (e && !['pending', 'in_progress', 'unknown'].includes(e.status)) return Promise.resolve(e);
    return new Promise((resolve) => {
      const list = this.waiters.get(rel) || [];
      const done = (x) => {
        clearTimeout(t);
        resolve(x);
      };
      const t = setTimeout(() => {
        this.waiters.set(rel, (this.waiters.get(rel) || []).filter((w) => w !== done));
        resolve(this.files.get(rel) || { rel, status: 'pending' });
      }, timeoutMs);
      list.push(done);
      this.waiters.set(rel, list);
    });
  }

  // ---------- changements locaux ----------

  touchPath(rel) {
    let full;
    try {
      full = resolveInside(this.src, rel);
    } catch {
      return;
    }
    let stat = null;
    try {
      stat = fs.lstatSync(full);
    } catch {}
    if (stat?.isSymbolicLink()) return;
    if (stat?.isDirectory()) {
      for (const f of walk(full, this.src)) this.touch(f);
      return;
    }
    if (stat) return this.touch(rel);
    // absent : fichier supprimé ou dossier supprimé
    const known = [...new Set([...this.files.keys(), ...Object.keys(this.base)])].filter((k) => k === rel || k.startsWith(rel + '/'));
    for (const k of known) this.touch(k);
  }

  touch(rel) {
    if (!fileToInstance(rel)) return;
    const e = this.entry(rel);
    if (e.inFlight) e.dirty = true;
    e.status = 'pending';
    e.attempts = 0;
    e.nextRetryAt = 0;
    e.permanent = false;
    e.missingSince = 0;
    this.changed();
  }

  noteWriter(rel, agentId) {
    if (fileToInstance(rel)) this.entry(rel).lastWriter = agentId;
  }

  // ---------- envoi vers Studio ----------

  async tick() {
    if (this.reconciling || !this.enabled() || !studio.status().connected) return;
    // Remplit autant de lots que possible (jusqu'à MAX_CONCURRENT_BATCHES envois simultanés).
    while (this.batches < MAX_CONCURRENT_BATCHES && this.dispatchBatch()) {}
  }

  /** Prépare et envoie un lot. Renvoie false s'il n'y avait plus rien à envoyer. */
  dispatchBatch() {
    const now = Date.now();
    const upserts = [];
    const deletes = [];
    let bytes = 0;
    for (const e of this.files.values()) {
      if (upserts.length >= BATCH_MAX_ITEMS || bytes >= BATCH_MAX_BYTES) break;
      if (
        e.inFlight ||
        e.nextRetryAt > now ||
        !(e.status === 'pending' || e.status === 'unknown' || (e.status === 'failed' && !e.permanent && e.attempts < MAX_ATTEMPTS))
      ) {
        continue;
      }
      const info = fileToInstance(e.rel);
      let source;
      try {
        source = fs.readFileSync(resolveInside(this.src, e.rel), 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') {
          e.permanent = true;
          this.finish(e, 'failed', 'Lecture impossible : ' + err.message);
          continue;
        }
        // fichier absent : on attend un peu (un éditeur peut être en train de le remplacer)
        if (!e.missingSince) e.missingSince = now;
        if (now - e.missingSince < DELETE_GRACE_MS) continue;
        if (this.base[e.rel] === undefined && e.status !== 'unknown') {
          this.files.delete(e.rel); // jamais arrivé dans Studio : rien à supprimer
          this.changed();
          continue;
        }
        deletes.push(e);
        continue;
      }
      e.missingSince = 0;
      if (Buffer.byteLength(source) > MAX_SCRIPT_BYTES) {
        e.permanent = true;
        this.finish(e, 'failed', `Script trop gros (${Math.round(Buffer.byteLength(source) / 1024)} Ko, max ${MAX_SCRIPT_BYTES / 1024} Ko)`);
        continue;
      }
      source = normalizeSource(source);
      const hash = fnv1a(source);
      if (hash === this.base[e.rel] && e.status === 'pending' && !e.force) {
        this.finish(e, 'applied');
        continue;
      }
      e.force = false;
      upserts.push({ e, hash, item: { path: info.path, className: info.className, source, seq: nextSeq() } });
      bytes += source.length;
    }
    if (!upserts.length && !deletes.length) return false;
    // Les envois marquent leurs fichiers « en cours » de façon synchrone : le lot suivant ne les reprendra pas.
    this.batches++;
    Promise.all([this.sendUpserts(upserts), ...deletes.map((e) => this.sendDelete(e))])
      .catch((err) => coord.log(this.projectId, 'Sync', 'Erreur interne pendant l’envoi : ' + err.message, 'error'))
      .finally(() => {
        this.batches--;
        setImmediate(() => this.tick().catch(() => {}));
      });
    return true;
  }

  async sendUpserts(list) {
    if (!list.length) return;
    for (const { e } of list) {
      e.inFlight = true;
      e.status = 'in_progress';
    }
    this.changed();
    let result;
    try {
      result = await studio.call('sync_upsert', { items: list.map((x) => x.item) }, { timeoutMs: UPSERT_TIMEOUT_MS });
    } catch (err) {
      for (const { e } of list) {
        e.inFlight = false;
        this.transportFailure(e, err);
      }
      return;
    }
    const items = Array.isArray(result?.items) ? result.items : [];
    list.forEach(({ e, hash, item }, i) => {
      e.inFlight = false;
      const r = items[i] || {};
      if (r.replacedUntagged != null) this.saveConflictCopy(e.rel, r.replacedUntagged, 'remplacé (script Studio non synchronisé)');
      if (r.status === 'applied' || r.status === 'unchanged') {
        this.setBase(e.rel, hash);
        this.recordSyntax(e, r.syntaxError || null);
        this.finish(e, 'applied');
      } else if (r.status === 'stale') {
        // Studio a déjà une version plus récente (numéro d'ordre supérieur) : on ne touche pas à la base.
        this.finish(e, 'applied', 'ignoré : Studio a une version plus récente');
      } else {
        e.permanent = true;
        this.finish(e, 'failed', String(r.error || 'Refusé par Studio'));
        coord.log(this.projectId, 'Sync', `échec src/${e.rel} : ${e.lastError}`, 'error');
        this.notifyWriter(e, `[RoSwarm] Studio a refusé src/${e.rel} : ${e.lastError}`);
      }
      void item;
    });
    const ok = list.filter(({ e }) => e.status === 'applied').length;
    if (ok) coord.log(this.projectId, 'Sync', `${ok} script(s) → Studio` + (ok === 1 ? ` (src/${list.find(({ e }) => e.status === 'applied').e.rel})` : ''), 'sync');
  }

  transportFailure(e, err) {
    if (err.notApplied) {
      // Rien n'a été appliqué (Studio absent, file pleine…) : on réessaiera tel quel.
      e.status = 'pending';
      e.nextRetryAt = Date.now() + 1000;
      e.lastError = err.message;
      if (e.dirty) e.dirty = false;
      this.changed();
      return;
    }
    if (err.code === 'REJECTED') {
      e.permanent = true;
      this.finish(e, 'failed', err.message);
      return;
    }
    // Résultat inconnu : nouvelle tentative (sync_upsert est idempotent), attente croissante.
    e.attempts++;
    e.nextRetryAt = Date.now() + Math.min(30000, 1000 * 2 ** (e.attempts - 1));
    this.finish(e, e.attempts >= MAX_ATTEMPTS ? 'failed' : 'unknown', err.message);
    if (e.status === 'failed') coord.log(this.projectId, 'Sync', `abandon temporaire pour src/${e.rel} après ${e.attempts} essais : ${err.message}`, 'error');
  }

  async sendDelete(e) {
    const info = fileToInstance(e.rel);
    e.inFlight = true;
    e.status = 'in_progress';
    this.changed();
    try {
      const r = await studio.call('sync_delete', { path: info.path }, { timeoutMs: UPSERT_TIMEOUT_MS });
      e.inFlight = false;
      if (r?.status === 'kept') coord.log(this.projectId, 'Sync', `src/${e.rel} supprimé, mais gardé dans Studio : ${r.reason}`, 'warning');
      else coord.log(this.projectId, 'Sync', `supprimé dans Studio : ${info.path.join('/')}`, 'sync');
      this.setBase(e.rel, undefined);
      if (e.dirty) return this.finish(e, 'pending'); // recréé entre-temps
      this.files.delete(e.rel);
      this.finish(e, 'applied');
    } catch (err) {
      e.inFlight = false;
      this.transportFailure(e, err);
    }
  }

  recordSyntax(e, syntaxError) {
    const before = e.syntaxError;
    e.syntaxError = syntaxError;
    if (syntaxError && syntaxError !== before) {
      coord.log(this.projectId, 'Sync', `erreur de syntaxe dans src/${e.rel} : ${syntaxError}`, 'error');
      this.notifyWriter(e, `[RoSwarm] Studio signale une erreur de syntaxe dans src/${e.rel} : ${syntaxError}. Corrige-la.`);
    }
  }

  notifyWriter(e, text) {
    if (e.lastWriter && agents.get(e.lastWriter)) agents.notify(e.lastWriter, text);
  }

  saveConflictCopy(rel, source, why) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(this.project.dir, '.roswarm', 'conflicts', `${rel}.${stamp}.studio.txt`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, String(source));
      coord.log(this.projectId, 'Sync', `version Studio de src/${rel} sauvegardée (${why}) : .roswarm/conflicts/`, 'warning');
      return file;
    } catch (err) {
      coord.log(this.projectId, 'Sync', `impossible de sauvegarder la version Studio de src/${rel} : ${err.message}`, 'error');
      return null;
    }
  }

  // ---------- changements venant de Studio ----------

  /** Un script synchronisé a été modifié directement dans Studio. Renvoie ce qui a été fait. */
  applyStudioChange(item) {
    if (!this.enabled()) return 'disabled';
    if (!item || typeof item !== 'object' || typeof item.source !== 'string' || !SCRIPT_CLASSES.includes(item.className)) return 'invalid';
    if (Buffer.byteLength(item.source) > MAX_SCRIPT_BYTES) return 'too_big';
    const candidates = candidateFiles(item.path);
    if (!candidates.length) return 'invalid';
    let rel;
    try {
      rel = candidates.find((c) => fs.existsSync(resolveInside(this.src, c))) || instanceToFile(item.path, item.className);
      resolveInside(this.src, rel);
    } catch {
      return 'invalid';
    }
    const full = path.join(this.src, rel);
    const source = normalizeSource(item.source);
    const studioHash = fnv1a(source);
    let localHash;
    try {
      localHash = fnv1a(fs.readFileSync(full, 'utf8'));
    } catch {}
    const e = this.files.get(rel);
    const B = this.base[rel];
    if (localHash === studioHash) {
      this.setBase(rel, studioHash);
      return 'same';
    }
    const localPending = e && ['pending', 'in_progress', 'unknown'].includes(e.status);
    const localDiverged = localHash !== undefined && localHash !== B;
    if (localPending || localDiverged) {
      // Les deux côtés ont changé : on garde le fichier (travail des agents) et on sauvegarde la version Studio.
      this.saveConflictCopy(rel, item.source, 'modifiée dans Studio et localement en même temps');
      const x = this.entry(rel);
      // On renvoie la version locale même si sa base semble à jour : Studio a maintenant autre chose.
      if (x.inFlight) x.dirty = true;
      else this.touch(rel);
      x.force = true;
      x.conflictAt = Date.now();
      this.notifyWriter(x, `[RoSwarm] Conflit sur src/${rel} : quelqu'un l'a aussi modifié dans Studio. Ta version est gardée, celle de Studio est dans .roswarm/conflicts/.`);
      this.changed();
      return 'conflict';
    }
    writeAtomic(full, source);
    this.setBase(rel, studioHash);
    const x = this.entry(rel);
    x.status = 'applied';
    this.changed();
    coord.log(this.projectId, 'Sync', `Studio → src/${rel}`, 'sync');
    return 'written';
  }

  /** Écrit un script dans src/ (utilisé par set_script_source) puis attend la confirmation de Studio. */
  async writeScript(instPath, className, source) {
    const candidates = candidateFiles(instPath);
    if (!candidates.length) throw new Error('Nom de script invalide pour un fichier : ' + instPath.join('/'));
    const existing = candidates.find((c) => fs.existsSync(resolveInside(this.src, c)));
    const cls = className || (existing ? fileToInstance(existing).className : defaultClassFor(instPath));
    const rel = instanceToFile(instPath, cls);
    if (!rel) throw new Error('Classe de script invalide : ' + cls);
    if (Buffer.byteLength(source) > MAX_SCRIPT_BYTES) throw new Error('Script trop gros');
    if (existing && existing !== rel) fs.rmSync(resolveInside(this.src, existing), { force: true });
    writeAtomic(resolveInside(this.src, rel), source);
    this.touch(rel);
    if (!studio.status().connected) return { rel: 'src/' + rel, status: 'pending' };
    const e = await this.waitFor(rel, 30000);
    return { rel: 'src/' + rel, status: e.status, error: e.lastError, syntaxError: e.syntaxError };
  }

  // ---------- réconciliation / import / export ----------

  scanLocal() {
    const local = {};
    for (const rel of walk(this.src)) {
      try {
        local[rel] = fnv1a(fs.readFileSync(path.join(this.src, rel), 'utf8'));
      } catch {}
    }
    return local;
  }

  async fetchSources(rels) {
    const out = {};
    for (let i = 0; i < rels.length; i += 50) {
      const chunk = rels.slice(i, i + 50);
      const r = await studio.call('get_sources', { paths: chunk.map((rel) => fileToInstance(rel).path) }, { timeoutMs: 120000 });
      (r?.sources || []).forEach((s, j) => {
        if (s && typeof s.source === 'string') out[chunk[j]] = s.source;
      });
    }
    return out;
  }

  /** Aligne Studio et src/ après une (re)connexion. */
  reconcile() {
    if (!this.reconciling) {
      this.reconciling = this._reconcile().finally(() => {
        this.reconciling = null;
      });
    }
    return this.reconciling;
  }

  async _reconcile() {
    const local = this.scanLocal();
    const manifest = await studio.call('sync_manifest', {}, { timeoutMs: 180000 });
    const studioMap = {};
    const classes = {};
    for (const m of manifest?.scripts || []) {
      const rel = instanceToFile(m.path, m.className);
      if (rel && typeof m.hash === 'string') {
        studioMap[rel] = m.hash;
        classes[rel] = m.className;
      }
    }
    const nLocal = Object.keys(local).length;
    const nStudio = Object.keys(studioMap).length;
    if (!nLocal && !nStudio) {
      const r = await this.pullAll();
      return { mode: 'import', ...r };
    }
    const plan = planReconcile(local, studioMap, this.base);
    if (!nLocal && plan.deleteInStudio.length) {
      // src/ vide alors que des scripts étaient synchronisés : dossier déplacé, disque absent… On ne supprime rien
      // dans Studio sur cette seule base : on réimporte plutôt les scripts.
      coord.log(this.projectId, 'Sync', `src/ est vide : aucune suppression automatique dans Studio, ${plan.deleteInStudio.length} script(s) réimporté(s)`, 'warning');
      plan.pull.push(...plan.deleteInStudio);
      plan.deleteInStudio = [];
    }
    for (const rel of plan.same) this.setBase(rel, local[rel]);
    for (const rel of plan.push) this.touch(rel);
    const needSources = [...plan.pull, ...plan.conflict.filter((rel) => studioMap[rel] !== undefined)];
    const sources = needSources.length ? await this.fetchSources(needSources) : {};
    for (const rel of plan.pull) {
      if (sources[rel] === undefined) continue;
      writeAtomic(path.join(this.src, rel), normalizeSource(sources[rel]));
      this.setBase(rel, fnv1a(sources[rel]));
      this.entry(rel).status = 'applied';
    }
    for (const rel of plan.conflict) {
      if (sources[rel] !== undefined) this.saveConflictCopy(rel, sources[rel], 'modifiée des deux côtés pendant la déconnexion');
      if (local[rel] !== undefined) {
        this.touch(rel); // le fichier gagne
        this.entry(rel).conflictAt = Date.now();
      } else if (sources[rel] !== undefined) {
        writeAtomic(path.join(this.src, rel), normalizeSource(sources[rel])); // supprimé ici mais modifié dans Studio : on restaure
        this.setBase(rel, fnv1a(sources[rel]));
      }
    }
    for (const rel of plan.deleteInStudio) {
      const e = this.entry(rel);
      e.status = 'pending';
      e.missingSince = 1; // déjà absent depuis longtemps
    }
    this.changed();
    const summary = `push ${plan.push.length}, import ${plan.pull.length}, conflits ${plan.conflict.length}, suppressions ${plan.deleteInStudio.length}, identiques ${plan.same.length}`;
    coord.log(this.projectId, 'Sync', 'réconciliation avec Studio : ' + summary, plan.conflict.length ? 'warning' : 'sync');
    return { mode: 'reconcile', plan: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])) };
  }

  /** Force l'envoi de tout src/ vers Studio. */
  pushAll() {
    const files = walk(this.src);
    for (const rel of files) {
      this.touch(rel);
      this.entry(rel).force = true;
    }
    return files.length;
  }

  /** Importe tous les scripts de la place ouverte dans src/ (écrase les fichiers du même nom, en sauvegardant ceux qui diffèrent). */
  async pullAll() {
    let offset = 1;
    let written = 0;
    const skipped = [];
    const seen = new Set();
    for (let guard = 0; guard < 500 && offset; guard++) {
      const r = await studio.call('pull_scripts', { offset }, { timeoutMs: 180000 });
      for (const s of r?.scripts || []) {
        const rel = s && typeof s.source === 'string' ? instanceToFile(s.path, s.className) : null;
        if (!rel || seen.has(rel.toLowerCase())) {
          skipped.push(Array.isArray(s?.path) ? s.path.join('/') : '?');
          continue;
        }
        seen.add(rel.toLowerCase());
        const full = resolveInside(this.src, rel);
        const source = normalizeSource(s.source);
        try {
          const cur = fs.readFileSync(full, 'utf8');
          if (fnv1a(cur) !== fnv1a(source) && fnv1a(cur) !== this.base[rel]) this.saveConflictCopy(rel, cur, 'fichier local remplacé par l’import');
        } catch {}
        writeAtomic(full, source);
        this.setBase(rel, fnv1a(source));
        this.entry(rel).status = 'applied';
        written++;
      }
      offset = Number.isInteger(r?.nextOffset) ? r.nextOffset : 0;
    }
    this.changed();
    coord.log(
      this.projectId,
      'Sync',
      `${written} script(s) importés de Studio vers src/` + (skipped.length ? ` (${skipped.length} ignorés : noms en double ou invalides)` : ''),
      'sync',
    );
    return { written, skipped };
  }

  stats() {
    const counts = { pending: 0, in_progress: 0, applied: 0, unknown: 0, failed: 0, conflict: 0 };
    const problems = [];
    const recentConflicts = [];
    for (const e of this.files.values()) {
      counts[e.status] = (counts[e.status] || 0) + 1;
      if (e.status === 'failed') problems.push({ rel: e.rel, error: e.lastError, permanent: e.permanent });
      if (e.conflictAt && Date.now() - e.conflictAt < 3600e3) recentConflicts.push(e.rel);
      if (e.syntaxError) problems.push({ rel: e.rel, error: 'syntaxe : ' + e.syntaxError, permanent: false });
    }
    counts.tracked = Object.keys(this.base).length;
    return { enabled: this.enabled(), counts, problems: problems.slice(0, 50), conflicts: recentConflicts.slice(0, 50) };
  }

  fileStatus(rel) {
    const e = this.files.get(rel);
    return {
      rel,
      exists: fs.existsSync(path.join(this.src, rel)),
      status: e ? e.status : this.base[rel] ? 'applied' : 'untracked',
      inStudio: this.base[rel] !== undefined,
      error: e?.lastError || '',
      syntaxError: e?.syntaxError || null,
    };
  }
}

const syncs = new Map();

export function forProject(projectId) {
  const p = projects.get(projectId);
  if (!p) return null;
  if (!syncs.has(projectId)) {
    const s = new ProjectSync(p);
    syncs.set(projectId, s);
    s.start();
  }
  return syncs.get(projectId);
}

export function forActive() {
  const id = projects.activeId();
  return id ? forProject(id) : null;
}

export function stopAll() {
  for (const s of syncs.values()) s.stop();
}

/** Studio vient de se connecter : on aligne Studio et src/. */
export async function onStudioConnected() {
  const s = forActive();
  if (!s || !s.enabled()) return;
  try {
    await s.reconcile();
  } catch (e) {
    coord.log(s.projectId, 'Sync', 'Synchronisation initiale impossible : ' + e.message, 'error');
  }
}

bus.on('studio-connected', () => {
  onStudioConnected();
});

export { SUFFIX };
