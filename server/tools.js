// Exécution des outils MCP appelés par les agents.
import path from 'node:path';
import * as studio from './studio.js';
import * as agents from './agents.js';
import * as projects from './projects.js';
import * as coord from './coord.js';
import * as sync from './sync.js';

const STATUS_FR = { starting: 'démarre', working: 'travaille', idle: 'prêt', waiting: 'attend une réponse', exited: 'arrêté' };

export function splitPath(p) {
  if (Array.isArray(p)) return p.map(String);
  let s = String(p || '').trim().replace(/\\/g, '/');
  s = s.replace(/^game(\/|\.(?=[A-Z]))/, '').replace(/^game$/, '');
  return s.split('/').filter(Boolean);
}

/** Retrouve un agent à partir de "#2", "2", "a3" ou "me". */
function findAgent(projectId, ref, self) {
  if (!ref) return null;
  const r = String(ref).trim();
  if (r === 'me' && self) return self;
  const n = Number(r.replace(/^#/, ''));
  return agents.all().find((a) => a.projectId === projectId && !a.setup && (a.id === r || (n && a.num === n))) || null;
}

function contextFor(agentId) {
  const a = agents.get(agentId);
  const projectId = a?.projectId || projects.activeId();
  const self = a || { id: agentId || 'user', name: agentId === 'user' ? 'Toi' : 'Agent inconnu', projectId };
  return { agent: self, projectId, project: projects.get(projectId) };
}

function lockError(conflicts) {
  return (
    'Refusé : ' +
    conflicts.map(coord.describeConflict).join(' ; ') +
    '. Choisis autre chose, ou coordonne-toi avec post_message / board_read.'
  );
}

function studioClaim(ctx, instPath) {
  if (!ctx.projectId || ctx.agent.id === 'user') return;
  const r = coord.claim(ctx.projectId, ctx.agent, ['studio:' + instPath.join('/')]);
  if (!r.ok) throw new Error(lockError(r.conflicts));
}

function agentsStatusText(ctx) {
  const list = agents.all().filter((a) => a.projectId === ctx.projectId && !a.setup);
  const locks = coord.listLocks(ctx.projectId);
  const lines = list.map((a) => {
    const mine = locks.filter((l) => l.agentId === a.id).map((l) => l.resource + (l.note ? ` (${l.note})` : ''));
    return (
      `${a.name}${a.id === ctx.agent.id ? ' ← toi' : ''} — ${STATUS_FR[a.status] || a.status}` +
      (a.lastAction ? ` — dernière action : ${a.lastAction}` : '') +
      (mine.length ? `\n    réserve : ${mine.join(', ')}` : '')
    );
  });
  const s = studio.status();
  return (
    `Projet : ${ctx.project?.name || '?'} (${ctx.project?.dir || '?'})\n` +
    `Studio : ${s.connected ? 'connecté — ' + s.placeName : 'non connecté'}\n` +
    `Agents (${list.length}) :\n` +
    (lines.join('\n') || '  (aucun)')
  );
}

function boardText(projectId) {
  const b = coord.board(projectId);
  const label = { todo: 'À faire', doing: 'En cours', done: 'Fait' };
  const tasks = b.tasks
    .filter((t) => t.status !== 'done' || Date.now() - t.updatedAt < 6 * 3600e3)
    .map(
      (t) =>
        `#${t.id} [${label[t.status]}] ${t.title}${t.assignee ? ` → ${t.assignee}` : ''}` +
        (t.details ? `\n    ${t.details.replace(/\n/g, '\n    ')}` : '') +
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
  const target = a.path || a.parent || a.query || (a.resources && a.resources.join(', ')) || a.title || '';
  return `${tool}${target ? ' ' + String(Array.isArray(target) ? target.join('/') : target).slice(0, 80) : ''}`;
}

const QUIET = new Set(['agents_status', 'board_read', 'studio_status', 'get_console']);

export async function callTool(agentId, tool, args = {}) {
  const ctx = contextFor(agentId);
  if (!QUIET.has(tool) && ctx.agent.id !== 'user') {
    agents.setLastAction(ctx.agent.id, describe(tool, args));
    coord.log(ctx.projectId, ctx.agent.name, describe(tool, args), 'tool');
  }
  try {
    const out = await run(ctx, tool, args || {});
    return { text: fmt(out) };
  } catch (e) {
    return { text: e.message, isError: true };
  }
}

async function run(ctx, tool, args) {
  switch (tool) {
    case 'studio_status': {
      const s = studio.status();
      return s.connected ? `Studio connecté : "${s.placeName}" (PlaceId ${s.placeId}).` : 'Studio non connecté.';
    }
    case 'get_tree':
      return studio.call('get_tree', { path: splitPath(args.path), depth: args.depth, max: args.max });
    case 'get_instance':
      return studio.call('get_instance', { path: splitPath(args.path) });
    case 'search':
      return studio.call('search', { query: args.query, class: args.class, root: splitPath(args.root), in_source: args.in_source });
    case 'run_luau':
      if (!args.code) throw new Error('Paramètre "code" manquant.');
      return studio.call('run_luau', { code: String(args.code) }, { timeoutMs: 180000 });
    case 'create_instance': {
      const parent = splitPath(args.parent);
      studioClaim(ctx, parent.concat(args.name ? [args.name] : []));
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
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (s && s.enabled()) {
        const candidates = ['Script', 'LocalScript', 'ModuleScript'].map((c) => sync.instanceToFile(p, c)).filter(Boolean);
        if (candidates.length && ctx.agent.id !== 'user') {
          const r = coord.claim(ctx.projectId, ctx.agent, ['src/' + (sync.instanceToFile(p, args.class || sync.defaultClassFor(p)) || candidates[0])]);
          if (!r.ok) throw new Error(lockError(r.conflicts));
        }
        if (candidates.length) {
          const rel = await s.writeScript(p, args.class, String(args.source ?? ''));
          return `Écrit dans ${rel} et synchronisé avec Studio (${p.join('/')}).`;
        }
      }
      studioClaim(ctx, p);
      return studio.call('set_script_source', { path: p, source: String(args.source ?? ''), className: args.class });
    }
    case 'get_console': {
      const logs = studio.getLogs(Math.min(300, Number(args.count) || 60), !!args.only_errors);
      if (!logs.length) return '(sortie vide)';
      return logs.map((l) => `${l.play ? '[Play] ' : ''}${l.level === 'info' ? '' : l.level.toUpperCase() + ': '}${l.text}`).join('\n');
    }
    case 'asset_search':
      return assetSearch(args.query, args.limit);
    case 'asset_insert':
      return studio.call(
        'asset_insert',
        { asset_id: Number(args.asset_id), parent: splitPath(args.parent || 'Workspace'), position: args.position },
        { timeoutMs: 120000 },
      );
    case 'sync_files': {
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (!s) throw new Error('Aucun projet actif.');
      return `${await s.pushAll()} script(s) envoyés à Studio.`;
    }
    case 'pull_scripts': {
      const s = ctx.project && sync.forProject(ctx.project.id);
      if (!s) throw new Error('Aucun projet actif.');
      const r = await s.pullAll();
      return `${r.written} script(s) importés dans src/.` + (r.skipped.length ? ` Ignorés : ${r.skipped.slice(0, 20).join(', ')}` : '');
    }

    // ---- équipe ----
    case 'agents_status':
      return agentsStatusText(ctx);
    case 'claim': {
      const res = (Array.isArray(args.resources) ? args.resources : [args.resources]).filter(Boolean).map((r) => {
        r = String(r);
        if (ctx.project && path.isAbsolute(r)) r = path.relative(ctx.project.dir, r);
        return r;
      });
      if (!res.length) throw new Error('Rien à réserver.');
      const r = coord.claim(ctx.projectId, ctx.agent, res, args.note);
      if (!r.ok) throw new Error(lockError(r.conflicts));
      if (args.note) agents.setLastAction(ctx.agent.id, args.note);
      return `Réservé pour 10 min : ${r.resources.join(', ')}. Pense à release quand tu as fini.`;
    }
    case 'release': {
      const n = coord.release(ctx.projectId, ctx.agent.id, args.resources);
      return `${n} réservation(s) libérée(s).`;
    }
    case 'board_read':
      return boardText(ctx.projectId);
    case 'post_message': {
      const target = args.to && args.to !== 'all' ? findAgent(ctx.projectId, args.to, ctx.agent) : null;
      coord.postMessage(ctx.projectId, { from: ctx.agent.name, to: target ? target.name : args.to || 'all', text: args.text });
      if (target && target.id !== ctx.agent.id) {
        agents.notify(target.id, `[RoSwarm] Message de ${ctx.agent.name} : ${args.text}`);
        return `Message envoyé à ${target.name} (il le recevra dès qu'il sera libre).`;
      }
      return 'Message publié.';
    }
    case 'task_create': {
      const target = args.assignee ? findAgent(ctx.projectId, args.assignee, ctx.agent) : null;
      const t = coord.createTask(ctx.projectId, {
        title: args.title,
        details: args.details,
        assignee: target ? target.name : args.assignee,
        createdBy: ctx.agent.name,
      });
      if (target && target.id !== ctx.agent.id) {
        notifyTask(target, t, ctx.agent.name);
        return `Tâche #${t.id} créée et envoyée à ${target.name}.`;
      }
      return `Tâche #${t.id} créée.`;
    }
    case 'task_update': {
      let assignee = args.assignee;
      const before = coord.board(ctx.projectId).tasks.find((x) => x.id === Number(args.id));
      const prevAssignee = before?.assignee;
      const prevStatus = before?.status; // `before` est l'objet que updateTask va modifier
      const target = assignee && assignee !== 'me' ? findAgent(ctx.projectId, assignee, ctx.agent) : null;
      if (assignee === 'me') assignee = ctx.agent.name;
      else if (assignee) assignee = target?.name || assignee;
      if (args.status === 'doing' && assignee === undefined && !prevAssignee) assignee = ctx.agent.name;
      const t = coord.updateTask(ctx.projectId, args.id, { status: args.status, assignee, note: args.note }, ctx.agent.name);
      if (!t) throw new Error('Tâche #' + args.id + ' introuvable.');
      // réassignée à un autre agent -> on le prévient
      if (target && target.id !== ctx.agent.id && prevAssignee !== target.name && t.status !== 'done') notifyTask(target, t, ctx.agent.name);
      // terminée -> on prévient celui qui l'a créée (souvent le chef)
      if (args.status === 'done' && prevStatus !== 'done') {
        const creator = agents.all().find((x) => x.projectId === ctx.projectId && x.name === t.createdBy);
        if (creator && creator.id !== ctx.agent.id) {
          agents.notify(
            creator.id,
            `[RoSwarm] ${ctx.agent.name} a terminé la tâche #${t.id} « ${t.title} »` + (args.note ? ` — ${args.note}` : '') + '. Vérifie et intègre si besoin (board_read).',
          );
        }
      }
      return `Tâche #${t.id} : ${t.status}${t.assignee ? ' → ' + t.assignee : ''}.`;
    }
    default:
      throw new Error('Outil inconnu : ' + tool);
  }
}

function notifyTask(target, t, from) {
  agents.notify(
    target.id,
    `[RoSwarm] Nouvelle tâche #${t.id} pour toi (de ${from}) : ${t.title}` +
      (t.details ? `\n${t.details}` : '') +
      `\nRéserve ce que tu modifies avec claim. Quand c'est fini : task_update(id=${t.id}, status="done", note="résumé") puis release.`,
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
    'update tasks with task_update; post a short summary with post_message when done. ' +
    'Scripts live in src/ (synced to Studio automatically); build the world with run_luau / create_instance. ' +
    'Check get_console for errors. Reply to the user in their language.'
  );
}
