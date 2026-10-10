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
  const list = [...new Set((Array.isArray(resources) ? resources : []).map(normResource).filter(Boolean))].slice(0, 50);
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

// ---------- Qui a écrit quoi (détection des écrasements entre agents) ----------
const writers = new Map(); // `${projectId}::${fichier}` -> { agentId, agentName, at }
const WRITE_WINDOW_MS = 30 * 60 * 1000;

/** Enregistre une écriture. Renvoie l'auteur précédent si c'était un autre agent, récemment. */
export function noteWrite(projectId, rel, agent) {
  const key = keyOf(projectId, rel);
  const prev = writers.get(key);
  writers.set(key, { agentId: agent.id, agentName: agent.name, at: Date.now() });
  if (writers.size > 5000) writers.delete(writers.keys().next().value);
  if (prev && prev.agentId !== agent.id && Date.now() - prev.at < WRITE_WINDOW_MS) return prev;
  return null;
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
    b.tasks = Array.isArray(b.tasks) ? b.tasks.map(normalizeTask) : [];
    b.messages = Array.isArray(b.messages) ? b.messages : [];
    boards.set(projectId, b);
  }
  return boards.get(projectId);
}

function saveBoard(projectId) {
  writeJson(boardFile(projectId), board(projectId));
  bus.emit('board', projectId);
}

// Cycle de vie d'une tâche :
//   todo -> doing -> review -> done        (review = un agent dit avoir fini ; le créateur ou l'utilisateur valide)
//   doing/review -> blocked -> todo|doing  (bloquée : dépendance, question…)
//   done -> doing                          (réouverture)
// Un agent qui termine une tâche créée par quelqu'un d'autre la fait passer en « review », pas en « done ».
// Seuls le créateur et l'utilisateur peuvent valider (review -> done). L'utilisateur (interface) peut tout forcer.
// Une tâche ne peut passer « doing » que si ses dépendances (dependsOn) sont « done ».
export const TASK_STATUSES = ['todo', 'doing', 'review', 'blocked', 'done'];
const TRANSITIONS = {
  todo: ['doing', 'blocked', 'done'],
  doing: ['review', 'blocked', 'todo', 'done'],
  review: ['done', 'doing', 'blocked'],
  blocked: ['todo', 'doing'],
  done: ['doing'],
};
const MAX_TASKS = 500;

export class TaskError extends Error {}

function normalizeTask(t) {
  t.notes = Array.isArray(t.notes) ? t.notes : [];
  t.history = Array.isArray(t.history) ? t.history : [];
  t.dependsOn = Array.isArray(t.dependsOn) ? t.dependsOn : [];
  t.acceptance = t.acceptance || '';
  if (!TASK_STATUSES.includes(t.status)) t.status = 'todo';
  return t;
}

export function createTask(projectId, { title, details, assignee, createdBy, acceptance, dependsOn }) {
  const b = board(projectId);
  const deps = (Array.isArray(dependsOn) ? dependsOn : dependsOn != null ? [dependsOn] : []).map(Number).filter(Number.isInteger);
  for (const d of deps) if (!b.tasks.some((x) => x.id === d)) throw new TaskError(`Dépendance #${d} introuvable`);
  const task = normalizeTask({
    id: b.nextId++,
    title: String(title || 'Sans titre').slice(0, 200),
    details: String(details || '').slice(0, 4000),
    acceptance: String(acceptance || '').slice(0, 2000),
    dependsOn: deps,
    status: 'todo',
    assignee: assignee || '',
    createdBy: createdBy || 'Toi',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  b.tasks.push(task);
  if (b.tasks.length > MAX_TASKS) {
    const removable = b.tasks.filter((x) => x.status === 'done').sort((x, y) => x.updatedAt - y.updatedAt);
    const drop = new Set(removable.slice(0, b.tasks.length - MAX_TASKS).map((x) => x.id));
    b.tasks = b.tasks.filter((x) => !drop.has(x.id));
  }
  saveBoard(projectId);
  return task;
}

export function unfinishedDeps(projectId, t) {
  const b = board(projectId);
  return t.dependsOn.filter((d) => b.tasks.find((x) => x.id === d)?.status !== 'done');
}

/**
 * Met à jour une tâche. Renvoie { task, changed, message } ; lève TaskError pour une transition interdite.
 * `by` = nom de l'agent (ou 'Toi'), `asUser` = action de l'utilisateur dans l'interface (aucune restriction).
 */
export function updateTask(projectId, id, patch, by, { asUser = false } = {}) {
  const b = board(projectId);
  const t = b.tasks.find((x) => x.id === Number(id));
  if (!t) return { task: null, changed: false, message: `Tâche #${id} introuvable.` };
  normalizeTask(t);
  let changed = false;
  let message = '';
  let target = patch.status;
  if (target !== undefined && target !== null && target !== '') {
    if (!TASK_STATUSES.includes(target)) throw new TaskError(`Statut inconnu : ${target}`);
    const requested = target;
    // « fini » par quelqu'un d'autre que le créateur : la tâche attend une validation
    if (!asUser && target === 'done' && t.status !== 'review' && by !== t.createdBy) target = 'review';
    if (target === t.status) {
      message = `déjà « ${target} »`;
    } else {
      if (!asUser && !TRANSITIONS[t.status].includes(requested)) throw new TaskError(`Transition interdite : ${t.status} → ${requested}`);
      if (!asUser && target === 'done' && t.status === 'review' && by !== t.createdBy) {
        throw new TaskError(`Seul ${t.createdBy} (le créateur) ou l'utilisateur peut valider la tâche #${t.id}.`);
      }
      if (!asUser && target === 'doing') {
        const deps = unfinishedDeps(projectId, t);
        if (deps.length) throw new TaskError(`Tâche #${t.id} bloquée : dépendances pas terminées (${deps.map((d) => '#' + d).join(', ')}).`);
      }
      t.history.push({ at: Date.now(), by: by || 'Toi', from: t.status, to: target });
      if (t.history.length > 30) t.history.shift();
      t.status = target;
      changed = true;
    }
  }
  if (patch.assignee !== undefined && patch.assignee !== t.assignee) {
    t.assignee = String(patch.assignee || '').slice(0, 80);
    changed = true;
  }
  if (patch.title) {
    t.title = String(patch.title).slice(0, 200);
    changed = true;
  }
  if (patch.details !== undefined) {
    t.details = String(patch.details).slice(0, 4000);
    changed = true;
  }
  if (patch.acceptance !== undefined) {
    t.acceptance = String(patch.acceptance).slice(0, 2000);
    changed = true;
  }
  if (patch.note) {
    t.notes.push({ by: by || 'Toi', text: String(patch.note).slice(0, 2000), at: Date.now() });
    if (t.notes.length > 50) t.notes.shift();
    changed = true;
  }
  if (changed) {
    t.updatedAt = Date.now();
    saveBoard(projectId);
  }
  return { task: t, changed, message };
}

/** Un agent est parti (arrêté, planté) : ses tâches en cours redeviennent « à faire ». */
export function releaseTasksOf(projectId, agentName, reason) {
  const b = board(projectId);
  const released = [];
  for (const t of b.tasks) {
    normalizeTask(t);
    if (t.assignee === agentName && t.status === 'doing') {
      t.history.push({ at: Date.now(), by: 'RoSwarm', from: t.status, to: 'todo' });
      t.status = 'todo';
      t.notes.push({ by: 'RoSwarm', text: `${agentName} ${reason} : tâche remise à faire.`, at: Date.now() });
      t.updatedAt = Date.now();
      released.push(t);
    }
  }
  if (released.length) saveBoard(projectId);
  return released;
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
