// Chemins, port et jeton partagés par tout le serveur.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.2.0';
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.ROSWARM_PORT) || 34900;
export const DATA_DIR = process.env.ROSWARM_HOME || path.join(os.homedir(), '.roswarm');
export const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), 'RoSwarm');
export const IS_WIN = process.platform === 'win32';

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadToken() {
  const file = path.join(DATA_DIR, 'token');
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {}
  const t = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(file, t, { mode: 0o600 });
  return t;
}

export const TOKEN = loadToken();

// Lu par bridge.cjs et hook.cjs pour joindre le serveur.
export function writeConnectionFile(port) {
  fs.writeFileSync(
    path.join(DATA_DIR, 'connection.json'),
    JSON.stringify({ port, token: TOKEN, pid: process.pid }),
    { mode: 0o600 },
  );
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Chemins avec des "/" : acceptés par Windows et sans souci de guillemets dans bash/cmd.
export const fwd = (p) => p.replace(/\\/g, '/');
