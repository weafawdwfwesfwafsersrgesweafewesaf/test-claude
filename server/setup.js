// Détection et installation : agents en ligne de commande et plugin Roblox Studio.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT, IS_WIN } from './config.js';

export const AGENT_TYPES = {
  claude: {
    label: 'Claude Code',
    bin: 'claude',
    color: '#d97757',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude',
    hint: 'Abonnement Claude Pro/Max ou clé API Anthropic',
  },
  codex: {
    label: 'Codex',
    bin: 'codex',
    color: '#10a37f',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
    hint: 'Abonnement ChatGPT ou clé API OpenAI',
  },
  gemini: {
    label: 'Gemini CLI',
    bin: 'gemini',
    color: '#4f8df7',
    install: 'npm install -g @google/gemini-cli',
    login: 'gemini',
    hint: 'Compte Google (offre gratuite disponible)',
  },
  opencode: {
    label: 'OpenCode',
    bin: 'opencode',
    color: '#f5a524',
    install: 'npm install -g opencode-ai',
    login: 'opencode auth login',
    hint: 'Le fournisseur de ton choix (dont des modèles gratuits)',
  },
  shell: { label: 'Terminal', bin: null, color: '#8b8fa3', hint: 'Un terminal dans le dossier du projet' },
  custom: { label: 'Commande perso', bin: null, color: '#b07cf7', hint: 'N’importe quel agent en ligne de commande' },
};

/** Cherche un exécutable dans le PATH (comme `which`). */
export function which(bin) {
  if (!bin) return null;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase()) : [''];
  const extra = [];
  if (!IS_WIN) extra.push(path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'), '/opt/homebrew/bin', '/usr/local/bin');
  else {
    if (process.env.APPDATA) extra.push(path.join(process.env.APPDATA, 'npm'));
    extra.push(path.join(os.homedir(), '.local', 'bin'));
  }
  for (const dir of [...dirs, ...extra]) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {}
    }
  }
  return null;
}

export function pluginSource() {
  return path.join(APP_ROOT, 'plugin', 'RoSwarm.lua');
}

export function pluginDir() {
  if (process.env.ROSWARM_PLUGIN_DIR) return process.env.ROSWARM_PLUGIN_DIR;
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Roblox', 'Plugins');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Documents', 'Roblox', 'Plugins');
  return null;
}

export function pluginStatus() {
  const dir = pluginDir();
  if (!dir) return { supported: false, installed: false, upToDate: false, dir: null };
  const target = path.join(dir, 'RoSwarm.lua');
  let installed = false;
  let upToDate = false;
  try {
    const cur = fs.readFileSync(target, 'utf8');
    installed = true;
    upToDate = cur === fs.readFileSync(pluginSource(), 'utf8');
  } catch {}
  return { supported: true, installed, upToDate, dir, file: target };
}

export function installPlugin() {
  const dir = pluginDir();
  if (!dir) throw new Error("Roblox Studio n'existe que sur Windows et macOS. Copie plugin/RoSwarm.lua à la main dans ton dossier Plugins.");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(pluginSource(), path.join(dir, 'RoSwarm.lua'));
  return pluginStatus();
}

export function status() {
  const agents = {};
  for (const [type, t] of Object.entries(AGENT_TYPES)) {
    if (!t.bin) continue;
    const p = which(t.bin);
    agents[type] = { installed: !!p, path: p };
  }
  return {
    platform: process.platform,
    node: process.version,
    npm: !!which('npm'),
    git: !!which('git'),
    plugin: pluginStatus(),
    agents,
  };
}
