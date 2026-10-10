// Projets : un dossier sur le disque, avec src/ synchronisé avec Studio et les consignes pour les agents.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { bus } from './bus.js';
import { DATA_DIR, DEFAULT_PROJECTS_DIR, readJson, writeJson } from './config.js';

const FILE = path.join(DATA_DIR, 'projects.json');
const state = readJson(FILE, { projects: [], activeProjectId: null });

// Onglets de l'atelier : uniquement en mémoire (les agents ne survivent pas à un redémarrage).
const tabs = new Map();

function save() {
  writeJson(FILE, state);
  bus.emit('projects');
}

export function list() {
  return state.projects.map((p) => ({ ...p, tabs: getTabs(p.id) }));
}

export function get(id) {
  return state.projects.find((p) => p.id === id) || null;
}

export function activeId() {
  return get(state.activeProjectId) ? state.activeProjectId : null;
}

export function active() {
  return get(state.activeProjectId);
}

export function setActive(id) {
  if (!get(id)) throw new Error('Projet introuvable');
  state.activeProjectId = id;
  ensureFiles(get(id));
  save();
}

export function getTabs(id) {
  if (!tabs.has(id)) tabs.set(id, [{ id: 't1', name: 'Onglet 1' }]);
  return tabs.get(id);
}

export function addTab(id) {
  const list = getTabs(id);
  let n = list.length + 1;
  while (list.some((t) => t.id === 't' + n)) n++;
  const tab = { id: 't' + n, name: 'Onglet ' + n };
  list.push(tab);
  bus.emit('projects');
  return tab;
}

export function removeTab(id, tabId) {
  const list = getTabs(id);
  if (list.length <= 1) return;
  tabs.set(id, list.filter((t) => t.id !== tabId));
  bus.emit('projects');
}

export function slug(name) {
  return (
    String(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'projet'
  );
}

export function create({ name, dir }) {
  name = String(name || '').trim() || 'Mon jeu';
  dir = dir && String(dir).trim() ? path.resolve(String(dir).trim()) : path.join(DEFAULT_PROJECTS_DIR, slug(name));
  const existing = state.projects.find((p) => path.resolve(p.dir) === dir);
  if (existing) {
    setActive(existing.id);
    return existing;
  }
  const project = { id: crypto.randomBytes(5).toString('hex'), name, dir, sync: true, createdAt: Date.now() };
  fs.mkdirSync(dir, { recursive: true });
  for (const d of ['ServerScriptService', 'ReplicatedStorage', 'StarterPlayer/StarterPlayerScripts']) {
    fs.mkdirSync(path.join(dir, 'src', d), { recursive: true });
  }
  ensureFiles(project);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    execFile('git', ['init', '-q'], { cwd: dir }, () => {});
  }
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  save();
  return project;
}

export function update(id, patch) {
  const p = get(id);
  if (!p) throw new Error('Projet introuvable');
  if (typeof patch.sync === 'boolean') p.sync = patch.sync;
  if (patch.name) p.name = String(patch.name).slice(0, 80);
  save();
  return p;
}

export function remove(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0]?.id || null;
  save();
}

const AUTO_MARK = '<!-- roswarm:auto (supprime cette ligne pour garder tes modifications) -->';

export function agentGuide(project) {
  return `${AUTO_MARK}
# ${project.name} — jeu Roblox construit à plusieurs agents IA (RoSwarm)

Tu fais partie d'une **équipe d'agents IA** (Claude Code, Codex, Gemini, OpenCode…) qui travaillent **en même temps**
sur le même jeu Roblox. L'utilisateur ne sait pas forcément coder : explique simplement ce que tu fais, en français.

## Outils RoSwarm (serveur MCP « roswarm »)
- **Studio** : \`studio_status\`, \`get_tree\`, \`get_instance\`, \`search\`, \`run_luau\`, \`create_instance\`,
  \`set_properties\`, \`delete_instance\`, \`set_script_source\`, \`get_console\`, \`asset_search\`, \`asset_insert\`.
- **Équipe** : \`agents_status\`, \`board_read\`, \`claim\`, \`release\`, \`post_message\`, \`task_create\`, \`task_update\`.
- **Vérification** : \`sync_status\`, \`check_scripts\`, \`validation_report\`.

## Règles d'équipe (importantes)
1. **Avant de commencer** : appelle \`agents_status\` et \`board_read\` pour savoir qui fait quoi.
2. **Réserve ce que tu modifies** avec \`claim\` (fichiers : \`src/...\`, Studio : \`studio:Workspace/Map\`).
   Si c'est déjà réservé par un autre agent, ne force pas : prends une autre tâche ou écris-lui avec \`post_message\`.
3. Une tâche du tableau → \`task_update\` en \`doing\` quand tu commences. Quand tu as fini : \`validation_report\`,
   puis \`task_update\` en \`done\` avec une note. Si quelqu'un d'autre a créé la tâche, elle passe « à valider » :
   c'est lui qui la valide. Ne dis jamais qu'un test en jeu (Play) a été fait s'il ne l'a pas été.
4. Quand tu as fini : \`release\`, puis un court \`post_message\` qui résume ce que tu as changé.
5. Les messages qui commencent par **[RoSwarm]** dans ton terminal sont des notifications de l'équipe
   (nouvelle tâche pour toi, message d'un coéquipier, tâche terminée) : traite-les.
6. Ne fais jamais \`git reset --hard\`, \`git checkout .\` ou \`git stash\` : d'autres agents travaillent dans ce dossier.

## Où va le code
- Les scripts vivent dans **\`src/\`** et sont synchronisés automatiquement avec Studio :
  - \`src/<Service>/<Dossiers>/<Nom>.server.luau\` → Script
  - \`src/<Service>/<Dossiers>/<Nom>.client.luau\` → LocalScript
  - \`src/<Service>/<Dossiers>/<Nom>.luau\` → ModuleScript
  - Exemples : \`src/ServerScriptService/Shop.server.luau\`, \`src/StarterPlayer/StarterPlayerScripts/Hud.client.luau\`,
    \`src/ReplicatedStorage/Config.luau\`.
- Le **monde** (parts, maps, GUI, éclairage…) se construit directement dans Studio avec \`run_luau\` /
  \`create_instance\` / \`set_properties\` / \`asset_insert\`.
- Vérifie ton travail : \`get_tree\`, \`get_instance\`, et \`get_console\` pour voir les erreurs (y compris pendant un test Play).

## Bonnes pratiques Roblox
- Code en **Luau**, avec \`game:GetService(...)\`. Ne fais jamais confiance au client : la logique importante
  (argent, dégâts, achats) se fait sur le serveur ; le client envoie des demandes via RemoteEvent/RemoteFunction.
- Les RemoteEvents partagés vont dans ReplicatedStorage. Les données joueur se sauvegardent avec DataStoreService (avec pcall).
`;
}

/** (Ré)écrit les fichiers de consignes s'ils n'ont pas été personnalisés. */
export function ensureFiles(project) {
  if (!project || !fs.existsSync(project.dir)) return;
  const guide = agentGuide(project);
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
    const file = path.join(project.dir, f);
    let current = null;
    try {
      current = fs.readFileSync(file, 'utf8');
    } catch {}
    if (current === null || (current.startsWith(AUTO_MARK) && current !== guide)) fs.writeFileSync(file, guide);
  }
  const gi = path.join(project.dir, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.roswarm/\nnode_modules/\n*.rbxl.lock\n');
}
