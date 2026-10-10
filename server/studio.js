// Pont avec le plugin Roblox Studio (long-polling HTTP sur 127.0.0.1).
//
// Protocole (toutes les routes exigent le jeton du plugin, voir pluginAuth.js) :
//   /plugin/hello   -> ouvre une session ; le serveur renvoie un sessionId aléatoire (128 bits).
//   /plugin/poll    { sessionId, lastPollId } -> { pollId, commands }
//   /plugin/result  { sessionId, id, ok, result | error }
// Livraison « au moins une fois » : une commande envoyée dans la réponse pollId=N est considérée comme
// reçue quand le plugin renvoie lastPollId >= N. Sinon (réponse perdue), elle est renvoyée telle quelle.
// Le plugin garde les résultats des commandes déjà exécutées et les renvoie au lieu de ré-exécuter (idempotence).
// Quand une session disparaît, les commandes déjà livrées sans résultat échouent avec un résultat INCONNU.
import crypto from 'node:crypto';
import { bus } from './bus.js';

// Réglables par variables d'environnement (utilisé par les tests pour simuler déconnexions et délais).
const POLL_HOLD_MS = Number(process.env.ROSWARM_POLL_HOLD_MS) || 20000;
export const SESSION_TTL_MS = Number(process.env.ROSWARM_SESSION_TTL_MS) || 35000;
const MAX_QUEUE = 500; // commandes en attente par session
const MAX_PENDING = 2000; // commandes non résolues au total
const MAX_COMMANDS_PER_POLL = 20;
const MAX_DELIVERY_ATTEMPTS = 5;

export class StudioError extends Error {
  // code : NO_STUDIO | QUEUE_FULL | TIMEOUT_NOT_DELIVERED | TIMEOUT_UNKNOWN | DISCONNECTED_UNKNOWN | NOT_DELIVERED | REJECTED
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  /** L'opération n'a sûrement pas eu lieu dans Studio : on peut la refaire sans risque. */
  get notApplied() {
    return ['NO_STUDIO', 'QUEUE_FULL', 'TIMEOUT_NOT_DELIVERED', 'NOT_DELIVERED'].includes(this.code);
  }
  /** On ne sait pas si l'opération a eu lieu. */
  get unknown() {
    return ['TIMEOUT_UNKNOWN', 'DISCONNECTED_UNKNOWN'].includes(this.code);
  }
}

const sessions = new Map(); // sessionId -> session
let activeSessionId = null;
const commands = new Map(); // id commande -> { id, tool, args, sessionId, state, pollId, attempts, resolve, reject, timer }
const logs = [];

function alive(s) {
  return !!s && !s.closed && Date.now() - s.lastSeen < SESSION_TTL_MS;
}

/** Session capable de recevoir des commandes (pas une session « sortie seulement » d'un test Play). */
function usable(s) {
  return alive(s) && !s.logOnly;
}

export function activeSession() {
  const s = sessions.get(activeSessionId);
  if (usable(s)) return s;
  let best = null;
  for (const x of sessions.values()) if (usable(x) && (!best || x.openedAt > best.openedAt)) best = x;
  const id = best ? best.id : null;
  if (id !== activeSessionId) {
    activeSessionId = id;
    bus.emit('studio');
  }
  return best;
}

export function setActive(id) {
  const s = sessions.get(id);
  if (!usable(s)) throw new Error('Session Studio introuvable');
  activeSessionId = id;
  bus.emit('studio');
}

export function status() {
  const s = activeSession();
  return {
    connected: !!s,
    activeSessionId: s ? s.id : null,
    placeName: s ? s.placeName : null,
    placeId: s ? s.placeId : null,
    pluginVersion: s ? s.version : null,
    sessions: [...sessions.values()].filter(usable).map((x) => ({ id: x.id, placeName: x.placeName, placeId: x.placeId })),
    pendingCommands: commands.size,
  };
}

function send(res, status, obj) {
  if (res.writableEnded || res.destroyed) return false;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
  return true;
}

function settle(cmd, err, value) {
  if (!commands.has(cmd.id)) return;
  commands.delete(cmd.id);
  clearTimeout(cmd.timer);
  const s = sessions.get(cmd.sessionId);
  if (s) {
    const i = s.queue.indexOf(cmd);
    if (i >= 0) s.queue.splice(i, 1);
  }
  if (err) cmd.reject(err);
  else cmd.resolve(value);
}

function closeSession(s, reason) {
  if (s.closed) return;
  s.closed = true;
  sessions.delete(s.id);
  if (s.waiter) send(s.waiter, 401, { error: reason, code: 'SESSION_CLOSED' });
  s.waiter = null;
  clearTimeout(s.waiterTimer);
  for (const cmd of [...commands.values()]) {
    if (cmd.sessionId !== s.id) continue;
    if (cmd.state === 'queued') settle(cmd, new StudioError('NOT_DELIVERED', `Studio s'est déconnecté avant de recevoir « ${cmd.tool} » (rien n'a été appliqué).`));
    else
      settle(
        cmd,
        new StudioError('DISCONNECTED_UNKNOWN', `Studio s'est déconnecté pendant « ${cmd.tool} » : impossible de savoir si la commande a été appliquée.`),
      );
  }
  if (activeSessionId === s.id) activeSessionId = null;
  bus.emit('studio');
  bus.emit('studio-disconnected', { sessionId: s.id, reason });
}

setInterval(() => {
  for (const s of [...sessions.values()]) if (!alive(s)) closeSession(s, 'Session expirée');
}, Math.min(5000, SESSION_TTL_MS / 4)).unref();

bus.on('plugin-revoked', (tokenId) => {
  for (const s of [...sessions.values()]) if (s.tokenId === tokenId) closeSession(s, 'Jeton révoqué');
});

function flush(s) {
  if (!s.waiter || s.closed) return;
  const ready = s.queue.filter((c) => c.state === 'queued').slice(0, MAX_COMMANDS_PER_POLL);
  if (!ready.length) return;
  const res = s.waiter;
  s.waiter = null;
  clearTimeout(s.waiterTimer);
  const pollId = ++s.pollSeq;
  for (const c of ready) {
    c.state = 'delivered';
    c.pollId = pollId;
    c.attempts++;
  }
  const ok = send(res, 200, { pollId, commands: ready.map((c) => ({ id: c.id, tool: c.tool, args: c.args })) });
  if (!ok) for (const c of ready) c.state = 'queued'; // la connexion était déjà fermée : rien n'est parti
}

/** Envoie une commande à Studio et attend son résultat. */
export function call(tool, args = {}, { timeoutMs = 90000, sessionId } = {}) {
  const s = sessionId ? sessions.get(sessionId) : activeSession();
  if (!usable(s)) {
    return Promise.reject(
      new StudioError(
        'NO_STUDIO',
        "Roblox Studio n'est pas connecté. Ouvre ta place dans Studio : le plugin RoSwarm se connecte tout seul (il faut l'avoir autorisé une fois dans RoSwarm).",
      ),
    );
  }
  if (s.queue.length >= MAX_QUEUE || commands.size >= MAX_PENDING) {
    return Promise.reject(new StudioError('QUEUE_FULL', 'Trop de commandes en attente pour Studio, réessaie dans un instant.'));
  }
  const cmd = { id: crypto.randomUUID(), tool, args, sessionId: s.id, state: 'queued', pollId: 0, attempts: 0 };
  const p = new Promise((resolve, reject) => {
    cmd.resolve = resolve;
    cmd.reject = reject;
  });
  cmd.timer = setTimeout(() => {
    if (cmd.state === 'queued') settle(cmd, new StudioError('TIMEOUT_NOT_DELIVERED', `Studio n'a pas récupéré « ${tool} » à temps (rien n'a été appliqué).`));
    else settle(cmd, new StudioError('TIMEOUT_UNKNOWN', `Studio n'a pas répondu à « ${tool} » à temps : résultat inconnu.`));
  }, timeoutMs);
  commands.set(cmd.id, cmd);
  s.queue.push(cmd);
  flush(s);
  return p;
}

// ---------- Routes du plugin (le jeton est vérifié par index.js avant d'arriver ici) ----------

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function sessionFor(auth, body) {
  const s = sessions.get(typeof body.sessionId === 'string' ? body.sessionId : '');
  if (!s || s.closed) return null;
  if (s.tokenId !== auth.id) return null; // une session ne peut être utilisée qu'avec le jeton qui l'a ouverte
  return s;
}

export function handleHello(auth, body, projectId) {
  const instanceId = str(body.instanceId, 64);
  // Le même Studio qui se reconnecte (même jeton + même instance) reprend sa session : ses commandes en cours continuent.
  const logOnly = body.logOnly === true;
  for (const s of sessions.values()) {
    if (alive(s) && s.tokenId === auth.id && instanceId && s.instanceId === instanceId && s.logOnly === logOnly) {
      s.lastSeen = Date.now();
      return { sessionId: s.id, resumed: true };
    }
  }
  const s = {
    id: crypto.randomBytes(16).toString('hex'),
    tokenId: auth.id,
    instanceId,
    projectId,
    placeName: str(body.placeName, 100) || 'Place',
    placeId: Number(body.placeId) || 0,
    version: str(body.version, 20),
    queue: [],
    waiter: null,
    waiterTimer: null,
    pollSeq: 0,
    openedAt: Date.now(),
    lastSeen: Date.now(),
    closed: false,
    logOnly,
  };
  if ([...sessions.values()].filter((x) => x.tokenId === auth.id).length >= 20) {
    // un même jeton ne peut pas ouvrir des sessions sans fin : on ferme la plus ancienne
    const oldest = [...sessions.values()].filter((x) => x.tokenId === auth.id).sort((a, b) => a.lastSeen - b.lastSeen)[0];
    closeSession(oldest, 'Trop de sessions');
  }
  sessions.set(s.id, s);
  if (logOnly) return { sessionId: s.id, resumed: false };
  if (!usable(sessions.get(activeSessionId))) activeSessionId = s.id;
  bus.emit('studio');
  bus.emit('studio-connected', s);
  return { sessionId: s.id, resumed: false };
}

export function handlePoll(auth, body, res) {
  const s = sessionFor(auth, body);
  if (!s || s.logOnly) return send(res, 401, { error: 'Session inconnue ou expirée', code: 'BAD_SESSION' });
  s.lastSeen = Date.now();
  const lastPollId = Number.isInteger(body.lastPollId) ? body.lastPollId : 0;
  // Commandes livrées dans une réponse que le plugin n'a jamais reçue : on les remet dans la file.
  for (const c of s.queue) {
    if (c.state === 'delivered' && c.pollId > lastPollId) {
      if (c.attempts >= MAX_DELIVERY_ATTEMPTS) settle(c, new StudioError('TIMEOUT_UNKNOWN', `Impossible de livrer « ${c.tool} » à Studio.`));
      else c.state = 'queued';
    }
  }
  if (s.waiter) send(s.waiter, 200, { pollId: s.pollSeq, commands: [] });
  s.waiter = res;
  res.on('close', () => {
    if (s.waiter === res) s.waiter = null;
  });
  clearTimeout(s.waiterTimer);
  s.waiterTimer = setTimeout(() => {
    if (s.waiter === res) {
      s.waiter = null;
      send(res, 200, { pollId: s.pollSeq, commands: [] });
    }
  }, POLL_HOLD_MS);
  flush(s);
}

/** Résultat d'une commande. Renvoie un objet décrivant ce qui a été fait (jamais d'exception pour un doublon). */
export function handleResult(auth, body) {
  const s = sessionFor(auth, body);
  if (!s) return { status: 401, body: { error: 'Session inconnue ou expirée', code: 'BAD_SESSION' } };
  s.lastSeen = Date.now();
  const id = str(body.id, 64);
  const cmd = commands.get(id);
  if (!cmd) {
    // doublon, ou résultat arrivé après l'expiration du délai : ignoré sans effet
    // (les opérations dont le résultat était inconnu sont de toute façon refaites par la synchronisation)
    return { status: 200, body: { ok: true, ignored: true } };
  }
  if (cmd.sessionId !== s.id) return { status: 403, body: { error: "Cette commande n'appartient pas à cette session", code: 'WRONG_SESSION' } };
  if (cmd.state !== 'delivered') return { status: 409, body: { error: "Cette commande n'a pas été livrée", code: 'NOT_DELIVERED' } };
  if (body.ok === true) settle(cmd, null, body.result === undefined ? null : body.result);
  else settle(cmd, new StudioError('REJECTED', str(body.error, 4000) || 'Erreur inconnue dans Studio'));
  return { status: 200, body: { ok: true } };
}

export function handleLog(body) {
  const items = Array.isArray(body.messages) ? body.messages : [];
  const added = [];
  for (const m of items.slice(0, 500)) {
    if (!m || typeof m !== 'object') continue;
    const level = ['info', 'warning', 'error'].includes(m.level) ? m.level : 'info';
    const entry = { at: Date.now(), text: str(m.text, 2000), level, play: !!body.play };
    logs.push(entry);
    added.push(entry);
  }
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  if (added.length) bus.emit('studio-log', added);
  return added.length;
}

/** Le projet actif a changé : la session Studio active travaille désormais pour lui. */
export function bindProject(projectId) {
  const s = activeSession();
  if (s) s.projectId = projectId;
}

export function sessionOf(auth, body) {
  const s = sessionFor(auth, body);
  if (s) s.lastSeen = Date.now();
  return s;
}

export function getLogs(count = 60, onlyErrors = false) {
  const list = onlyErrors ? logs.filter((l) => l.level === 'warning' || l.level === 'error') : logs;
  return list.slice(-count);
}

export function shutdown() {
  for (const s of [...sessions.values()]) closeSession(s, 'Arrêt de RoSwarm');
}
