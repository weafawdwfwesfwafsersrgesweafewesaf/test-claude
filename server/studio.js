// Pont avec le plugin Roblox Studio (long-polling HTTP sur 127.0.0.1).
// Le plugin demande des commandes (/plugin/poll), les exécute, et renvoie le résultat (/plugin/result).
import crypto from 'node:crypto';
import { bus } from './bus.js';

const POLL_HOLD_MS = 20000;
const ALIVE_MS = 35000;

const sessions = new Map();
let activeSessionId = null;
const pending = new Map(); // id commande -> { resolve, reject, timer, sessionId }
const logs = []; // sortie de Studio (toutes sessions), récente à la fin

function alive(s) {
  return s && Date.now() - s.lastSeen < ALIVE_MS;
}

export function activeSession() {
  const s = sessions.get(activeSessionId);
  if (alive(s)) return s;
  let best = null;
  for (const x of sessions.values()) if (alive(x) && (!best || x.firstSeen > best.firstSeen)) best = x;
  if (best && best.id !== activeSessionId) {
    activeSessionId = best.id;
    bus.emit('studio');
  }
  return best;
}

export function setActive(id) {
  if (sessions.has(id)) {
    activeSessionId = id;
    bus.emit('studio');
  }
}

export function status() {
  const s = activeSession();
  return {
    connected: !!s,
    activeSessionId: s ? s.id : null,
    placeName: s ? s.placeName : null,
    placeId: s ? s.placeId : null,
    sessions: [...sessions.values()].filter(alive).map((x) => ({ id: x.id, placeName: x.placeName, placeId: x.placeId })),
  };
}

setInterval(() => {
  let changed = false;
  for (const [id, s] of sessions) {
    if (!alive(s)) {
      sessions.delete(id);
      changed = true;
      for (const [cid, p] of pending) {
        if (p.sessionId === id) {
          clearTimeout(p.timer);
          pending.delete(cid);
          p.reject(new Error('Roblox Studio a été déconnecté pendant la commande.'));
        }
      }
    }
  }
  if (changed) bus.emit('studio');
}, 5000).unref();

function flush(s) {
  if (!s.waiter || !s.queue.length) return;
  const res = s.waiter;
  s.waiter = null;
  clearTimeout(s.waiterTimer);
  const commands = s.queue.splice(0, 20);
  send(res, { commands });
}

function send(res, obj) {
  if (res.writableEnded) return;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/** Envoie une commande à Studio et attend la réponse. */
export function call(tool, args = {}, { timeoutMs = 90000 } = {}) {
  const s = activeSession();
  if (!s) {
    return Promise.reject(
      new Error(
        "Roblox Studio n'est pas connecté. Ouvre ta place dans Studio : le plugin RoSwarm se connecte tout seul (bouton RoSwarm dans l'onglet Plugins).",
      ),
    );
  }
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Studio n'a pas répondu à "${tool}" à temps.`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer, sessionId: s.id });
    s.queue.push({ id, tool, args });
    flush(s);
  });
}

// ----- Routes appelées par le plugin -----

export function handlePoll(body, res) {
  const id = String(body.sessionId || '');
  if (!id) return send(res, { commands: [] });
  let s = sessions.get(id);
  const isNew = !s;
  if (!s) {
    s = { id, queue: [], waiter: null, waiterTimer: null, firstSeen: Date.now() };
    sessions.set(id, s);
  }
  s.lastSeen = Date.now();
  s.placeName = String(body.placeName || 'Place');
  s.placeId = body.placeId || 0;
  if (s.waiter) send(s.waiter, { commands: [] });
  s.waiter = res;
  res.on('close', () => {
    if (s.waiter === res) s.waiter = null;
  });
  s.waiterTimer = setTimeout(() => {
    if (s.waiter === res) {
      s.waiter = null;
      send(res, { commands: [] });
    }
  }, POLL_HOLD_MS);
  if (isNew) {
    if (!activeSessionId || !alive(sessions.get(activeSessionId))) activeSessionId = id;
    bus.emit('studio');
    bus.emit('studio-connected', s);
  }
  flush(s);
}

export function handleResult(body) {
  const p = pending.get(body.id);
  if (!p) return;
  pending.delete(body.id);
  clearTimeout(p.timer);
  if (body.ok) p.resolve(body.result === undefined ? null : body.result);
  else p.reject(new Error(String(body.error || 'Erreur inconnue dans Studio')));
}

export function handleLog(body) {
  const items = Array.isArray(body.messages) ? body.messages : [];
  const added = [];
  for (const m of items.slice(0, 500)) {
    const entry = { at: Date.now(), text: String(m.text || '').slice(0, 2000), level: String(m.level || 'info'), play: !!body.play };
    logs.push(entry);
    added.push(entry);
  }
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  if (added.length) bus.emit('studio-log', added);
}

export function getLogs(count = 60, onlyErrors = false) {
  const list = onlyErrors ? logs.filter((l) => l.level === 'warning' || l.level === 'error') : logs;
  return list.slice(-count);
}
