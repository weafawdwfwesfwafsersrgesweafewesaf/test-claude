// Logique pure de la synchronisation (sans effet de bord) : chemins, empreintes, plan de réconciliation.
import fs from 'node:fs';
import path from 'node:path';

export const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;

const EXTS = [
  ['.server.luau', 'Script'],
  ['.server.lua', 'Script'],
  ['.client.luau', 'LocalScript'],
  ['.client.lua', 'LocalScript'],
  ['.luau', 'ModuleScript'],
  ['.lua', 'ModuleScript'],
];
export const SUFFIX = { Script: '.server.luau', LocalScript: '.client.luau', ModuleScript: '.luau' };
export const SCRIPT_CLASSES = Object.keys(SUFFIX);

// Noms impossibles ou dangereux comme nom de fichier/dossier (Windows inclus).
const BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export function validName(n) {
  return (
    typeof n === 'string' &&
    n.length > 0 &&
    n.length <= 100 &&
    !BAD_CHARS.test(n) &&
    !RESERVED.test(n) &&
    n !== '.' &&
    n !== '..' &&
    !n.startsWith('.') &&
    !/[. ]$/.test(n)
  );
}

/** 'ServerScriptService/A/B.server.luau' -> { path: [...], className } ; null si ce n'est pas un script synchronisable. */
export function fileToInstance(rel) {
  if (typeof rel !== 'string') return null;
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const file = parts.pop();
  if (!parts.every(validName)) return null;
  for (const [ext, className] of EXTS) {
    if (file.toLowerCase().endsWith(ext) && file.length > ext.length) {
      const name = file.slice(0, -ext.length);
      if (!validName(name)) return null;
      return { path: [...parts, name], className };
    }
  }
  return null;
}

export function instanceToFile(instPath, className) {
  if (!Array.isArray(instPath) || instPath.length < 2 || instPath.length > 30) return null;
  if (!instPath.every(validName)) return null;
  if (!SUFFIX[className]) return null;
  return instPath.join('/') + SUFFIX[className];
}

/** Les trois noms de fichier possibles pour une instance (Script / LocalScript / ModuleScript). */
export function candidateFiles(instPath) {
  return SCRIPT_CLASSES.map((c) => instanceToFile(instPath, c)).filter(Boolean);
}

export function defaultClassFor(instPath) {
  const [svc, sub] = instPath;
  if (svc === 'ServerScriptService' || svc === 'ServerStorage' || svc === 'Workspace') return 'Script';
  if (svc === 'StarterGui' || svc === 'StarterPack' || svc === 'ReplicatedFirst') return 'LocalScript';
  if (svc === 'StarterPlayer' && (sub === 'StarterPlayerScripts' || sub === 'StarterCharacterScripts')) return 'LocalScript';
  return 'ModuleScript';
}

/**
 * Résout un chemin relatif à src/ en chemin absolu, en refusant tout ce qui sort de src/
 * (« .. », chemins absolus, liens symboliques vers l'extérieur). Lève une erreur sinon.
 */
export function resolveInside(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) throw new Error('Chemin invalide');
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error('Chemin absolu refusé : ' + rel);
  const parts = rel.replace(/\\/g, '/').split('/');
  if (parts.some((p) => p === '..')) throw new Error('Chemin qui sort du projet refusé : ' + rel);
  const full = path.resolve(root, ...parts);
  const rootAbs = path.resolve(root);
  if (full !== rootAbs && !full.startsWith(rootAbs + path.sep)) throw new Error('Chemin hors du projet refusé : ' + rel);
  // Liens symboliques : le plus proche parent existant doit rester dans root.
  let realRoot = rootAbs;
  try {
    realRoot = fs.realpathSync(rootAbs);
  } catch {}
  let probe = full;
  while (probe.length >= rootAbs.length) {
    try {
      const real = fs.realpathSync(probe);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error('Lien symbolique vers l’extérieur refusé : ' + rel);
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      probe = path.dirname(probe);
    }
  }
  return full;
}

/** Normalisation commune au serveur et au plugin : fins de ligne LF. */
export function normalizeSource(s) {
  return String(s).replace(/\r\n/g, '\n');
}

/** FNV-1a 32 bits sur les octets UTF-8, identique à la fonction fnv1a du plugin (RoSwarm.lua). */
export function fnv1a(str) {
  const bytes = Buffer.from(normalizeSource(str), 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Plan de réconciliation à la connexion de Studio (synchronisation à trois points).
 *   local  : { rel -> hash }  fichiers de src/
 *   studio : { rel -> hash }  scripts marqués RoSwarm dans Studio
 *   base   : { rel -> hash }  dernier état connu comme identique des deux côtés
 * Renvoie des listes d'actions. Règles :
 *   - identiques                              -> rien (on met la base à jour)
 *   - seul le local a changé (studio == base)  -> push
 *   - seul Studio a changé (local == base)     -> pull
 *   - les deux ont changé / pas de base        -> conflit : le local gagne, la version Studio est sauvegardée
 *   - fichier supprimé localement, Studio inchangé depuis la base -> suppression dans Studio
 *   - script présent seulement dans Studio (nouveau)               -> pull
 */
export function planReconcile(local, studio, base) {
  const plan = { push: [], pull: [], conflict: [], deleteInStudio: [], deleteLocal: [], same: [] };
  for (const rel of Object.keys(local)) {
    const L = local[rel];
    const S = studio[rel];
    const B = base[rel];
    if (S === undefined) {
      plan.push.push(rel);
    } else if (L === S) {
      plan.same.push(rel);
    } else if (B !== undefined && S === B) {
      plan.push.push(rel);
    } else if (B !== undefined && L === B) {
      plan.pull.push(rel);
    } else {
      plan.conflict.push(rel);
    }
  }
  for (const rel of Object.keys(studio)) {
    if (local[rel] !== undefined) continue;
    const B = base[rel];
    if (B !== undefined && studio[rel] === B) plan.deleteInStudio.push(rel);
    else if (B !== undefined) plan.conflict.push(rel); // supprimé localement mais modifié dans Studio : on garde Studio
    else plan.pull.push(rel);
  }
  return plan;
}
