// Agents : chaque agent est un vrai terminal (PTY) qui fait tourner un CLI d'IA dans le dossier du projet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pty from '@lydell/node-pty';
import { bus } from './bus.js';
import { APP_ROOT, DATA_DIR, IS_WIN, fwd, readJson, writeJson } from './config.js';
import { AGENT_TYPES, which } from './setup.js';
import * as projects from './projects.js';
import * as coord from './coord.js';
import { ROLES, systemPromptFor } from './roles.js';

const agents = new Map();
let seq = 0;
const MAX_BUFFER = 400_000;

const NODE = process.execPath;
const BRIDGE = path.join(APP_ROOT, 'server', 'bridge.cjs');
const HOOK = path.join(APP_ROOT, 'server', 'hook.cjs');

export function get(id) {
  return agents.get(id) || null;
}

export function all() {
  return [...agents.values()];
}

export function publicInfo(a) {
  return {
    id: a.id,
    num: a.num,
    type: a.type,
    label: a.label,
    name: a.name,
    color: a.color,
    projectId: a.projectId,
    tabId: a.tabId,
    setup: a.setup,
    status: a.status,
    exitCode: a.exitCode ?? null,
    lastAction: a.lastAction || '',
    command: a.commandLine,
    role: a.role || null,
    model: a.model || null,
    permissionMode: a.permissionMode || null,
    inbox: a.inbox.length,
  };
}

export function list() {
  return all().map(publicInfo);
}

// ---------- Ligne de commande ----------

const posixQuote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const winQuote = (s) => (/^[\w@+=:,./\\-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`);
const quote = IS_WIN ? winQuote : posixQuote;
const tomlLit = (s) => `'${fwd(s)}'`;

function launch(cmdline) {
  if (IS_WIN) {
    if (!cmdline) return { file: 'powershell.exe', args: ['-NoLogo'] };
    return { file: process.env.ComSpec || 'cmd.exe', args: `/d /s /c "${cmdline}"` };
  }
  const sh = process.env.SHELL || '/bin/bash';
  if (!cmdline) return { file: sh, args: ['-l'] };
  return { file: sh, args: ['-lc', cmdline] };
}

function mergeJsonFile(file, mutate) {
  let data = {};
  if (fs.existsSync(file)) {
    data = readJson(file, null);
    if (!data || typeof data !== 'object') return false; // fichier perso illisible : on n'y touche pas
  }
  mutate(data);
  writeJson(file, data);
  return true;
}

/** Prépare la config MCP/hooks de l'agent et renvoie les arguments à ajouter à sa commande. */
function prepare(a, project) {
  const bridgeArgs = [BRIDGE, '--agent', a.id, '--home', DATA_DIR];
  const runDir = path.join(DATA_DIR, 'run', a.id);
  fs.mkdirSync(runDir, { recursive: true });

  if (a.type === 'claude') {
    const mcpFile = path.join(runDir, 'mcp.json');
    writeJson(mcpFile, { mcpServers: { roswarm: { type: 'stdio', command: NODE, args: bridgeArgs } } });
    const hook = (event) => [
      { type: 'command', command: `"${fwd(NODE)}" "${fwd(HOOK)}" --agent ${a.id} --event ${event} --home "${fwd(DATA_DIR)}"`, timeout: 10 },
    ];
    const settingsFile = path.join(runDir, 'settings.json');
    writeJson(settingsFile, {
      permissions: { allow: ['mcp__roswarm'] },
      hooks: {
        PreToolUse: [{ matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: hook('pre') }],
        PostToolUse: [{ matcher: '*', hooks: hook('post') }],
        SessionStart: [{ hooks: hook('start') }],
        UserPromptSubmit: [{ hooks: hook('prompt') }],
        Notification: [{ hooks: hook('notify') }],
        Stop: [{ hooks: hook('stop') }],
      },
    });
    const args = ['--mcp-config', mcpFile, '--settings', settingsFile, '--name', a.name];
    args.push('--append-system-prompt', systemPromptFor(a.name, a.role));
    if (a.model) args.push('--model', a.model);
    if (a.permissionMode) args.push('--permission-mode', a.permissionMode);
    return args;
  }

  if (a.type === 'codex') {
    return [
      '-c', `mcp_servers.roswarm.command=${tomlLit(NODE)}`,
      '-c', `mcp_servers.roswarm.args=[${bridgeArgs.map(tomlLit).join(',')}]`,
      '-c', 'mcp_servers.roswarm.tool_timeout_sec=200',
    ];
  }

  if (a.type === 'gemini' && project) {
    mergeJsonFile(path.join(project.dir, '.gemini', 'settings.json'), (d) => {
      d.mcpServers = d.mcpServers || {};
      d.mcpServers.roswarm = {
        command: NODE,
        args: [BRIDGE, '--home', DATA_DIR],
        env: { ROSWARM_AGENT: '$ROSWARM_AGENT' },
        trust: true,
        timeout: 200000,
      };
    });
    // Gemini ignore les serveurs MCP d'un dossier « non fiable » : on marque le dossier du projet comme fiable.
    const trustFile = process.env.GEMINI_CLI_TRUSTED_FOLDERS_PATH || path.join(os.homedir(), '.gemini', 'trustedFolders.json');
    mergeJsonFile(trustFile, (d) => {
      d[project.dir] = 'TRUST_FOLDER';
    });
    return [];
  }

  if (a.type === 'opencode' && project) {
    mergeJsonFile(path.join(project.dir, 'opencode.json'), (d) => {
      d.$schema = d.$schema || 'https://opencode.ai/config.json';
      d.mcp = d.mcp || {};
      d.mcp.roswarm = {
        type: 'local',
        command: [NODE, BRIDGE, '--home', DATA_DIR],
        enabled: true,
        environment: { ROSWARM_AGENT: '{env:ROSWARM_AGENT}' },
      };
    });
    return [];
  }
  return [];
}

function buildCommand(a, project) {
  if (a.type === 'shell') return null;
  if (a.type === 'custom' || a.setup) return a.command;
  const t = AGENT_TYPES[a.type];
  const bin = which(t.bin);
  if (!bin) throw new Error(`${t.label} n'est pas installé. Installe-le depuis l'accueil (bouton « Installer »).`);
  const extra = prepare(a, project);
  return [quote(bin), ...extra.map(quote)].join(' ');
}

// ---------- Cycle de vie ----------

function start(a) {
  const project = a.projectId ? projects.get(a.projectId) : null;
  const cwd = project && fs.existsSync(project.dir) ? project.dir : os.homedir();
  const cmdline = buildCommand(a, project);
  a.commandLine = cmdline || '(terminal)';
  const env = {
    ...process.env,
    ROSWARM_AGENT: a.id,
    ROSWARM_HOME: DATA_DIR,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  };
  delete env.CLAUDECODE;
  const { file, args } = launch(cmdline);
  a.exitCode = undefined;
  a.hookStatus = null;
  a.ready = false;
  a.startedAt = Date.now();
  a.status = 'starting';
  a.pty = pty.spawn(file, args, { name: 'xterm-256color', cols: a.cols, rows: a.rows, cwd, env, useConpty: true });
  a.pty.onData((data) => {
    a.lastOutputAt = Date.now();
    a.buffer += data;
    if (a.buffer.length > MAX_BUFFER) a.buffer = a.buffer.slice(-MAX_BUFFER * 0.75);
    bus.emit('term', a.id, data);
  });
  const p = a.pty;
  p.onExit(({ exitCode }) => {
    if (a.pty !== p) return;
    a.pty = null;
    a.exitCode = exitCode;
    const msg = `\r\n\x1b[90m[RoSwarm] Processus terminé (code ${exitCode}). Clique sur ⟳ pour relancer.\x1b[0m\r\n`;
    a.buffer += msg;
    bus.emit('term', a.id, msg);
    coord.release(a.projectId, a.id);
    refreshStatus(a, true);
  });
  refreshStatus(a, true);
}

const MODELS = ['sonnet', 'opus', 'haiku'];
const MODES = ['acceptEdits', 'default', 'plan', 'auto'];

export function spawn({ projectId = null, tabId = 't1', type, command, setup = false, cols = 100, rows = 30, role, model, permissionMode }) {
  const t = AGENT_TYPES[type];
  if (!t) throw new Error('Type d’agent inconnu : ' + type);
  if (!setup && !projects.get(projectId)) throw new Error('Projet introuvable');
  if (type === 'custom' && !String(command || '').trim()) throw new Error('Indique la commande à lancer.');
  const id = 'a' + ++seq;
  const sameProject = all().filter((x) => x.projectId === projectId && !x.setup);
  const num = setup ? 0 : sameProject.reduce((m, x) => Math.max(m, x.num), 0) + 1;
  const label = type === 'custom' ? String(command).trim().split(/\s+/)[0] : type === 'claude' ? 'Claude' : t.label;
  role = ROLES[role] ? role : null;
  const a = {
    id,
    num,
    type,
    label,
    name: setup ? label : `#${num} ${label}` + (role ? ` · ${ROLES[role].label}` : ''),
    role,
    model: type === 'claude' && MODELS.includes(model) ? model : null,
    permissionMode: type === 'claude' && MODES.includes(permissionMode) && permissionMode !== 'default' ? permissionMode : null,
    inbox: [],
    ready: false,
    startedAt: Date.now(),
    color: t.color,
    projectId,
    tabId,
    setup,
    command: command ? String(command).trim() : null,
    buffer: '',
    cols,
    rows,
    lastOutputAt: 0,
    lastAction: '',
  };
  agents.set(id, a);
  try {
    start(a);
  } catch (e) {
    agents.delete(id);
    throw e;
  }
  bus.emit('agents');
  if (!setup) coord.log(projectId, a.name, 'a rejoint le projet', 'join');
  return a;
}

export function restart(id) {
  const a = get(id);
  if (!a) throw new Error('Agent introuvable');
  if (a.pty) {
    const old = a.pty;
    a.pty = null;
    try {
      old.kill();
    } catch {}
  }
  a.buffer += '\r\n\x1b[90m[RoSwarm] Redémarrage…\x1b[0m\r\n';
  start(a);
  bus.emit('agents');
}

export function kill(id) {
  const a = get(id);
  if (!a) return;
  agents.delete(id);
  if (a.pty) {
    const p = a.pty;
    a.pty = null;
    try {
      p.kill();
    } catch {}
  }
  coord.release(a.projectId, a.id);
  fs.rm(path.join(DATA_DIR, 'run', id), { recursive: true, force: true }, () => {});
  if (!a.setup) coord.log(a.projectId, a.name, 'a quitté le projet', 'leave');
  bus.emit('agents');
}

export function killAll() {
  for (const a of all()) {
    try {
      a.pty?.kill();
    } catch {}
  }
}

export function write(id, data) {
  const a = get(id);
  if (a?.pty) a.pty.write(data);
}

export function resize(id, cols, rows) {
  const a = get(id);
  if (!a) return;
  a.cols = Math.max(20, Math.min(500, cols | 0));
  a.rows = Math.max(5, Math.min(200, rows | 0));
  try {
    a.pty?.resize(a.cols, a.rows);
  } catch {}
}

/** Tape un message dans l'agent puis Entrée (collage « bracketed paste » pour garder les retours à la ligne). */
export function sendText(id, text) {
  const a = get(id);
  if (!a?.pty) throw new Error(`${a ? a.name : 'Agent'} n'est pas lancé.`);
  a.pty.write('\x1b[200~' + String(text) + '\x1b[201~');
  setTimeout(() => a.pty && a.pty.write('\r'), 300);
}

// ---------- État (travaille / attend / prêt) ----------

function computeStatus(a) {
  if (!a.pty) return a.exitCode === undefined ? 'starting' : 'exited';
  if (a.hookStatus === 'working' && Date.now() - a.lastOutputAt > 30000) return 'idle'; // filet de sécurité si un hook s'est perdu
  if (a.hookStatus) return a.hookStatus;
  if (!a.lastOutputAt) return 'starting';
  return Date.now() - a.lastOutputAt < 2500 ? 'working' : 'idle';
}

function refreshStatus(a, force = false) {
  const s = computeStatus(a);
  if (s !== a.status || force) {
    a.status = s;
    bus.emit('agents');
  }
}

setInterval(() => {
  for (const a of agents.values()) refreshStatus(a);
}, 1000).unref();

export function setHookStatus(id, status) {
  const a = get(id);
  if (!a) return;
  a.hookStatus = status;
  a.ready = true;
  if (status !== 'idle') a.deliverAfter = 0;
  refreshStatus(a);
}

// ---------- Boîte de réception : notifications tapées dans l'agent quand il est libre ----------

/** Ajoute une notification ; elle sera tapée dans le terminal de l'agent dès qu'il ne travaille plus. */
export function notify(id, text) {
  const a = get(id);
  if (!a || a.setup) return false;
  a.inbox.push(String(text));
  if (a.inbox.length > 20) a.inbox.shift();
  bus.emit('agents');
  return true;
}

function canDeliver(a) {
  if (!a.pty || !a.inbox.length || Date.now() < (a.deliverAfter || 0)) return false;
  // Claude : seulement après son premier hook (pas pendant l'écran de connexion) et jamais pendant une demande d'autorisation.
  if (a.type === 'claude') return a.ready && a.status === 'idle';
  return a.status === 'idle' && Date.now() - a.startedAt > 15000 && Date.now() - a.lastOutputAt > 5000;
}

setInterval(() => {
  for (const a of agents.values()) {
    if (!canDeliver(a)) continue;
    const text = a.inbox.splice(0).join('\n\n');
    a.deliverAfter = Date.now() + 8000; // le temps que l'agent passe en « travaille »
    if (a.type === 'claude') a.hookStatus = 'working';
    try {
      sendText(a.id, text);
    } catch {}
    bus.emit('agents');
  }
}, 1000).unref();

export function setLastAction(id, text) {
  const a = get(id);
  if (!a) return;
  a.lastAction = String(text).slice(0, 160);
  bus.emit('agents');
}
