// Authentification du plugin Roblox Studio.
//
// Contrat :
// - Le plugin n'a aucun secret au départ. Il demande un appairage (/plugin/pair) avec un identifiant de demande
//   aléatoire et un code à 4 chiffres qu'il affiche dans la sortie de Studio.
// - L'utilisateur voit la demande (nom de la place + code) dans RoSwarm et clique « Autoriser ».
// - Le plugin récupère alors, une seule fois, un jeton de 256 bits (/plugin/pair-status) qu'il garde dans ses réglages.
// - Toute autre route du plugin exige ce jeton (en-tête X-RoSwarm-Plugin). Le serveur n'en garde qu'une empreinte SHA-256.
// - Un jeton peut être révoqué depuis l'interface : les sessions ouvertes avec lui sont fermées immédiatement.
import crypto from 'node:crypto';
import path from 'node:path';
import { bus } from './bus.js';
import { DATA_DIR, readJson, writeJson } from './config.js';

const FILE = path.join(DATA_DIR, 'plugin-tokens.json');
const PENDING_TTL_MS = 5 * 60 * 1000;
const DELIVERY_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING = 5;
const MAX_REQUESTS_PER_MIN = 10;

const store = readJson(FILE, null) || { tokens: [] };
const pending = new Map(); // requestId -> demande
let recentRequests = [];

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

function save() {
  writeJson(FILE, store);
}

function purgePending() {
  const now = Date.now();
  for (const [id, p] of pending) {
    const ttl = p.status === 'approved' ? DELIVERY_TTL_MS : PENDING_TTL_MS;
    if (now - (p.approvedAt || p.createdAt) > ttl) pending.delete(id);
  }
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
    if (status === 401) this.code = 'BAD_TOKEN';
  }
}

export function requestPairing({ requestId, code, placeName }) {
  purgePending();
  const now = Date.now();
  recentRequests = recentRequests.filter((t) => now - t < 60000);
  if (recentRequests.length >= MAX_REQUESTS_PER_MIN) throw new AuthError("Trop de demandes d'appairage, réessaie dans une minute.", 429);
  if (typeof requestId !== 'string' || !/^[0-9A-Za-z-]{20,64}$/.test(requestId)) throw new AuthError('requestId invalide', 400);
  if (typeof code !== 'string' || !/^\d{4}$/.test(code)) throw new AuthError('code invalide', 400);
  if (pending.has(requestId)) return { status: pending.get(requestId).status };
  recentRequests.push(now);
  if (pending.size >= MAX_PENDING) {
    const oldest = [...pending.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    pending.delete(oldest.requestId);
  }
  pending.set(requestId, {
    requestId,
    code,
    placeName: String(placeName || 'Place').slice(0, 100),
    createdAt: now,
    status: 'pending',
    token: null,
  });
  bus.emit('pairing');
  return { status: 'pending' };
}

/** Appelé par le plugin : renvoie le jeton une seule fois quand la demande est approuvée. */
export function pairingStatus(requestId) {
  purgePending();
  const p = pending.get(String(requestId || ''));
  if (!p) return { status: 'unknown' };
  if (p.status === 'rejected') {
    pending.delete(p.requestId);
    return { status: 'rejected' };
  }
  if (p.status === 'approved') {
    pending.delete(p.requestId);
    return { status: 'approved', token: p.token };
  }
  return { status: 'pending' };
}

/** Appelé par l'interface (protégée par le jeton de l'application). */
export function approve(requestId) {
  purgePending();
  const p = pending.get(requestId);
  if (!p || p.status !== 'pending') throw new AuthError('Demande introuvable ou expirée', 404);
  const token = crypto.randomBytes(32).toString('hex');
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    hash: sha256(token).toString('hex'),
    label: p.placeName,
    createdAt: Date.now(),
    lastUsedAt: null,
  };
  store.tokens.push(entry);
  save();
  p.status = 'approved';
  p.approvedAt = Date.now();
  p.token = token;
  bus.emit('pairing');
  return { id: entry.id };
}

export function reject(requestId) {
  const p = pending.get(requestId);
  if (p) {
    p.status = 'rejected';
    bus.emit('pairing');
  }
}

export function listPending() {
  purgePending();
  return [...pending.values()]
    .filter((p) => p.status === 'pending')
    .map((p) => ({ requestId: p.requestId, code: p.code, placeName: p.placeName, createdAt: p.createdAt }));
}

export function listTokens() {
  return store.tokens.map(({ id, label, createdAt, lastUsedAt }) => ({ id, label, createdAt, lastUsedAt }));
}

/** Vérifie un jeton de plugin. Renvoie l'entrée (sans secret) ou lève AuthError. */
export function verify(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new AuthError('Plugin non appairé', 401);
  const h = sha256(token);
  const found = store.tokens.find((t) => crypto.timingSafeEqual(Buffer.from(t.hash, 'hex'), h));
  if (!found) throw new AuthError('Jeton de plugin inconnu ou révoqué', 401);
  const now = Date.now();
  if (!found.lastUsedAt || now - found.lastUsedAt > 60000) {
    found.lastUsedAt = now;
    save();
  }
  return found;
}

export function revoke(id) {
  const before = store.tokens.length;
  store.tokens = store.tokens.filter((t) => t.id !== id);
  if (store.tokens.length !== before) {
    save();
    bus.emit('plugin-revoked', id);
    bus.emit('pairing');
  }
}
