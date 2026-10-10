// RoSwarm — interface (JavaScript sans framework).
'use strict';

const TOKEN = document.querySelector('meta[name="roswarm-token"]').content;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const STATUS = { starting: 'Démarrage…', working: 'Travaille…', idle: 'Prêt', waiting: 'Attend ta réponse', exited: 'Arrêté' };
const AGENT_ORDER = ['claude', 'codex', 'gemini', 'opencode', 'shell', 'custom'];
const TASK_LABELS = { todo: 'À faire', doing: 'En cours', review: 'À valider', blocked: 'Bloquée', done: 'Fait' };

const S = {
  projects: [],
  activeProjectId: null,
  agents: [],
  studio: { connected: false, sessions: [] },
  locks: [],
  board: null,
  activity: [],
  logs: [],
  types: {},
  setup: null,
  version: '',
  view: 'home',
  tab: {}, // projectId -> tabId
  maximized: null,
  ptab: 'tasks',
  pairing: [],
  pluginTokens: [],
  sync: null,
  explorerSel: null,
};

const terms = new Map(); // agentId -> { term, fit, el, pane, attached, ro, lastSize }
let ws = null;

// ---------------------------------------------------------------- utilitaires

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-roswarm-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
  return j;
}

function toast(text, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), isError ? 7000 : 3500);
}

async function attempt(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return r;
  } catch (e) {
    toast(e.message, true);
  }
}

const time = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const project = () => S.projects.find((p) => p.id === S.activeProjectId) || null;
const projectAgents = () => S.agents.filter((a) => a.projectId === S.activeProjectId && !a.setup);
const currentTab = () => {
  const p = project();
  if (!p) return null;
  const t = S.tab[p.id];
  return p.tabs.some((x) => x.id === t) ? t : p.tabs[0]?.id;
};

// ---------------------------------------------------------------- WebSocket

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?token=${TOKEN}`);
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    $('#studio-pill').innerHTML = '<span class="dot err"></span> Application RoSwarm arrêtée…';
    for (const t of terms.values()) t.attached = false;
    setTimeout(connect, 1500);
  };
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function onMessage(m) {
  switch (m.type) {
    case 'snapshot':
      Object.assign(S, m.state);
      if (!S.activeProjectId) S.view = 'home';
      else if (S.view === 'home' && !S._booted) S.view = 'workspace';
      S._booted = true;
      for (const t of terms.values()) attach(t.agentId);
      renderAll();
      loadSetup();
      break;
    case 'agents':
      S.agents = m.agents;
      for (const id of [...terms.keys()]) if (!S.agents.some((a) => a.id === id)) destroyTerm(id);
      renderWorkspace();
      renderPanel();
      renderSidebar();
      break;
    case 'term': {
      const t = terms.get(m.agentId);
      if (t && t.attached) t.term.write(m.data);
      break;
    }
    case 'replay': {
      const t = terms.get(m.agentId);
      if (t) {
        t.term.reset();
        t.replaying = true;
        t.term.write(m.data, () => (t.replaying = false));
        t.attached = true;
      }
      break;
    }
    case 'projects':
      S.projects = m.projects;
      S.activeProjectId = m.activeProjectId;
      renderAll();
      break;
    case 'studio':
      S.studio = m.studio;
      renderSidebar();
      renderPanelHead();
      if (S.ptab === 'explorer') renderExplorer();
      break;
    case 'logs':
      S.logs.push(...m.entries);
      if (S.logs.length > 1000) S.logs.splice(0, S.logs.length - 1000);
      if (S.ptab === 'console') renderConsole();
      break;
    case 'locks':
      S.locks = m.locks;
      renderAtWork();
      break;
    case 'board':
      if (m.projectId === S.activeProjectId) {
        S.board = m.board;
        if (S.ptab === 'tasks') renderTasks();
      }
      break;
    case 'pairing':
      S.pairing = m.pairing;
      S.pluginTokens = m.pluginTokens;
      renderPanelHead();
      if (S.view === 'home') renderHome();
      break;
    case 'sync':
      if (m.projectId === S.activeProjectId) {
        S.sync = m.sync;
        renderSyncLine();
      }
      break;
    case 'activity':
      if (m.projectId === S.activeProjectId) {
        S.activity.push(m.entry);
        if (S.activity.length > 300) S.activity.shift();
        if (S.ptab === 'activity') renderActivity();
      }
      break;
  }
}

// ---------------------------------------------------------------- terminaux

const THEME = {
  background: '#0d0e13',
  foreground: '#e6e7ee',
  cursor: '#c4b5fd',
  selectionBackground: '#3b3560',
  black: '#1b1c27', brightBlack: '#5d6077',
  red: '#f87171', brightRed: '#fca5a5',
  green: '#4ade80', brightGreen: '#86efac',
  yellow: '#fbbf24', brightYellow: '#fcd34d',
  blue: '#60a5fa', brightBlue: '#93c5fd',
  magenta: '#c084fc', brightMagenta: '#d8b4fe',
  cyan: '#22d3ee', brightCyan: '#67e8f9',
  white: '#d4d6e0', brightWhite: '#ffffff',
};

function ensureTerm(agentId) {
  if (terms.has(agentId)) return terms.get(agentId);
  const term = new Terminal({
    fontFamily: "'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 8000,
    allowProposedApi: true,
    theme: THEME,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  const el = document.createElement('div');
  el.style.height = '100%';
  const t = { agentId, term, fit, el, attached: false, opened: false, replaying: false, lastSize: '' };
  // Pendant le rejeu de l'historique, xterm répond aux anciennes requêtes du terminal (ex. « \x1b[c ») :
  // ces réponses ne doivent pas repartir vers l'agent comme si l'utilisateur les avait tapées.
  term.onData((data) => {
    if (!t.replaying) send({ type: 'input', agentId, data });
  });
  // Ctrl+C copie s'il y a une sélection, Ctrl+V colle (comme un terminal Windows).
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term.hasSelection()) {
      navigator.clipboard?.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') return false; // le navigateur gère le collage
    return true;
  });
  t.ro = new ResizeObserver(() => fitTerm(t));
  t.ro.observe(el);
  terms.set(agentId, t);
  return t;
}

function fitTerm(t) {
  if (!t.el.isConnected || t.el.offsetWidth < 20 || t.el.offsetHeight < 20) return;
  if (!t.opened) {
    t.term.open(t.el);
    t.opened = true;
    attach(t.agentId);
  }
  try {
    t.fit.fit();
  } catch {}
  const size = t.term.cols + 'x' + t.term.rows;
  if (size !== t.lastSize) {
    t.lastSize = size;
    send({ type: 'resize', agentId: t.agentId, cols: t.term.cols, rows: t.term.rows });
  }
}

function attach(agentId) {
  const t = terms.get(agentId);
  if (!t || !t.opened) return;
  t.attached = false;
  send({ type: 'attach', agentId });
}

function destroyTerm(agentId) {
  const t = terms.get(agentId);
  if (!t) return;
  t.ro.disconnect();
  t.term.dispose();
  t.el.remove();
  terms.delete(agentId);
}

// ---------------------------------------------------------------- rendu global

function renderAll() {
  $('#version').textContent = S.version;
  renderSidebar();
  $('#view-home').classList.toggle('hidden', S.view !== 'home');
  $('#view-workspace').classList.toggle('hidden', S.view !== 'workspace');
  if (S.view === 'home') renderHome();
  renderWorkspace();
  renderPanel();
}

function studioLine() {
  if (S.studio.connected) return { dot: 'ok', text: 'Plugin connecté', sub: S.studio.placeName };
  return { dot: 'warn pulse', text: 'En attente de Studio', sub: 'Ouvre ta place dans Roblox Studio' };
}

function renderSidebar() {
  $('#nav-home').classList.toggle('active', S.view === 'home');
  const sl = studioLine();
  $('#studio-pill').innerHTML = `<span class="dot ${sl.dot}"></span><span>${esc(sl.text)}${S.studio.connected ? ` · <span class="muted">${esc(sl.sub)}</span>` : ''}</span>`;
  $('#project-list').innerHTML = S.projects
    .map((p) => {
      const active = p.id === S.activeProjectId;
      const n = S.agents.filter((a) => a.projectId === p.id && !a.setup && a.status !== 'exited').length;
      const working = S.agents.some((a) => a.projectId === p.id && a.status === 'working');
      const sub = active ? (S.studio.connected ? `Plugin connecté · ${n} agent(s)` : `En attente de Studio · ${n} agent(s)`) : `${n} agent(s)`;
      return `<button class="project-item ${active && S.view === 'workspace' ? 'active' : ''}" data-pid="${p.id}">
        <span class="p-name"><span class="dot ${active && S.studio.connected ? 'ok' : ''} ${working ? 'pulse' : ''}"></span>${esc(p.name)}</span>
        <span class="p-sub">${esc(sub)}</span>
      </button>`;
    })
    .join('') || '<div class="muted small" style="padding:4px 10px">Aucun projet pour l’instant.</div>';
}

// ---------------------------------------------------------------- accueil

async function loadSetup() {
  try {
    S.setup = await api('GET', '/api/setup');
  } catch {}
  if (S.view === 'home') renderHome();
  renderAddMenu();
}

function renderHome() {
  const st = S.setup;
  const plugin = st?.plugin;
  const pluginRow = !st
    ? ''
    : `<div class="setup-row">
        <span class="check ${plugin.installed && plugin.upToDate ? 'ok' : ''}">${plugin.installed && plugin.upToDate ? '✓' : '1'}</span>
        <div><div class="s-name">Plugin Roblox Studio</div>
          <div class="s-hint">${
            !plugin.supported
              ? 'Roblox Studio n’existe que sur Windows et Mac : copie <span class="mono">plugin/RoSwarm.lua</span> dans le dossier Plugins.'
              : plugin.installed
                ? plugin.upToDate ? 'Installé. Redémarre Studio s’il était ouvert pendant l’installation.' : 'Une nouvelle version est disponible.'
                : 'Relie Studio à RoSwarm. Studio te demandera d’autoriser l’accès à 127.0.0.1 : accepte.'
          }</div></div>
        <div class="s-actions">
          ${plugin.supported ? `<button class="btn sm ${plugin.installed && plugin.upToDate ? '' : 'primary'}" data-act="install-plugin">${plugin.installed ? (plugin.upToDate ? 'Réinstaller' : 'Mettre à jour') : 'Installer'}</button>
          <button class="btn sm ghost" data-act="open-plugins" title="Ouvrir le dossier Plugins">📁</button>` : ''}
        </div>
      </div>
      <div class="setup-row">
        <span class="check ${S.studio.connected ? 'ok' : ''}">${S.studio.connected ? '✓' : '2'}</span>
        <div><div class="s-name">Studio connecté</div>
          <div class="s-hint">${S.studio.connected ? 'Place ouverte : ' + esc(S.studio.placeName) : 'Ouvre (ou crée) ta place dans Roblox Studio : la connexion est automatique.'}</div></div>
        <div></div>
      </div>`;
  const agentRows = !st
    ? '<div class="muted">Chargement…</div>'
    : AGENT_ORDER.filter((k) => st.agents[k])
        .map((k) => {
          const t = S.types[k];
          const ok = st.agents[k].installed;
          return `<div class="setup-row">
            <span class="check ${ok ? 'ok' : ''}">${ok ? '✓' : ''}</span>
            <div><div class="s-name"><span class="dot" style="background:${t.color}"></span> ${esc(t.label)}</div><div class="s-hint">${esc(t.hint)}</div></div>
            <div class="s-actions">
              ${ok ? '' : `<button class="btn sm" data-act="install-agent" data-type="${k}" ${st.npm ? '' : 'disabled title="npm introuvable"'}>Installer</button>`}
              <button class="btn sm ghost" data-act="login-agent" data-type="${k}" ${ok ? '' : 'disabled'}>Se connecter</button>
            </div>
          </div>`;
        })
        .join('');

  $('#view-home').innerHTML = `
    <div class="hero">
      <h1>Une idée. <em>Un jeu.</em></h1>
      <p>Mets plusieurs agents IA (Claude Code, Codex, Gemini, OpenCode…) sur ton projet Roblox Studio en même temps.
      Ils se répartissent le travail, se réservent les fichiers et construisent ton jeu avec toi. Gratuit, open source, en local.</p>
      <div class="steps">
        <div class="step"><b>1</b><div>Décris<span>comme à un ami</span></div></div>
        <div class="step-arrow">→</div>
        <div class="step"><b>2</b><div>Les agents construisent<span>map, code, interfaces</span></div></div>
        <div class="step-arrow">→</div>
        <div class="step"><b>3</b><div>Tu publies<span>depuis Studio</span></div></div>
      </div>
    </div>
    <div class="home-grid">
      <div class="card">
        <h2>✨ Nouveau projet</h2>
        <div class="form-row"><input type="text" id="np-name" placeholder="Nom du jeu (ex. pet-paradise)"></div>
        <div class="form-row"><input type="text" id="np-dir" placeholder="Dossier (facultatif — par défaut ~/RoSwarm/nom-du-jeu)"></div>
        <div class="form-row"><button class="btn primary" data-act="create-project">Créer le projet</button></div>
        <div class="muted small">Un projet = un dossier avec tes scripts (<span class="mono">src/</span>) et les consignes pour les agents. Tu peux aussi indiquer un dossier existant.</div>
      </div>
      <div class="card">
        <h2>🧩 Configuration</h2>
        <div class="setup-list">${pluginRow}</div>
        ${
          S.pluginTokens?.length
            ? `<div class="tf-label" style="margin-top:12px">Studios autorisés</div>${S.pluginTokens
                .map(
                  (t) => `<div class="token-row"><span>🔑 ${esc(t.label)} <span class="muted small">· autorisé le ${new Date(t.createdAt).toLocaleDateString('fr-FR')}${
                    t.lastUsedAt ? ' · vu ' + time(t.lastUsedAt) : ''
                  }</span></span><button class="btn sm ghost danger" data-revoke="${t.id}">Révoquer</button></div>`,
                )
                .join('')}`
            : ''
        }
      </div>
      <div class="card span2">
        <h2>🤖 Agents IA <span class="muted small" style="font-weight:400">— utilise tes propres abonnements, rien ne passe par nous</span></h2>
        <div class="setup-list">${agentRows}</div>
      </div>
      ${
        S.projects.length
          ? `<div class="card span2"><h2>📂 Projets récents</h2><div class="recent">${S.projects
              .map(
                (p) => `<button class="recent-item" data-pid="${p.id}">
                  <div class="r-name">${esc(p.name)}</div><div class="r-dir">${esc(p.dir)}</div>
                  <span class="icon-btn r-del" data-del="${p.id}" title="Retirer de la liste (le dossier n’est pas supprimé)">✕</span>
                </button>`,
              )
              .join('')}</div></div>`
          : ''
      }
    </div>`;
}

// ---------------------------------------------------------------- atelier

function claudeInstalled() {
  return !S.setup || S.setup.agents.claude?.installed;
}

function renderAddMenu() {
  const st = S.setup;
  const team = `<button class="menu-item team" data-act="team" ${claudeInstalled() ? '' : 'disabled'}>
      <span class="dot" style="background:${S.types.claude?.color}"></span>
      <span>Équipe de Claude…<span class="m-hint">2 à 6 Claude avec des rôles : un chef répartit le travail</span></span>
      <span class="m-tag">${claudeInstalled() ? '★' : 'à installer'}</span>
    </button><div class="menu-sep"></div>`;
  $('#add-agent-menu').innerHTML = team + AGENT_ORDER.map((k) => {
    const t = S.types[k];
    if (!t) return '';
    const needsBin = st && st.agents[k];
    const ok = !needsBin || st.agents[k].installed;
    return `<button class="menu-item" data-add="${k}" ${ok ? '' : 'disabled'}>
      <span class="dot" style="background:${t.color}"></span>
      <span>${esc(t.label)}<span class="m-hint">${esc(t.hint)}</span></span>
      <span class="m-tag">${ok ? '' : 'à installer'}</span>
    </button>`;
  }).join('');
}

function gridColumns(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

function renderWorkspace() {
  const p = project();
  if (!p) return;
  renderSyncLine();
  $('#ws-name').textContent = p.name;
  $('#ws-dir').textContent = p.dir;
  $('#ws-sync').checked = !!p.sync;
  const tabId = currentTab();
  const agents = projectAgents();

  $('#tabs').innerHTML = p.tabs
    .map((t) => {
      const n = agents.filter((a) => a.tabId === t.id).length;
      return `<button class="tab ${t.id === tabId ? 'active' : ''}" data-tab="${t.id}">${esc(t.name)}${n ? `<span class="count">${n}</span>` : ''}${
        p.tabs.length > 1 ? `<span class="x" data-close-tab="${t.id}" title="Fermer l’onglet et ses agents">✕</span>` : ''
      }</button>`;
    })
    .join('');

  // composeur : cibles
  const sel = $('#composer-target');
  const prev = sel.value;
  const inTab = agents.filter((a) => a.tabId === tabId);
  sel.innerHTML =
    `<option value="all">Tous (${inTab.length})</option>` + inTab.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;

  // grille de terminaux
  const grid = $('#grid');
  let shown = inTab;
  if (S.maximized && shown.some((a) => a.id === S.maximized)) shown = shown.filter((a) => a.id === S.maximized);
  else S.maximized = null;

  if (!shown.length) {
    for (const t of terms.values()) t.pane?.remove();
    grid.style.gridTemplateColumns = '1fr';
    const st = S.setup;
    grid.innerHTML = `<div class="empty">
      <h2>Ajoute tes agents</h2>
      <p>Chaque agent s’ouvre dans son propre terminal, dans le dossier du projet, déjà branché sur Roblox Studio et sur les autres agents.
      Mets-en plusieurs : ils se partagent le tableau de tâches et se réservent les fichiers.</p>
      <button class="team-cta" data-act="team" ${claudeInstalled() ? '' : 'disabled title="Installe Claude Code depuis l’accueil"'}>
        <span class="tc-title">👥 Lancer une équipe de Claude</span>
        <span class="tc-hint">Un Claude « Chef » découpe ta demande et la répartit entre des Claude spécialisés (gameplay, map, interface…). Ils se préviennent tout seuls.</span>
      </button>
      <div class="muted small" style="margin:14px 0 8px">…ou un agent à la fois :</div>
      <div class="empty-agents">${AGENT_ORDER.filter((k) => k !== 'custom')
        .map((k) => {
          const t = S.types[k];
          const ok = !st || !st.agents[k] || st.agents[k].installed;
          return `<button class="agent-choice" data-add="${k}" ${ok ? '' : 'disabled title="Installe-le depuis l’accueil"'}>
            <span class="ac-name"><span class="dot" style="background:${t.color}"></span>${esc(t.label)}</span>
            <span class="ac-hint">${ok ? esc(t.hint) : 'Pas encore installé'}</span></button>`;
        })
        .join('')}</div></div>`;
    return;
  }
  $('.empty', grid)?.remove();
  const cols = gridColumns(shown.length);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

  const wanted = new Set(shown.map((a) => a.id));
  for (const [id, t] of terms) if (!wanted.has(id)) t.pane?.remove();
  shown.forEach((a, i) => {
    const t = ensureTerm(a.id);
    if (!t.pane) {
      t.pane = document.createElement('div');
      t.pane.className = 'pane';
      t.pane.innerHTML = `<div class="pane-head"></div><div class="pane-body"></div>`;
      $('.pane-body', t.pane).appendChild(t.el);
      t.pane.addEventListener('mousedown', () => {
        $$('.pane.focus').forEach((x) => x.classList.remove('focus'));
        t.pane.classList.add('focus');
      });
    }
    $('.pane-head', t.pane).innerHTML = `
      <span class="p-color" style="background:${a.color}"></span>
      <span class="p-title">${esc(a.name)}</span>
      <span class="status ${a.status}">${STATUS[a.status] || a.status}</span>
      <span class="p-action" title="${esc(a.lastAction)}">${esc(a.lastAction)}</span>
      <span class="p-buttons">
        <button class="icon-btn" data-restart="${a.id}" title="Relancer">⟳</button>
        <button class="icon-btn" data-max="${a.id}" title="${S.maximized ? 'Réduire' : 'Agrandir'}">${S.maximized ? '⤡' : '⤢'}</button>
        <button class="icon-btn" data-kill="${a.id}" title="Fermer cet agent">✕</button>
      </span>`;
    // n'appendChild que si nécessaire : déplacer un terminal le fait clignoter
    if (grid.children[i] !== t.pane) grid.insertBefore(t.pane, grid.children[i] || null);
  });
  requestAnimationFrame(() => shown.forEach((a) => fitTerm(terms.get(a.id))));
}

// ---------------------------------------------------------------- panneau Studio

function renderPanel() {
  renderPanelHead();
  renderAtWork();
  $$('.panel-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.ptab === S.ptab));
  $$('.ptab').forEach((el) => el.classList.toggle('hidden', el.id !== 'ptab-' + S.ptab));
  if (S.ptab === 'tasks') renderTasks();
  if (S.ptab === 'explorer') renderExplorer();
  if (S.ptab === 'console') renderConsole();
  if (S.ptab === 'activity') renderActivity();
}

function renderSyncLine() {
  const el = $('#sync-line');
  const st = S.sync;
  const p = project();
  if (!st || !p || !p.sync) {
    el.innerHTML = '';
    return;
  }
  const c = st.counts;
  const waiting = c.pending + c.in_progress + c.unknown;
  const parts = [`<span title="Scripts identiques dans src/ et Studio">✓ ${c.applied} à jour</span>`];
  if (waiting) parts.push(`<span class="warn" title="En attente de confirmation par Studio">⏳ ${waiting} en attente</span>`);
  if (c.failed) parts.push(`<span class="err" title="${esc(st.problems.map((x) => x.rel + ' : ' + x.error).join('\n'))}">✗ ${c.failed} en échec</span>`);
  if (st.conflicts.length) parts.push(`<span class="warn" title="La version Studio a été sauvegardée dans .roswarm/conflicts/">⚠ ${st.conflicts.length} conflit(s)</span>`);
  const syntax = st.problems.filter((x) => /^syntaxe/.test(x.error));
  if (syntax.length) parts.push(`<span class="err" title="${esc(syntax.map((x) => x.rel + ' : ' + x.error).join('\n'))}">⚠ ${syntax.length} erreur(s) de syntaxe</span>`);
  if (!S.studio.connected) parts.push('<span class="muted">hors ligne : envoi à la reconnexion</span>');
  el.innerHTML = 'Sync : ' + parts.join(' · ');
}

function renderPanelHead() {
  const p = project();
  $('#panel-place').textContent = p ? p.name : '—';
  const sl = studioLine();
  $('#panel-status').innerHTML = S.studio.connected
    ? `<span class="dot ok"></span><span>Studio ouvert<div class="hint">${esc(S.studio.placeName)}</div></span>`
    : `<span class="dot warn pulse"></span><span>${esc(sl.text)}<div class="hint">Lance Roblox Studio et ouvre ta place. Le plugin RoSwarm se connecte tout seul.</div></span>`;
  $('#pairing').innerHTML = (S.pairing || [])
    .map(
      (r) => `<div class="pair-card">
        <div><b>Studio demande l’accès</b> : « ${esc(r.placeName)} »</div>
        <div class="hint">Vérifie que la sortie (Output) de Studio affiche le code <b class="mono">${esc(r.code)}</b>. N’autorise que si c’est bien ton Studio.</div>
        <div class="pair-actions"><button class="btn sm primary" data-pair-approve="${esc(r.requestId)}">Autoriser</button>
        <button class="btn sm" data-pair-reject="${esc(r.requestId)}">Refuser</button></div>
      </div>`,
    )
    .join('');
  const sel = $('#session-select');
  const sessions = S.studio.sessions || [];
  sel.classList.toggle('hidden', sessions.length < 2);
  sel.innerHTML = sessions.map((s) => `<option value="${s.id}" ${s.id === S.studio.activeSessionId ? 'selected' : ''}>${esc(s.placeName)}</option>`).join('');
}

function renderAtWork() {
  const agents = projectAgents();
  $('#at-work').innerHTML = agents.length
    ? agents
        .map((a) => {
          const locks = S.locks.filter((l) => l.agentId === a.id).map((l) => l.resource);
          return `<div class="worker">
            <span class="p-color" style="background:${a.color}"></span>
            <div><div class="w-name">${esc(a.name)}</div>
              ${a.lastAction ? `<div class="w-action">${esc(a.lastAction)}</div>` : ''}
              ${locks.length ? `<div class="w-locks">🔒 ${locks.map(esc).join(', ')}</div>` : ''}
              ${a.inbox ? `<div class="w-action">📨 ${a.inbox} notification(s) en attente (livrée(s) dès qu’il est libre)</div>` : ''}</div>
            <span class="status ${a.status}">${STATUS[a.status] || a.status}</span>
          </div>`;
        })
        .join('')
    : '<div class="muted small">Aucun agent. Ajoute-en avec « ＋ Agent ».</div>';
}

function renderTasks() {
  const el = $('#ptab-tasks');
  const p = project();
  if (!p) {
    el.innerHTML = '<div class="muted small">Ouvre un projet pour voir son tableau de tâches.</div>';
    return;
  }
  const b = S.board || { tasks: [], messages: [] };
  const agents = projectAgents().filter((a) => a.status !== 'exited');
  const focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
  const draft = { title: $('#tf-title')?.value || '', details: $('#tf-details')?.value || '', accept: $('#tf-accept')?.value || '', msg: $('#msg-text')?.value || '' };
  const agentOpts = agents.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const task = (t) => `<div class="task ${t.status}">
      <div class="t-title">#${t.id} ${esc(t.title)}</div>
      <div class="t-meta">${t.assignee ? '→ ' + esc(t.assignee) : 'Non assignée'} · par ${esc(t.createdBy)}</div>
      ${t.details ? `<div class="t-details">${esc(t.details)}</div>` : ''}
      ${t.acceptance ? `<div class="t-details">🎯 ${esc(t.acceptance)}</div>` : ''}
      ${t.dependsOn?.length ? `<div class="t-details">⛓ après ${t.dependsOn.map((d) => '#' + d).join(', ')}</div>` : ''}
      ${t.notes?.length ? `<div class="t-details">📝 ${esc(t.notes.at(-1).by)} : ${esc(t.notes.at(-1).text)}</div>` : ''}
      <div class="t-actions">
        <select data-task-status="${t.id}">
          ${Object.entries(TASK_LABELS).map(([s, l]) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        ${t.status === 'review' ? `<button class="btn sm primary" data-task-validate="${t.id}" title="Vérifié : la tâche est terminée">✓ Valider</button>` : ''}
        ${t.status !== 'done' && agents.length ? `<select data-task-give="${t.id}"><option value="">Donner à…</option>${agentOpts}</select>` : ''}
        <button class="icon-btn" data-task-del="${t.id}" title="Supprimer">🗑</button>
      </div>
    </div>`;
  const groups = [
    ['review', 'À valider'],
    ['doing', 'En cours'],
    ['blocked', 'Bloquées'],
    ['todo', 'À faire'],
    ['done', 'Fait'],
  ]
    .map(([s, label]) => {
      const list = b.tasks.filter((t) => t.status === s);
      return list.length ? `<div class="group-title">${label} (${list.length})</div>${list.map(task).join('')}` : '';
    })
    .join('');
  el.innerHTML = `
    <div class="task-form">
      <input type="text" id="tf-title" placeholder="Nouvelle tâche (ex. « Boutique d’œufs »)">
      <textarea id="tf-details" rows="2" placeholder="Détails (facultatif)"></textarea>
      <input type="text" id="tf-accept" placeholder="Critère de réussite (facultatif) : comment vérifier que c’est fini ?">
      <div class="row">
        <select id="tf-agent"><option value="">Personne pour l’instant</option>${agentOpts}</select>
        <button class="btn sm primary" data-act="add-task">Ajouter</button>
      </div>
    </div>
    ${groups || '<div class="muted small">Le tableau est vide. Ajoute des tâches : les agents le lisent avec board_read et se les répartissent.</div>'}
    <div class="group-title">Messages de l’équipe</div>
    <div>${b.messages.slice(-30).map((m) => `<div class="msg"><span class="m-time">${time(m.at)}</span> <b>${esc(m.from)}</b>${m.to && m.to !== 'all' ? ' → ' + esc(m.to) : ''} : ${esc(m.text)}</div>`).join('') || '<div class="muted small">Aucun message.</div>'}</div>
    <div class="row" style="display:flex;gap:6px;margin-top:8px"><input type="text" id="msg-text" placeholder="Écrire à l’équipe…"><button class="btn sm" data-act="post-msg">Envoyer</button></div>`;
  $('#tf-title').value = draft.title;
  $('#tf-details').value = draft.details;
  $('#tf-accept').value = draft.accept;
  $('#msg-text').value = draft.msg;
  if (focused) $('#' + focused)?.focus();
}

const explorerCache = new Map(); // chemin -> enfants
const explorerOpen = new Set();

async function loadChildren(path) {
  const r = await api('POST', '/api/studio/raw', { tool: 'list_children', args: { path } });
  explorerCache.set(path, r.result || []);
}

async function renderExplorer() {
  const el = $('#ptab-explorer');
  if (!S.studio.connected) {
    el.innerHTML = '<div class="muted small">Connecte Roblox Studio pour explorer ta place.</div>';
    explorerCache.clear();
    return;
  }
  if (!explorerCache.has('')) {
    el.innerHTML = '<div class="muted small">Chargement…</div>';
    try {
      await loadChildren('');
    } catch (e) {
      el.innerHTML = `<div class="muted small">${esc(e.message)}</div>`;
      return;
    }
  }
  const node = (n) => {
    const open = explorerOpen.has(n.path);
    const kids = explorerCache.get(n.path);
    return `<div class="tree-node ${S.explorerSel === n.path ? 'selected' : ''}" data-node="${esc(n.path)}" data-count="${n.childCount}">
        <span class="tw">${n.childCount ? (open ? '▾' : '▸') : ''}</span>${n.isScript ? '📜' : ''}${esc(n.name)} <span class="cls">${esc(n.className)}</span></div>
      ${open && kids ? `<div class="tree-children">${kids.map(node).join('')}</div>` : ''}`;
  };
  const inspector = $('#inspector')?.textContent || '';
  el.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span class="section-title">${esc(S.studio.placeName)}</span>
      <button class="icon-btn" data-act="explorer-refresh" title="Actualiser">⟳</button></div>
    <div class="tree">${(explorerCache.get('') || []).map(node).join('')}</div>
    <div class="inspector ${inspector ? '' : 'hidden'}" id="inspector">${esc(inspector)}</div>`;
}

function renderConsole() {
  const el = $('#ptab-console');
  const atBottom = el.parentElement.scrollTop + el.parentElement.clientHeight >= el.parentElement.scrollHeight - 30;
  el.innerHTML =
    `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span class="section-title">Sortie de Studio</span><button class="icon-btn" data-act="clear-logs">Effacer</button></div>` +
    (S.logs.slice(-400).map((l) => `<div class="log ${l.level}">${l.play ? '<span class="play">[Play] </span>' : ''}${esc(l.text)}</div>`).join('') ||
      '<div class="muted small">Rien pour l’instant. Les agents voient aussi cette sortie (outil get_console).</div>');
  if (atBottom) el.parentElement.scrollTop = el.parentElement.scrollHeight;
}

function renderActivity() {
  const el = $('#ptab-activity');
  el.innerHTML =
    S.activity
      .slice()
      .reverse()
      .slice(0, 200)
      .map((a) => `<div class="act ${a.kind}"><span class="a-time">${time(a.at)}</span><span><b>${esc(a.who)}</b> ${esc(a.text)}</span></div>`)
      .join('') || '<div class="muted small">Ce que font les agents apparaîtra ici.</div>';
}

// ---------------------------------------------------------------- modale (installation / connexion)

let modalAgent = null;

function openTerminalModal(agent) {
  closeModal();
  modalAgent = agent.id;
  $('#modal-title').textContent = agent.name;
  $('#modal').classList.remove('hidden');
  const t = ensureTerm(agent.id);
  $('#modal-body').appendChild(t.el);
  requestAnimationFrame(() => {
    fitTerm(t);
    t.term.focus();
  });
}

const MODEL_LABELS = { '': 'Par défaut', sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku (léger)' };
let teamSize = 3;

function openTeamModal() {
  closeModal();
  $('#add-agent-menu').classList.add('hidden');
  $('#modal-title').textContent = 'Équipe de Claude';
  $('.modal-card').classList.add('form');
  $('#modal').classList.remove('hidden');
  renderTeamForm();
}

function renderTeamForm() {
  const { list, order } = S.roles;
  const existing = projectAgents().filter((a) => a.status !== 'exited').length;
  const prev = $$('.team-row').map((r) => ({ role: $('select[data-k=role]', r).value, model: $('select[data-k=model]', r).value }));
  const roleOpts = (sel) =>
    order.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(list[k].title)}</option>`).join('') +
    `<option value="" ${sel === '' ? 'selected' : ''}>Polyvalent (sans rôle)</option>`;
  const rows = Array.from({ length: teamSize }, (_, i) => {
    const p = prev[i] || { role: order[i] ?? '', model: i === 0 ? 'opus' : '' };
    return `<div class="team-row"><span class="tr-num">#${existing + i + 1}</span>
      <select data-k="role">${roleOpts(p.role)}</select>
      <select data-k="model">${Object.entries(MODEL_LABELS).map(([v, l]) => `<option value="${v}" ${v === p.model ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }).join('');
  $('#modal-body').innerHTML = `<div class="team-form">
    <div class="tf-label">Combien de Claude ?</div>
    <div class="size-picker">${[2, 3, 4, 5, 6].map((n) => `<button class="btn sm ${n === teamSize ? 'primary' : ''}" data-size="${n}">${n}</button>`).join('')}</div>
    <div class="tf-label">Rôles et modèles</div>
    ${rows}
    <div class="tf-label">Autorisations</div>
    <select id="team-mode">
      <option value="acceptEdits">Accepter les modifications de fichiers automatiquement (recommandé)</option>
      <option value="default">Me demander à chaque modification</option>
      <option value="plan">Mode plan (ils proposent avant d’agir)</option>
    </select>
    <p class="muted small">Tous les Claude utilisent <b>ton</b> abonnement Claude et partagent ses limites d’utilisation :
    avec Pro, 2 ou 3 Claude suffisent ; avec Max, tu peux en lancer davantage. Mets Opus au chef et Sonnet aux autres pour économiser.</p>
    <div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn" id="team-cancel">Annuler</button>
    <button class="btn primary" id="team-launch">Lancer l’équipe</button></div>
  </div>`;
}

async function launchTeam() {
  const p = project();
  const members = $$('.team-row').map((r) => ({ role: $('select[data-k=role]', r).value, model: $('select[data-k=model]', r).value }));
  const list = await attempt(() =>
    api('POST', `/api/projects/${p.id}/team`, { tabId: currentTab(), permissionMode: $('#team-mode').value, members }),
  );
  if (!list) return;
  closeModal();
  toast(`${list.length} Claude lancés. Parle au chef : il répartit le travail.`);
  const chef = list.find((a) => a.role === 'chef');
  if (chef) setTimeout(() => ($('#composer-target').value = chef.id), 300);
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('.modal-card').classList.remove('form');
  if (modalAgent) {
    api('DELETE', '/api/agents/' + modalAgent).catch(() => {});
    destroyTerm(modalAgent);
    modalAgent = null;
    loadSetup();
  }
}

// ---------------------------------------------------------------- actions

async function addAgent(type) {
  $('#add-agent-menu').classList.add('hidden');
  const p = project();
  if (!p) return;
  let command;
  if (type === 'custom') {
    command = prompt('Commande à lancer dans le dossier du projet (ex. « aider », « grok », « qwen »)');
    if (!command) return;
  }
  await attempt(() => api('POST', '/api/agents', { projectId: p.id, tabId: currentTab(), type, command }));
}

async function sendComposer() {
  const text = $('#composer-text').value.trim();
  const p = project();
  if (!text || !p) return;
  const target = $('#composer-target').value;
  const r =
    target === 'all'
      ? await attempt(() => api('POST', `/api/projects/${p.id}/broadcast`, { text, tabId: currentTab() }))
      : await attempt(() => api('POST', `/api/agents/${target}/send`, { text }));
  if (r) {
    $('#composer-text').value = '';
    autoGrow();
    if (target === 'all' && r.sent === 0) toast('Aucun agent lancé dans cet onglet.', true);
  }
}

function autoGrow() {
  const ta = $('#composer-text');
  ta.style.height = 'auto';
  ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest(
    '[data-act],[data-pid],[data-view],[data-add],[data-tab],[data-close-tab],[data-restart],[data-kill],[data-max],[data-ptab],[data-task-del],[data-node],[data-del],[data-pair-approve],[data-pair-reject],[data-revoke],[data-task-validate]',
  );
  if (!el) {
    if (!e.target.closest('.dropdown')) $('#add-agent-menu').classList.add('hidden');
    return;
  }
  const d = el.dataset;
  const p = project();

  if (d.del) {
    e.stopPropagation();
    if (confirm('Retirer ce projet de la liste ? (le dossier sur ton disque n’est pas supprimé)')) await attempt(() => api('DELETE', '/api/projects/' + d.del));
    return;
  }
  if (d.view === 'home') {
    S.view = 'home';
    renderAll();
    loadSetup();
    return;
  }
  if (d.pid) {
    if (d.pid !== S.activeProjectId) {
      await attempt(() => api('POST', `/api/projects/${d.pid}/open`));
      S.activeProjectId = d.pid;
      const st = await api('GET', '/api/state');
      Object.assign(S, { board: st.board, activity: st.activity, sync: st.sync });
    }
    S.view = 'workspace';
    renderAll();
    return;
  }
  if (d.add) return addAgent(d.add);
  if (d.pairApprove) return attempt(() => api('POST', `/api/pairing/${d.pairApprove}/approve`), 'Studio autorisé ✓');
  if (d.pairReject) return attempt(() => api('POST', `/api/pairing/${d.pairReject}/reject`));
  if (d.revoke) {
    if (!confirm('Révoquer cet accès ? Ce Studio devra être autorisé à nouveau.')) return;
    return attempt(() => api('DELETE', '/api/plugin-tokens/' + d.revoke), 'Accès révoqué');
  }
  if (d.taskValidate) return attempt(() => api('PATCH', `/api/projects/${p.id}/tasks/${d.taskValidate}`, { status: 'done' }), 'Tâche validée');
  if (d.ptab) {
    S.ptab = d.ptab;
    renderPanel();
    return;
  }
  if (d.closeTab) {
    e.stopPropagation();
    const n = projectAgents().filter((a) => a.tabId === d.closeTab).length;
    if (n && !confirm(`Fermer cet onglet et ses ${n} agent(s) ?`)) return;
    await attempt(() => api('DELETE', `/api/projects/${p.id}/tabs/${d.closeTab}`));
    return;
  }
  if (d.tab) {
    S.tab[p.id] = d.tab;
    S.maximized = null;
    renderWorkspace();
    return;
  }
  if (d.restart) return attempt(() => api('POST', `/api/agents/${d.restart}/restart`));
  if (d.kill) {
    const a = S.agents.find((x) => x.id === d.kill);
    if (a && a.status !== 'exited' && !confirm(`Fermer ${a.name} ? Ce qu’il est en train de faire sera interrompu.`)) return;
    return attempt(() => api('DELETE', `/api/agents/${d.kill}`));
  }
  if (d.max) {
    S.maximized = S.maximized ? null : d.max;
    renderWorkspace();
    return;
  }
  if (d.taskDel) return attempt(() => api('DELETE', `/api/projects/${p.id}/tasks/${d.taskDel}`));
  if (d.node !== undefined) {
    const path = d.node;
    S.explorerSel = path;
    if (Number(d.count) > 0) {
      if (explorerOpen.has(path)) explorerOpen.delete(path);
      else {
        explorerOpen.add(path);
        await attempt(() => loadChildren(path));
      }
    }
    try {
      const r = await api('POST', '/api/studio/raw', { tool: 'get_instance', args: { path } });
      const info = r.result;
      const src = info.source;
      delete info.source;
      delete info.children;
      await renderExplorer();
      const insp = $('#inspector');
      insp.classList.remove('hidden');
      insp.textContent = JSON.stringify(info, null, 2) + (src !== undefined ? '\n\n--- Source ---\n' + src : '');
    } catch (err) {
      await renderExplorer();
    }
    return;
  }

  switch (d.act) {
    case 'create-project': {
      const name = $('#np-name').value.trim();
      if (!name) return toast('Donne un nom à ton jeu.', true);
      const r = await attempt(() => api('POST', '/api/projects', { name, dir: $('#np-dir').value.trim() }), 'Projet créé ✨');
      if (r) {
        S.activeProjectId = r.id;
        S.view = 'workspace';
        const st = await api('GET', '/api/state');
        Object.assign(S, { projects: st.projects, board: st.board, activity: st.activity, sync: st.sync });
        renderAll();
      }
      break;
    }
    case 'team':
      openTeamModal();
      break;
    case 'install-plugin':
      await attempt(() => api('POST', '/api/setup/plugin'), 'Plugin installé. (Re)démarre Roblox Studio.');
      loadSetup();
      break;
    case 'open-plugins':
      attempt(() => api('POST', '/api/setup/open-plugins'));
      break;
    case 'install-agent':
    case 'login-agent': {
      const a = await attempt(() => api('POST', '/api/setup/terminal', { type: d.type, kind: d.act === 'login-agent' ? 'login' : 'install' }));
      if (a) openTerminalModal(a);
      break;
    }
    case 'add-task': {
      const title = $('#tf-title').value.trim();
      if (!title) return toast('Écris un titre de tâche.', true);
      const agentId = $('#tf-agent').value;
      const t = await attempt(() =>
        api('POST', `/api/projects/${p.id}/tasks`, { title, details: $('#tf-details').value.trim(), acceptance: $('#tf-accept').value.trim() }),
      );
      if (!t) return;
      $('#tf-title').value = '';
      $('#tf-details').value = '';
      $('#tf-accept').value = '';
      if (agentId) await attempt(() => api('POST', `/api/agents/${agentId}/task`, { taskId: t.id }), 'Tâche envoyée à l’agent');
      break;
    }
    case 'post-msg': {
      const text = $('#msg-text').value.trim();
      if (!text) return;
      $('#msg-text').value = '';
      await attempt(() => api('POST', `/api/projects/${p.id}/messages`, { text }));
      break;
    }
    case 'explorer-refresh':
      explorerCache.clear();
      for (const path of explorerOpen) await loadChildren(path).catch(() => explorerOpen.delete(path));
      renderExplorer();
      break;
    case 'clear-logs':
      S.logs = [];
      renderConsole();
      break;
  }
});

document.addEventListener('click', (e) => {
  const size = e.target.closest('[data-size]');
  if (size) {
    teamSize = Number(size.dataset.size);
    renderTeamForm();
  }
  if (e.target.id === 'team-launch') launchTeam();
  if (e.target.id === 'team-cancel') closeModal();
});

document.addEventListener('change', async (e) => {
  const d = e.target.dataset;
  const p = project();
  if (d.taskStatus) await attempt(() => api('PATCH', `/api/projects/${p.id}/tasks/${d.taskStatus}`, { status: e.target.value }));
  if (d.taskGive && e.target.value) await attempt(() => api('POST', `/api/agents/${e.target.value}/task`, { taskId: Number(d.taskGive) }), 'Tâche envoyée à l’agent');
  if (e.target.id === 'ws-sync') await attempt(() => api('PATCH', '/api/projects/' + p.id, { sync: e.target.checked }));
  if (e.target.id === 'session-select') await attempt(() => api('POST', '/api/studio/active', { sessionId: e.target.value }));
});

$('#add-agent-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  renderAddMenu();
  $('#add-agent-menu').classList.toggle('hidden');
});
$('#tab-add').addEventListener('click', async () => {
  const p = project();
  const t = await attempt(() => api('POST', `/api/projects/${p.id}/tabs`));
  if (t) {
    S.tab[p.id] = t.id;
    renderWorkspace();
  }
});
$('#ws-dir').addEventListener('click', () => attempt(() => api('POST', `/api/projects/${S.activeProjectId}/reveal`)));
$('#ws-pull').addEventListener('click', () => {
  if (!confirm('Importer tous les scripts de la place ouverte dans src/ ? Les fichiers du même nom seront remplacés.')) return;
  attempt(() => api('POST', `/api/projects/${S.activeProjectId}/pull`), (r) => `${r.written} script(s) importés dans src/`);
});
$('#ws-push').addEventListener('click', () =>
  attempt(() => api('POST', `/api/projects/${S.activeProjectId}/push`), (r) => `${r.count} script(s) envoyés à Studio`),
);
$('#composer-send').addEventListener('click', sendComposer);

// ---------------------------------------------------------------- dictée au micro (reconnaissance vocale du navigateur)
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let dictating = false;

function setMic(on) {
  dictating = on;
  $('#composer-mic').classList.toggle('on', on);
  $('#composer-mic').title = on ? 'J’écoute… clique pour arrêter' : 'Dicter au micro (cliquer pour commencer / arrêter)';
}

function startDictation() {
  if (!Speech) return toast('La dictée n’est pas disponible dans ce navigateur. Ouvre RoSwarm avec Microsoft Edge ou Google Chrome.', true);
  const ta = $('#composer-text');
  const base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
  let finalText = '';
  recog = new Speech();
  recog.lang = 'fr-FR';
  recog.continuous = true;
  recog.interimResults = true;
  recog.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
      else interim += r[0].transcript;
    }
    ta.value = base + finalText + interim;
    autoGrow();
  };
  recog.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Accès au micro refusé : autorise le micro pour RoSwarm (icône à gauche de l’adresse).', true);
    else if (ev.error === 'no-speech') toast('Je n’ai rien entendu. Reclique sur 🎤 et parle.', true);
    else if (ev.error !== 'aborted') toast('Erreur du micro : ' + ev.error, true);
  };
  recog.onend = () => {
    // la reconnaissance s'arrête parfois seule après un silence : on relance tant que le micro est activé
    if (dictating) {
      try {
        recog.start();
      } catch {
        setMic(false);
      }
    }
  };
  try {
    recog.start();
    setMic(true);
    toast('🎤 Je t’écoute… Reclique sur le micro quand tu as fini, puis sur Envoyer.');
  } catch (e) {
    toast('Impossible de démarrer le micro : ' + e.message, true);
  }
}

function stopDictation() {
  setMic(false);
  try {
    recog?.stop();
  } catch {}
}

$('#composer-mic').addEventListener('click', () => (dictating ? stopDictation() : startDictation()));
$('#composer-send').addEventListener('click', () => dictating && stopDictation(), true);
$('#composer-text').addEventListener('input', autoGrow);
$('#composer-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendComposer();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'tf-title' && e.key === 'Enter') $('[data-act="add-task"]').click();
  if (e.target.id === 'msg-text' && e.key === 'Enter') $('[data-act="post-msg"]').click();
  if (e.target.id === 'np-name' && e.key === 'Enter') $('[data-act="create-project"]').click();
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal();
});
$('#modal-close').addEventListener('click', closeModal);

connect();
