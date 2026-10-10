// Synchronisation des scripts : fichiers de src/ <-> scripts dans Roblox Studio.
//   src/ServerScriptService/Shop.server.luau          -> Script      ServerScriptService.Shop
//   src/StarterPlayer/StarterPlayerScripts/Hud.client.luau -> LocalScript
//   src/ReplicatedStorage/Modules/Config.luau          -> ModuleScript
// Les fichiers font foi : à la connexion de Studio, src/ est poussé (ou importé si src/ est vide).
import fs from 'node:fs';
import path from 'node:path';
import { bus } from './bus.js';
import * as studio from './studio.js';
import * as projects from './projects.js';
import * as coord from './coord.js';

const EXTS = [
  ['.server.luau', 'Script'],
  ['.server.lua', 'Script'],
  ['.client.luau', 'LocalScript'],
  ['.client.lua', 'LocalScript'],
  ['.luau', 'ModuleScript'],
  ['.lua', 'ModuleScript'],
];
const SUFFIX = { Script: '.server.luau', LocalScript: '.client.luau', ModuleScript: '.luau' };
const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]|^\.|[. ]$/;

/** 'ServerScriptService/A/B.server.luau' -> { path: ['ServerScriptService','A','B'], className: 'Script' } */
export function fileToInstance(rel) {
  rel = rel.replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const file = parts.pop();
  for (const [ext, className] of EXTS) {
    if (file.toLowerCase().endsWith(ext) && file.length > ext.length) {
      return { path: [...parts, file.slice(0, -ext.length)], className };
    }
  }
  return null;
}

export function instanceToFile(instPath, className) {
  if (instPath.some((n) => BAD_NAME.test(n) || !n)) return null;
  return instPath.join('/') + (SUFFIX[className] || '.luau');
}

export function defaultClassFor(instPath) {
  const [svc, sub] = instPath;
  if (svc === 'ServerScriptService' || svc === 'ServerStorage' || svc === 'Workspace') return 'Script';
  if (svc === 'StarterGui' || svc === 'StarterPack' || svc === 'ReplicatedFirst') return 'LocalScript';
  if (svc === 'StarterPlayer' && (sub === 'StarterPlayerScripts' || sub === 'StarterCharacterScripts')) return 'LocalScript';
  return 'ModuleScript';
}

function walk(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (fileToInstance(path.relative(base, full))) out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

// ---------- Par projet ----------

class ProjectSync {
  constructor(project) {
    this.projectId = project.id;
    this.lastPushed = new Map(); // rel (dans src) -> contenu
    this.timers = new Map();
    this.watcher = null;
  }

  get project() {
    return projects.get(this.projectId);
  }

  get src() {
    return path.join(this.project.dir, 'src');
  }

  start() {
    this.stop();
    fs.mkdirSync(this.src, { recursive: true });
    try {
      this.watcher = fs.watch(this.src, { recursive: true }, (_ev, file) => {
        if (!file) return;
        const rel = String(file).replace(/\\/g, '/');
        clearTimeout(this.timers.get(rel));
        this.timers.set(rel, setTimeout(() => this.onFileEvent(rel), 200));
      });
      this.watcher.on('error', () => {});
    } catch (e) {
      coord.log(this.projectId, 'Sync', 'Surveillance de src/ impossible : ' + e.message, 'error');
    }
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
  }

  enabled() {
    return !!this.project?.sync;
  }

  async onFileEvent(rel) {
    this.timers.delete(rel);
    if (!this.enabled() || !studio.status().connected) return;
    const full = path.join(this.src, rel);
    let stat = null;
    try {
      stat = fs.statSync(full);
    } catch {}
    if (stat?.isDirectory()) {
      for (const f of walk(full, this.src)) await this.pushFile(f);
      return;
    }
    if (stat) return this.pushFile(rel);
    // supprimé : le fichier lui-même ou tout un dossier
    const gone = [...this.lastPushed.keys()].filter((k) => k === rel || k.startsWith(rel + '/'));
    for (const k of gone) {
      const info = fileToInstance(k);
      this.lastPushed.delete(k);
      if (!info) continue;
      try {
        await studio.call('sync_delete', { path: info.path });
        coord.log(this.projectId, 'Sync', `supprimé dans Studio : ${info.path.join('/')}`, 'sync');
      } catch {}
    }
  }

  async pushFile(rel, { force = false } = {}) {
    const info = fileToInstance(rel);
    if (!info) return;
    let source;
    try {
      source = fs.readFileSync(path.join(this.src, rel), 'utf8');
    } catch {
      return;
    }
    if (!force && this.lastPushed.get(rel) === source) return;
    this.lastPushed.set(rel, source);
    try {
      await studio.call('sync_upsert', { items: [{ path: info.path, className: info.className, source }] });
      coord.log(this.projectId, 'Sync', `src/${rel} → Studio`, 'sync');
    } catch (e) {
      this.lastPushed.delete(rel);
      coord.log(this.projectId, 'Sync', `échec pour src/${rel} : ${e.message}`, 'error');
    }
  }

  /** Pousse tout src/ vers Studio. */
  async pushAll() {
    const files = walk(this.src);
    let batch = [];
    let size = 0;
    let count = 0;
    const flush = async () => {
      if (!batch.length) return;
      await studio.call('sync_upsert', { items: batch }, { timeoutMs: 180000 });
      count += batch.length;
      batch = [];
      size = 0;
    };
    for (const rel of files) {
      const info = fileToInstance(rel);
      const source = fs.readFileSync(path.join(this.src, rel), 'utf8');
      this.lastPushed.set(rel, source);
      batch.push({ path: info.path, className: info.className, source });
      size += source.length;
      if (batch.length >= 40 || size > 300_000) await flush();
    }
    await flush();
    coord.log(this.projectId, 'Sync', `${count} script(s) de src/ envoyés à Studio`, 'sync');
    return count;
  }

  /** Importe tous les scripts de la place ouverte dans src/. */
  async pullAll() {
    let offset = 1;
    let written = 0;
    const skipped = [];
    const seen = new Set();
    for (let guard = 0; guard < 500 && offset; guard++) {
      const r = await studio.call('pull_scripts', { offset }, { timeoutMs: 180000 });
      for (const s of r.scripts || []) {
        const rel = instanceToFile(s.path, s.className);
        if (!rel || seen.has(rel.toLowerCase())) {
          skipped.push(s.path.join('/'));
          continue;
        }
        seen.add(rel.toLowerCase());
        const full = path.join(this.src, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        this.lastPushed.set(rel, s.source);
        fs.writeFileSync(full, s.source);
        written++;
      }
      offset = r.nextOffset || 0;
    }
    coord.log(
      this.projectId,
      'Sync',
      `${written} script(s) importés de Studio vers src/` + (skipped.length ? ` (${skipped.length} ignorés : noms en double ou invalides)` : ''),
      'sync',
    );
    return { written, skipped };
  }

  /** Un script a été modifié directement dans Studio. */
  applyStudioChange(item) {
    if (!this.enabled() || !Array.isArray(item.path)) return;
    const candidates = Object.keys(SUFFIX).map((c) => instanceToFile(item.path, c)).filter(Boolean);
    let rel = candidates.find((c) => fs.existsSync(path.join(this.src, c))) || instanceToFile(item.path, item.className);
    if (!rel) return;
    const full = path.join(this.src, rel);
    let current = null;
    try {
      current = fs.readFileSync(full, 'utf8');
    } catch {}
    if (current === item.source) return;
    this.lastPushed.set(rel, item.source);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, item.source);
    coord.log(this.projectId, 'Sync', `Studio → src/${rel}`, 'sync');
  }

  /** Écrit un script dans src/ (utilisé par set_script_source) puis le pousse. */
  async writeScript(instPath, className, source) {
    const candidates = Object.keys(SUFFIX).map((c) => instanceToFile(instPath, c)).filter(Boolean);
    const existing = candidates.find((c) => fs.existsSync(path.join(this.src, c)));
    const cls = className || (existing ? fileToInstance(existing).className : defaultClassFor(instPath));
    const rel = instanceToFile(instPath, cls);
    if (!rel) throw new Error('Nom de script invalide pour un fichier : ' + instPath.join('/'));
    if (existing && existing !== rel) fs.rmSync(path.join(this.src, existing), { force: true });
    const full = path.join(this.src, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
    await this.pushFile(rel, { force: true });
    return 'src/' + rel;
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
    if (walk(s.src).length === 0) await s.pullAll();
    else await s.pushAll();
  } catch (e) {
    coord.log(s.projectId, 'Sync', 'Synchronisation initiale impossible : ' + e.message, 'error');
  }
}

bus.on('studio-connected', () => {
  onStudioConnected();
});
