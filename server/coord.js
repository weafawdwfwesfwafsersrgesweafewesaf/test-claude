// Coordination entre agents : réservations (verrous), tableau de tâches, messages, journal d'activité.
import path from 'node:path';
import { bus } from './bus.js';
import { DATA_DIR, readJson, writeJson } from './config.js';

export const LOCK_MS = 10 * 60 * 1000;

// ---------- Réservations ----------
// clé : `${projectId}::${ressource normalisée}`
const locks = new Map();

export function normResource(r) {
  let s = String(r || '').trim().replace(/\\/g, '/');
  s = s.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
  return s;
}

const keyOf = (projectId, r) => `${projectId}::${normResource(r).toLowerCase()}`;

function purge() {
  const now = Date.now();
  let changed = false;
  for (const [k, l] of locks) {
    if (l.expires <= now) {
      locks.delete(k);
      changed = true;
    }
  }
  return changed;
}

setInterval(() => {
  if (purge()) bus.emit('locks');
}, 15000).unref();

/** Réserve toutes les ressources ou aucune. */
export function claim(projectId, agent, resources, note) {
  purge();
  const list = resources.map(normResource).filter(Boolean);
  const conflicts = [];
  for (const r of list) {
    const l = locks.get(keyOf(projectId, r));
    if (l && l.agentId !== agent.id) conflicts.push({ resource: r, holder: l });
  }
  if (conflicts.length) return { ok: false, conflicts };
  const expires = Date.now() + LOCK_MS;
  for (const r of list) {
    locks.set(keyOf(projectId, r), {
      projectId,
      resource: r,
      agentId: agent.id,
      agentName: agent.name,
      note: note || '',
      expires,
    });
  }
  bus.emit('locks');
  return { ok: true, resources: list, expires };
}

export function release(projectId, agentId, resources) {
  let n = 0;
  if (!resources || !resources.length) {
    for (const [k, l] of locks) {
      if (l.agentId === agentId && (!projectId || l.projectId === projectId)) {
        locks.delete(k);
        n++;
      }
    }
  } else {
    for (const r of resources) {
      const k = keyOf(projectId, r);
      const l = locks.get(k);
      if (l && l.agentId === agentId) {
        locks.delete(k);
        n++;
      }
    }
  }
  if (n) bus.emit('locks');
  return n;
}

export function listLocks(projectId) {
  purge();
  return [...locks.values()].filter((l) => !projectId || l.projectId === projectId);
}

export function describeConflict(c) {
  const min = Math.max(1, Math.round((c.holder.expires - Date.now()) / 60000));
  return `"${c.resource}" est réservé par ${c.holder.agentName} (encore ~${min} min${c.holder.note ? ` — ${c.holder.note}` : ''})`;
}

// ---------- Tableau de tâches + messages (persistés par projet) ----------
const boards = new Map();
const boardFile = (projectId) => path.join(DATA_DIR, 'boards', projectId + '.json');

export function board(projectId) {
  if (!boards.has(projectId)) {
    const b = readJson(boardFile(projectId), null) || { nextId: 1, tasks: [], messages: [] };
    boards.set(projectId, b);
  }
  return boards.get(projectId);
}

function saveBoard(projectId) {
  writeJson(boardFile(projectId), board(projectId));
  bus.emit('board', projectId);
}

export function createTask(projectId, { title, details, assignee, createdBy }) {
  const b = board(projectId);
  const task = {
    id: b.nextId++,
    title: String(title || 'Sans titre').slice(0, 200),
    details: String(details || '').slice(0, 4000),
    status: 'todo',
    assignee: assignee || '',
    createdBy: createdBy || 'Toi',
    notes: [],
    updatedAt: Date.now(),
  };
  b.tasks.push(task);
  saveBoard(projectId);
  return task;
}

export function updateTask(projectId, id, patch, by) {
  const b = board(projectId);
  const t = b.tasks.find((x) => x.id === Number(id));
  if (!t) return null;
  if (patch.status && ['todo', 'doing', 'done'].includes(patch.status)) t.status = patch.status;
  if (patch.assignee !== undefined) t.assignee = patch.assignee;
  if (patch.title) t.title = String(patch.title).slice(0, 200);
  if (patch.details !== undefined) t.details = String(patch.details).slice(0, 4000);
  if (patch.note) t.notes.push({ by: by || 'Toi', text: String(patch.note).slice(0, 2000), at: Date.now() });
  t.updatedAt = Date.now();
  saveBoard(projectId);
  return t;
}

export function deleteTask(projectId, id) {
  const b = board(projectId);
  const before = b.tasks.length;
  b.tasks = b.tasks.filter((x) => x.id !== Number(id));
  if (b.tasks.length !== before) saveBoard(projectId);
}

export function postMessage(projectId, { from, to, text }) {
  const b = board(projectId);
  const m = { id: Date.now() + Math.random(), from: from || 'Toi', to: to || 'all', text: String(text || '').slice(0, 4000), at: Date.now() };
  b.messages.push(m);
  if (b.messages.length > 200) b.messages.splice(0, b.messages.length - 200);
  saveBoard(projectId);
  return m;
}

// ---------- Journal d'activité (mémoire) ----------
const activity = new Map();

export function log(projectId, who, text, kind = 'info') {
  if (!projectId) return;
  if (!activity.has(projectId)) activity.set(projectId, []);
  const list = activity.get(projectId);
  const entry = { at: Date.now(), who, text: String(text).slice(0, 300), kind };
  list.push(entry);
  if (list.length > 300) list.splice(0, list.length - 300);
  bus.emit('activity', projectId, entry);
}

export function getActivity(projectId) {
  return activity.get(projectId) || [];
}
