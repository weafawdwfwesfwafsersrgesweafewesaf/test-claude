// Exécution des outils MCP appelés par les agents.
import path from 'node:path';
import * as studio from './studio.js';
import * as agents from './agents.js';
import * as projects from './projects.js';
import * as coord from './coord.js';
import * as sync from './sync.js';
import { TaskError } from './coord.js';

const STATUS_FR = { starting: 'démarre', working: 'travaille', idle: 'prêt', waiting: 'attend une réponse', exited: 'arrêté' };
const TASK_FR = { todo: 'À faire', doing: 'En cours', review: 'À valider', blocked: 'Bloquée', done: 'Fait' };
const MAX_RESOURCES = 50;

export function splitPath(p) {
  if (Array.isArray(p)) return p.map(String).filter(Boolean).slice(0, 50);
  let s = String(p ?? '').trim().replace(/\\/g, '/');
  s = s.replace(/^game(\/|\.(?=[A-Z]))/, '').replace(/^game$/, '');
  return s.split('/').filter(Boolean).slice(0, 50);
}

function needString(args, key, max = 200000) {
  const v = args[key];
  if (typeof v !== 'string' || !v.length) throw new Error(`Paramètre « ${key} » manquant ou invalide.`);
  if (v.length > max) throw new Error(`Paramètre « ${key} » trop long (max ${max} caractères).`);
  return v;
}

/** Retrouve un agent à partir de "#2", "2", "a3", "#2 Claude · Map" ou "me". */
function findAgent(projectId, ref, self) {
  if (!ref) return null;
  const r = String(ref).trim();
  if (r === 'me' && self) return self;
  const m = r.match(/^#?(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return agents.all().find((a) => a.projectId === projectId && !a.setup && (a.id === r || a.name === r || (n && a.num === n))) || null;
}

function contextFor(agentId) {
  const a = agents.get(agentId);
  const projectId = a?.projectId || projects.activeId();
  const self = a || { id: agentId || 'user', name: agentId === 'user' ? 'Toi' : 'Agent inconnu', projectId };
  return { agent: self, projectId, project: projects.get(projectId), isUser: agentId === 'user' };
}

/** Studio n'est relié qu'au projet actif : un agent d'un autre projet ne doit pas modifier cette place. */
function requireStudioProject(ctx) {
  const active = projects.activeId();
  if (ctx.projectId && active && ctx.projectId !== active) {
    throw new Error(
      `Studio est relié au projet « ${projects.get(active)?.name} », pas à « ${ctx.project?.name} ». Ouvre ce projet dans RoSwarm pour travailler sur Studio.`,
    );
  }
}

function lockError(conflicts) {
  return 'Refusé : ' + conflicts.map(coord.describeConflict).join(' ; ') + '. Choisis autre chose, ou coordonne-toi avec post_message / board_read.';
}

function studioClaim(ctx, instPath) {
  if (!ctx.projectId || ctx.isUser) return;
  const r = coord.claim(ctx.projectId, ctx.agent, ['studio:' + instPath.join('/')]);
  if (!r.ok) throw new Error(lockError(r.conflicts));
}

function agentsStatusText(ctx) {
  const list = agents.all().filter((a) => a.projectId === ctx.projectId && !a.setup);
  const locks = coord.listLocks(ctx.projectId);
  const tasks = coord.board(ctx.projectId).tasks;
  const lines = list.map((a) => {
    const mine = locks.filter((l) => l.agentId === a.id).map((l) => l.resource + (l.note ? ` (${l.note})` : ''));
    const doing = tasks.filter((t) => t.assignee === a.name && (t.status === 'doing' || t.status === 'review'));
    return (
      `${a.name}${a.id === ctx.agent.id ? ' ← toi' : ''} — ${STATUS_FR[a.status] || a.status}` +
      (a.lastAction ? ` — dernière action : ${a.lastAction}` : '') +
      (doing.length ? `\n    tâches : ${doing.map((t) => `#${t.id} ${TASK_FR[t.status]} depuis ${Math.round((Date.now() - t.updatedAt) / 60000)} min`).join(', ')}` : '') +
      (mine.length ? `\n    réserve : ${mine.join(', ')}` : '')
    );
  });
  const s = studio.status();
  const st = ctx.projectId ? sync.forProject(ctx.projectId)?.stats() : null;
  return (
    `Projet : ${ctx.project?.name || '?'} (${ctx.project?.dir || '?'})\n` +
    `Studio : ${s.connected ? 'connecté — ' + s.placeName : 'non connecté (mode hors ligne : les fichiers seront envoyés à la reconnexion)'}\n` +
    (st && st.enabled ? `Synchronisation : ${st.counts.applied} à jour, ${st.counts.pending + st.counts.in_progress + st.counts.unknown} en attente, ${st.counts.failed} en échec, ${st.conflicts.length} conflit(s)\n` : '') +
    `Agents (${list.length}) :\n` +
    (lines.join('\n') || '  (aucun)')
  );
}

function boardText(projectId) {
  const b = coord.board(projectId);
  const tasks = b.tasks
    .filter((t) => t.status !== 'done' || Date.now() - t.updatedAt < 6 * 3600e3)
    .map(
      (t) =>
        `#${t.id} [${TASK_FR[t.status] || t.status}] ${t.title}${t.assignee ? ` → ${t.assignee}` : ''} (créée par ${t.createdBy})` +
        (t.dependsOn?.length ? `\n    dépend de : ${t.dependsOn.map((d) => '#' + d).join(', ')}` : '') +
        (t.details ? `\n    ${t.details.replace(/\n/g, '\n    ')}` : '') +
        (t.acceptance ? `\n    critères d'acceptation : ${t.acceptance}` : '') +
        (t.notes.length ? `\n    dernière note (${t.notes.at(-1).by}) : ${t.notes.at(-1).text}` : ''),
    );
  const msgs = b.messages.slice(-15).map((m) => `[${new Date(m.at).toLocaleTimeString('fr-FR')}] ${m.from}${m.to && m.to !== 'all' ? ' → ' + m.to : ''} : ${m.text}`);
  return `TÂCHES\n${tasks.join('\n') || '(aucune)'}\n\nMESSAGES RÉCENTS\n${msgs.join('\n') || '(aucun)'}`;
}

async function assetSearch(query, limit = 10) {
  limit = Math.max(1, Math.min(30, Number(limit) || 10));
  const u = `https://apis.roblox.com/toolbox-service/v1/marketplace/10?keyword=${encodeURIComponent(query)}&num=${limit}&includeOnlyVerifiedCreators=false`;
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Recherche Creator Store impossible (' + r.status + ')');
  const ids = ((await r.json()).data || []).map((d) => d.id).slice(0, limit);
  if (!ids.length) return [];
  const d = await fetch(`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(',')}`, { signal: AbortSignal.timeout(15000) });
  if (!d.ok) return ids.map((id) => ({ id }));
  return ((await d.json()).data || []).map((x) => ({
    id: x.asset?.id,
    name: x.asset?.name,
    creator: x.creator?.name,
    verified: !!x.creator?.isVerifiedCreator,
    votes: x.voting ? `${x.voting.upVotePercent ?? '?'}% 👍 (${x.voting.voteCount ?? 0})` : undefined,
    hasScripts: x.asset?.hasScripts,
    triangles: x.asset?.modelTechnicalDetails?.objectMeshSummary?.triangles,
  }));
}

const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function describe(tool, args) {
  const a = args || {};
  const target = a.path || a.parent || a.query || (Array.isArray(a.resources) && a.resources.join(', ')) || a.title || '';
  return `${tool}${target ? ' ' + String(Array.isArray(target) ? target.join('/') : target).slice(0, 80) : ''}`;
}

const QUIET = new Set(['agents_status', 'board_read', 'studio_status', 'get_console', 'sync_status']);
const STUDIO_TOOLS = new Set([
  'get_tree', 'get_instance', 'search', 'run_luau', 'create_instance', 'set_properties', 'delete_instance',
  'set_script_source', 'asset_insert', 'sync_files', 'pull_scripts', 'check_scripts',
]);

export async function callTool(agentId, tool, args = {}) {
  const ctx = contextFor(agentId);
  if (typeof tool !== 'string') return { text: 'Outil manquant.', isError: true };
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  if (!QUIET.has(tool) && !ctx.isUser) {
    agents.setLastAction(ctx.agent.id, describe(tool, args));
    coord.log(ctx.projectId, ctx.agent.name, describe(tool, args), 'tool');
  }
  try {
    if (STUDIO_TOOLS.has(tool)) requireStudioProject(ctx);
    const out = await run(ctx, tool, args);
    return { text: fmt(out) };
  } catch (e) {
    const code = e.code ? ` [${e.code}]` : '';
    return { text: e.message + code, isError: true };
  }
}

function notifyTask(target, t, from) {
  agents.notify(
    target.id,
    `[RoSwarm] Nouvelle tâche #${t.id} pour toi (de ${from}) : ${t.title}` +
      (t.details ? `\n${t.details}` : '') +
      (t.acceptance ? `\nCritères d'acceptation : ${t.acceptance}` : '') +
      (t.dependsOn?.length ? `\nDépend de : ${t.dependsOn.map((d) => '#' + d).join(', ')} (attends qu'elles soient faites).` : '') +
      `\nRéserve ce que tu modifies avec claim. Quand c'est fini : validation_report pour vérifier, puis task_update(id=${t.id}, status="done", note="résumé") et release.`,
  );
}

async function run(ctx, tool, args) {
  switch (tool) {
    case 'studio_status': {
      const s = studio.status();
      return s.connected ? `Studio connecté : "${s.placeName}" (PlaceId ${s.placeId}).` : 'Studio non connecté (mode hors ligne).';
    }
    case 'get_tree':
      return studio.call('get_tree', { path: splitPath(args.path), depth: args.depth, max: args.max });
    case 'get_instance':
      return studio.call('get_instance', { path: splitPath(args.path) });
    case 'search':
      return studio.call('search', { query: needString(args, 'query', 200), class: args.class, root: splitPath(args.root), in_source: args.in_source });
    case 'run_luau':
      return studio.call('run_luau', { code: needString(args, 'code') }, { timeoutMs: 180000 });
    case 'create_instance': {
      const parent = splitPath(args.parent);
      needString(args, 'class', 100);
      studioClaim(ctx, parent.concat(args.name ? [String(args.name)] : []));
      return studio.call('create_instance', { parent, class: args.class, name: args.name, properties: args.properties || {} });
    }
    case 'set_properties': {
      const p = splitPath(args.path);
      studioClaim(ctx, p);
      return studio.call('set_properties', { path: p, properties: args.properties || {} });
    }
    case 'delete_instance': {
      const p = splitPath(args.path);
      if (p.length < 2) throw new Error('Refusé : on ne supprime pas un service entier.');
      studioClaim(ctx, p);
      return studio.call('delete_instance', { path: p });
    }
    case 'set_script_source': {
      const p = splitPath(args.path);
      if (p.length < 2) throw new Error('Chemin invalide : il faut au moins "Service/NomDuScript".');
      if (typeof args.source !== 'string') throw new Error('Paramètre « source » manquant.');
      if (args.class && !['Script', 'LocalScript', 'ModuleScript'].includes(args.class)) throw new Error('Classe invalide : ' + args.class);
      const s = ctx.project && sync.forProject(ctx.project.id);
      const candidates = ['Script', 'LocalScript', 'ModuleScript'].map((c) => sync.instanceToFile(p, c)).filter(Boolean);
      if (s && s.enabled() && candidates.length) {
        if (!ctx.isUser) {
          const r = coord.claim(ctx.projectId, ctx.agent, candidates.map((c) => 'src/' + c));
          if (!r.ok) throw new Error(lockError(r.conflicts));
        }
        const r = await s.writeScript(p, args.class, args.source);
        if (r.status === 'applied') {
          return `Écrit dans ${r.rel} et confirmé par Studio (${p.join('/')}).` + (r.syntaxError ? `\n⚠ Erreur de syntaxe signalée par Studio : ${r.syntaxError}` : ' Syntaxe acceptée par Studio.');
        }
        if (r.status === 'pending') return `Écrit dans ${r.rel}. Studio n'est pas connecté : envoi automatique à la reconnexion (non vérifié dans Studio).`;
        return `Écrit dans ${r.rel}, mais la synchronisation n'est pas confirmée : état « ${r.status} »${r.error ? ' — ' + r.error : ''}.`;
      }
      studioClaim(ctx, p);
      return studio.call('set_script_source', { path: p, source: args.source, className: args.class });
    }
    case 'get_console': {
      const logs = studio.getLogs(Math.min(300, Number(args.count) || 60), !!args.only_errors);
      if (!logs.length) return '(sortie vide)';
      return logs.map((l) => `${l.play ? '[Play] ' : ''}${l.level === 'info' ? '' : l.level.toUpperCase() + ': '}${l.text}`).join('\n');
    }
    case 'asset_search':
      return assetSearch(needString(args, 'query', 200), args.limit);
    case 'asset_insert': {
      const id = Number(args.asset_id);
      if (!Number.isInteger(id) || id <= 0) throw new Error('asset_id invalide.');
      return studio.call('asset_insert', { asset_id: id, parent: splitPath(args.parent || 'Workspace'), position: args.position }, { timeoutMs: 120000 });
    }
    case 'sync_files': {
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (!s) throw new Error('Aucun projet actif.');
      return `${s.pushAll()} script(s) remis dans la file d'envoi vers Studio. Suis l'avancement avec sync_status.`;
    }
    case 'pull_scripts': {
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (!s) throw new Error('Aucun projet actif.');
      const r = await s.pullAll();
      return `${r.written} script(s) importés dans src/.` + (r.skipped.length ? ` Ignorés : ${r.skipped.slice(0, 20).join(', ')}` : '');
    }
    case 'sync_status': {
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (!s) throw new Error('Aucun projet actif.');
      return { studio: studio.status().connected ? 'connecté' : 'hors ligne', ...s.stats() };
    }
    case 'check_scripts': {
      const r = await studio.call('check_scripts', { paths: Array.isArray(args.paths) ? args.paths.map(splitPath) : null }, { timeoutMs: 120000 });
      const errors = r?.errors || [];
      return errors.length
        ? `${errors.length} script(s) avec erreur de syntaxe (sur ${r.checked}) :\n` + errors.map((e) => `- ${e.path} : ${e.error}`).join('\n')
        : `${r?.checked ?? 0} script(s) vérifiés par le compilateur Luau de Studio : aucune erreur de syntaxe.`;
    }
    case 'validation_report':
      return validationReport(ctx, args);

    // ---- équipe ----
    case 'agents_status':
      return agentsStatusText(ctx);
    case 'claim': {
      const raw = Array.isArray(args.resources) ? args.resources : [args.resources];
      if (raw.length > MAX_RESOURCES) throw new Error(`Trop de ressources d'un coup (max ${MAX_RESOURCES}).`);
      const res = raw
        .filter((r) => typeof r === 'string' && r.trim())
        .map((r) => {
          if (r.length > 300) throw new Error('Nom de ressource trop long.');
          if (ctx.project && path.isAbsolute(r)) r = path.relative(ctx.project.dir, r);
          return r;
        });
      if (!res.length) throw new Error('Rien à réserver.');
      const r = coord.claim(ctx.projectId, ctx.agent, res, typeof args.note === 'string' ? args.note.slice(0, 200) : '');
      if (!r.ok) throw new Error(lockError(r.conflicts));
      if (args.note) agents.setLastAction(ctx.agent.id, String(args.note));
      return `Réservé pour 10 min (renouvelable en refaisant claim) : ${r.resources.join(', ')}. Pense à release quand tu as fini.`;
    }
    case 'release': {
      const n = coord.release(ctx.projectId, ctx.agent.id, Array.isArray(args.resources) ? args.resources : undefined);
      return `${n} réservation(s) libérée(s).`;
    }
    case 'board_read':
      return boardText(ctx.projectId);
    case 'post_message': {
      const text = needString(args, 'text', 4000);
      const target = args.to && args.to !== 'all' ? findAgent(ctx.projectId, args.to, ctx.agent) : null;
      coord.postMessage(ctx.projectId, { from: ctx.agent.name, to: target ? target.name : args.to || 'all', text });
      if (target && target.id !== ctx.agent.id) {
        agents.notify(target.id, `[RoSwarm] Message de ${ctx.agent.name} : ${text}`);
        return `Message envoyé à ${target.name} (il le recevra dès qu'il sera libre).`;
      }
      return 'Message publié.';
    }
    case 'task_create': {
      const title = needString(args, 'title', 200);
      const target = args.assignee ? findAgent(ctx.projectId, args.assignee, ctx.agent) : null;
      if (args.assignee && !target) throw new Error(`Agent « ${args.assignee} » introuvable (vois agents_status).`);
      let t;
      try {
        t = coord.createTask(ctx.projectId, {
          title,
          details: args.details,
          acceptance: args.acceptance,
          dependsOn: args.depends_on,
          assignee: target ? target.name : '',
          createdBy: ctx.agent.name,
        });
      } catch (e) {
        if (e instanceof TaskError) throw new Error(e.message);
        throw e;
      }
      if (target && target.id !== ctx.agent.id) {
        notifyTask(target, t, ctx.agent.name);
        return `Tâche #${t.id} créée et envoyée à ${target.name}.`;
      }
      return `Tâche #${t.id} créée.`;
    }
    case 'task_update':
      return taskUpdate(ctx, args);
    default:
      throw new Error('Outil inconnu : ' + tool);
  }
}

function taskUpdate(ctx, args) {
  const id = Number(args.id);
  if (!Number.isInteger(id)) throw new Error('id de tâche invalide.');
  const before = coord.board(ctx.projectId).tasks.find((x) => x.id === id);
  if (!before) throw new Error(`Tâche #${id} introuvable.`);
  const prevAssignee = before.assignee;
  const prevStatus = before.status;
  let assignee;
  let target = null;
  if (args.assignee === 'me') assignee = ctx.agent.name;
  else if (args.assignee === '') assignee = '';
  else if (args.assignee) {
    target = findAgent(ctx.projectId, args.assignee, ctx.agent);
    if (!target) throw new Error(`Agent « ${args.assignee} » introuvable.`);
    assignee = target.name;
  }
  if (args.status === 'doing' && assignee === undefined && !prevAssignee) assignee = ctx.agent.name;
  let r;
  try {
    r = coord.updateTask(ctx.projectId, id, { status: args.status, assignee, note: args.note }, ctx.agent.name, { asUser: ctx.isUser });
  } catch (e) {
    if (e instanceof TaskError) throw new Error(e.message);
    throw e;
  }
  const t = r.task;
  if (target && target.id !== ctx.agent.id && prevAssignee !== target.name && !['done', 'review'].includes(t.status)) notifyTask(target, t, ctx.agent.name);
  // Passée « à valider » : on prévient le créateur pour qu'il vérifie.
  if (t.status === 'review' && prevStatus !== 'review') {
    const creator = agents.all().find((x) => x.projectId === ctx.projectId && x.name === t.createdBy && x.pty);
    const text =
      `[RoSwarm] ${ctx.agent.name} dit avoir fini la tâche #${t.id} « ${t.title} »` +
      (args.note ? ` — ${args.note}` : '') +
      '. À toi de vérifier' +
      (t.acceptance ? ` (critères : ${t.acceptance})` : '') +
      ' avec validation_report / get_console, puis task_update(status="done") pour valider ou status="doing" avec une note pour demander une correction.';
    if (creator && creator.id !== ctx.agent.id) agents.notify(creator.id, text);
    coord.log(ctx.projectId, ctx.agent.name, `tâche #${t.id} à valider`, 'task');
  }
  if (t.status === 'done' && prevStatus !== 'done') {
    const worker = agents.all().find((x) => x.projectId === ctx.projectId && x.name === t.assignee && x.id !== ctx.agent.id && x.pty);
    if (worker) agents.notify(worker.id, `[RoSwarm] ${ctx.agent.name} a validé ta tâche #${t.id} « ${t.title} ».`);
  }
  if (!r.changed) return `Tâche #${t.id} inchangée (${r.message || 'rien à faire'}).`;
  let msg = `Tâche #${t.id} : ${TASK_FR[t.status]}${t.assignee ? ' → ' + t.assignee : ''}.`;
  if (args.status === 'done' && t.status === 'review') msg += ` Elle passe « à valider » : ${t.createdBy} doit la vérifier.`;
  return msg;
}

/** Rapport de validation : distingue écrit / synchronisé / accepté par Studio / testé. */
async function validationReport(ctx, args) {
  const s = ctx.project && sync.forProject(ctx.project.id);
  if (!s) throw new Error('Aucun projet actif.');
  const paths = Array.isArray(args.files) && args.files.length ? args.files : null;
  const rels = (paths || [...new Set([...s.files.keys(), ...Object.keys(s.base)])]).map((f) => String(f).replace(/\\/g, '/').replace(/^src\//, '')).slice(0, 200);
  const connected = studio.status().connected;
  let syntax = null;
  if (connected && rels.length) {
    try {
      const r = await studio.call('check_scripts', { paths: rels.map((rel) => sync.fileToInstance(rel)?.path).filter(Boolean) }, { timeoutMs: 120000 });
      syntax = new Map((r?.errors || []).map((e) => [e.path, e.error]));
    } catch (e) {
      syntax = null;
    }
  }
  const errorsLog = studio.getLogs(300, true);
  const lines = rels.map((rel) => {
    const f = s.fileStatus(rel);
    const inst = sync.fileToInstance(rel);
    const instPath = inst ? inst.path.join('/') : '?';
    const name = inst ? inst.path.at(-1) : '';
    const syn = syntax ? (syntax.has(instPath) ? '✗ ' + syntax.get(instPath) : '✓') : 'non vérifiée (Studio hors ligne)';
    const runtime = name ? errorsLog.filter((l) => l.text.includes(name)).slice(-2).map((l) => l.text.slice(0, 160)) : [];
    return (
      `src/${rel}\n` +
      `  1. écrit sur le disque : ${f.exists ? '✓' : '✗ absent'}\n` +
      `  2. synchronisé avec Studio : ${f.status === 'applied' && f.inStudio ? '✓' : f.status}${f.error ? ' — ' + f.error : ''}\n` +
      `  3. syntaxe acceptée par Studio : ${syn}\n` +
      `  4. erreurs récentes dans la sortie : ${runtime.length ? runtime.join(' | ') : 'aucune vue'}`
    );
  });
  return (
    (lines.join('\n') || 'Aucun fichier suivi.') +
    `\n\n5. Test en jeu (Play) : NON VÉRIFIÉ automatiquement. Lance un test dans Studio (ou demande à l'utilisateur), puis get_console.` +
    `\n6. Fonctionnalité validée : à décider par le créateur de la tâche ou l'utilisateur (statut « À valider »).`
  );
}

export function instructionsFor(agentId) {
  const a = agents.get(agentId);
  const project = projects.get(a?.projectId) || projects.active();
  const others = agents
    .all()
    .filter((x) => x.projectId === project?.id && !x.setup && x.id !== agentId)
    .map((x) => x.name);
  return (
    `RoSwarm: you are ${a ? a.name : 'an agent'} in a TEAM of AI agents building the Roblox game "${project?.name || '?'}" at the same time` +
    (others.length ? ` (teammates right now: ${others.join(', ')})` : '') +
    '. Tools let you read and edit the live Roblox Studio place and coordinate with the team. ' +
    'Always: call agents_status + board_read first; claim files/instances before editing and release them after; ' +
    'update tasks with task_update (finishing a task created by someone else puts it in review); check your work with validation_report; ' +
    'post a short summary with post_message when done. ' +
    'Scripts live in src/ (synced to Studio automatically); build the world with run_luau / create_instance. ' +
    'Never claim something was tested in Play unless it really was. Reply to the user in their language.'
  );
}
