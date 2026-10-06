/* Repas & Courses, version autonome: everything runs on the phone, no account and no AI service needed. */
(() => {
const E = window.RC_ENGINE;

/* ---------- Icons (only where they help recognition) ---------- */
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>', chevL: '<path d="m15 18-6-6 6-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/>',
  auto: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
};
const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

/* ---------- Domain ---------- */
const DAYS = [["lun","lundi","Lun"],["mar","mardi","Mar"],["mer","mercredi","Mer"],["jeu","jeudi","Jeu"],["ven","vendredi","Ven"],["sam","samedi","Sam"],["dim","dimanche","Dim"]];
const DAY_NAME = Object.fromEntries(DAYS.map((d) => [d[0], d[1]]));
const AISLE_NAMES = E.AISLES;
const STORES = [
  { id: "leclerc", name: "E.Leclerc", site: "e.leclerc" }, { id: "carrefour", name: "Carrefour", site: "carrefour.fr", search: "https://www.carrefour.fr/s?q=" },
  { id: "auchan", name: "Auchan", site: "auchan.fr" }, { id: "intermarche", name: "Intermarché", site: "intermarche.com" },
  { id: "superu", name: "Super U", site: "coursesu.com" }, { id: "lidl", name: "Lidl", site: "lidl.fr" }, { id: "aldi", name: "Aldi", site: "aldi.fr" },
  { id: "netto", name: "Netto", site: "netto.fr" }, { id: "casino", name: "Casino", site: "casino.fr" }, { id: "monoprix", name: "Monoprix", site: "monoprix.fr" },
  { id: "franprix", name: "Franprix", site: "franprix.fr" }
];
const DIETS = [["tout","Je mange de tout","Viande, poisson, tout"],["flexi","Peu de viande","Viande 3 fois par semaine au plus"],["pesco","Poisson, pas de viande","Pescétarien"],["vege","Végétarien","Œufs et laitages, ni viande ni poisson"],["vegan","Végétalien (vegan)","Aucun produit animal"]];
const GOALS = [["equilibre","Équilibrés","Ni trop, ni trop peu"],["leger","Légers","Pour perdre du poids ou faire attention"],["copieux","Copieux","Bien nourrissants"],["proteines","Riches en protéines","Sport, prise de muscle"]];
const RESTRICTIONS = ["Sans porc","Halal","Sans gluten","Sans lactose","Peu salé","Peu sucré (diabète)","Pas épicé","Sans alcool en cuisine"];
const CUISINES = ["Française","Italienne","Méditerranéenne","Asiatique","Orientale","Indienne","Mexicaine","Africaine","Antillaise","Américaine"];
const STYLES = [["tres","Très simple","25 minutes au plus"],["simple","Simple","Environ 35 minutes, un peu plus le week-end"],["travaille","Un peu travaillé","Jusqu’à 50 minutes"],["passion","J’aime cuisiner","Simple en semaine, plats longs possibles le week-end"]];
const MEALSETS = [["soirs","Le soir seulement","7 dîners"],["soirs-we","Le soir, et le midi le week-end","9 repas"],["midis-soirs","Midi et soir, tous les jours","14 repas"]];
const AUTO_DEFAULT = { week: true, pantry: true, learn: true, copyNext: true, awake: true };
const AUTOS = [
  ["week", "Préparer la semaine tout seul", (p) => `Quand tu ouvres l’appli le ${DAY_NAME[p.shopDay || "sam"]} (ton jour de courses), la nouvelle semaine se crée sans rien demander.`],
  ["pantry", "Reprendre les restes", () => "Ce qui reste des paquets et ce que tu as dans tes placards est utilisé en priorité la semaine suivante."],
  ["learn", "Apprendre de mes choix", () => "Un plat que tu changes ou que tu n’as pas aimé ne revient plus. Un plat aimé revient de temps en temps."],
  ["copyNext", "Drive : copier le produit suivant", () => "En mode drive, quand tu valides un produit, le nom du suivant est copié : tu n’as plus qu’à le coller dans l’appli du magasin."],
  ["awake", "Garder l’écran allumé pendant les courses", () => "L’écran ne se met pas en veille quand la liste est ouverte."]
];
const find = (list, id) => list.find((x) => x[0] === id) || [id, "", ""];
const storeOf = (id) => STORES.find((s) => s.id === id) || { id, name: id || "ton magasin" };
const autoOf = (p) => ({ ...AUTO_DEFAULT, ...(p.auto || {}) });

/* ---------- Helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const eur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const slug = (s) => String(s ?? "").replace(/[œŒ]/g, "oe").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, w, ws) => `${n} ${n > 1 ? (ws || w + "s") : w}`;
const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
const dayKeyOf = (d) => DAYS[(d.getDay() + 6) % 7][0];
const daysBetween = (a, b) => Math.round((parseIso(isoLocal(b)) - parseIso(isoLocal(a))) / 864e5);
const dayLong = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
let toastTimer;
function toast(msg, undo) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button class="undo" id="undoBtn">Annuler</button>` : ""}`;
  t.hidden = false;
  if (undo) $("#undoBtn").onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 3200);
}
function armConfirm(btn, label, action) {
  if (btn.dataset.armed) { delete btn.dataset.armed; action(); return; }
  btn.dataset.orig = btn.innerHTML; btn.dataset.armed = "1"; btn.classList.add("danger"); btn.textContent = label;
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove("danger"); btn.innerHTML = btn.dataset.orig; } }, 3500);
}
function copy(text, okMsg) {
  try { navigator.clipboard.writeText(text).then(() => okMsg && toast(okMsg), () => toast("La copie est bloquée sur cet appareil.")); }
  catch (e) { toast("La copie est bloquée sur cet appareil."); }
}

/* ---------- Storage on this phone ---------- */
const PREFIX = "repas-courses:";
const COLLECTIONS = ["settings", "weeks", "history", "checked", "extras"];
const Store = (() => {
  const subs = [];
  const read = (c) => { try { return JSON.parse(localStorage.getItem(PREFIX + c)) || {}; } catch (e) { return {}; } };
  const save = (c, v) => {
    try { localStorage.setItem(PREFIX + c, JSON.stringify(v)); }
    catch (e) { toast("Plus de place pour enregistrer sur ce téléphone."); }
    subs.filter((s) => s.col === c).forEach((s) => s.cb({ ...v }));
  };
  return {
    watch(col, cb) { subs.push({ col, cb }); cb(read(col)); },
    set(col, id, data) { const o = read(col); o[id] = data; save(col, o); },
    del(col, id) { const o = read(col); delete o[id]; save(col, o); },
    dump() { return Object.fromEntries(COLLECTIONS.map((c) => [c, read(c)])); },
    load(all) { for (const c of COLLECTIONS) save(c, all[c] || {}); }
  };
})();

/* ---------- State ---------- */
const S = { profile: null, taste: { liked: [], disliked: [] }, autoMeta: {}, week: null, history: [], checked: {}, extras: {},
  tab: "semaine", shopMode: "liste", skipped: [], lastCopied: "", allDone: null };
const P = () => S.profile || {};
const engineOpts = () => ({ history: S.history || [], taste: S.taste || {} });

/* ---------- Week calendar ---------- */
function weekStart(w) { return parseIso(w.startDate || w.weekOf || isoLocal(new Date())); }
function weekDates(w) { const s = weekStart(w); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; }); }
function mealDate(w, m) { return weekDates(w).find((d) => dayKeyOf(d) === m.day) || weekStart(w); }
function isDue(w, now = new Date()) {
  if (!w) return false;
  const since = daysBetween(weekStart(w), now);
  return since >= 7 || (dayKeyOf(now) === (P().shopDay || "sam") && since >= 4);
}

/* ---------- Onboarding ---------- */
let draft = {}, obIdx = 0, obSingle = false, sugCache = { key: "", val: null };
function suggestion(p) {
  const key = JSON.stringify([p.adults, p.kids, p.diet, p.goal, p.style, p.meals, p.store, p.storeBrands, p.breakfast, p.restrictions, p.allergies, p.dislikes, p.batch]);
  if (sugCache.key !== key) sugCache = { key, val: E.suggest({ ...p, budget: 0 }) };
  return sugCache.val;
}
const choice = (field, [id, title, sub]) => `<button type="button" class="choice" data-set="${field}" data-val="${esc(id)}" aria-pressed="${draft[field] === id}"><span class="r"></span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
const choices = (field, list) => `<div class="choices">${list.map((x) => choice(field, x)).join("")}</div>`;
const tagList = (field, list) => `<div class="tags">${list.map(([v, l]) => `<button type="button" class="tagbtn" data-toggle="${field}" data-val="${esc(v)}" aria-pressed="${(draft[field] || []).includes(v)}">${esc(l)}</button>`).join("")}</div>`;
const tagOne = (field, list, current) => `<div class="tags">${list.map(([v, l]) => `<button type="button" class="tagbtn" data-set="${field}" data-val="${esc(v)}" aria-pressed="${String(current ?? draft[field]) === String(v)}">${esc(l)}</button>`).join("")}</div>`;
const counter = (field, label, sub, min) => `<div class="counter"><span>${label}<small>${sub}</small></span><span class="ctl"><button type="button" data-step="${field}" data-d="-1" data-min="${min}" aria-label="Moins">${ic("minus")}</button><strong>${draft[field] ?? min}</strong><button type="button" data-step="${field}" data-d="1" data-min="${min}" aria-label="Plus">${ic("plus")}</button></span></div>`;
const toggleRow = (key, title, desc, attr) => `<label class="toggle"><span><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span><input type="checkbox" ${attr}="${key}"${(attr === "data-auto" ? autoOf(draft)[key] : draft[key]) ? " checked" : ""}></label>`;

const STEPS = [
  { id: "welcome", html: () => `
      <h1>Bienvenue</h1>
      <p class="lead">Réponds à quelques questions, ça prend deux minutes. Ensuite, l’appli te propose chaque semaine des repas qui tiennent dans ton budget, et la liste de courses qui va avec.</p>
      <label class="field"><b>Ton prénom</b><small>Facultatif.</small><input class="input" id="ob-name" value="${esc(draft.name || "")}" autocomplete="given-name"></label>`,
    read: () => { draft.name = $("#ob-name").value.trim(); }, cta: "Commencer" },
  { id: "foyer", title: "Personnes à table", html: () => `
      <h1>Vous êtes combien à table ?</h1>
      <div>${counter("adults", "Adultes et ados", "12 ans et plus", 1)}${counter("kids", "Enfants", "Moins de 12 ans", 0)}</div>`,
    value: (p) => `${plural(p.adults || 1, "adulte")}${p.kids ? ", " + plural(p.kids, "enfant") : ""}` },
  { id: "diet", title: "Alimentation", html: () => `<h1>Comment tu manges ?</h1>${choices("diet", DIETS)}`,
    ok: () => !!draft.diet, need: "Choisis une réponse.", value: (p) => find(DIETS, p.diet)[1] },
  { id: "goal", title: "Genre de repas", html: () => `
      <h1>Quels repas tu préfères ?</h1>
      ${choices("goal", GOALS)}
      <p class="q">Contraintes</p>
      ${tagList("restrictions", RESTRICTIONS.map((r) => [r, r]))}`,
    ok: () => !!draft.goal, need: "Choisis le genre de repas.", value: (p) => [find(GOALS, p.goal)[1], ...(p.restrictions || [])].join(", ") },
  { id: "tastes", title: "Allergies et goûts", html: () => `
      <h1>Allergies et goûts</h1>
      <label class="field"><b>Allergies ou intolérances</b><small>Jamais dans les repas. Sépare par des virgules.</small><input class="input" id="ob-allergies" value="${esc(draft.allergies || "")}" placeholder="Par exemple : œufs, crustacés"></label>
      <label class="field"><b>Ce que tu n’aimes pas</b><small>Évité.</small><input class="input" id="ob-dislikes" value="${esc(draft.dislikes || "")}" placeholder="Par exemple : champignons, chou-fleur"></label>
      <label class="field"><b>Ce que tu aimes beaucoup</b><small>Plus souvent.</small><input class="input" id="ob-likes" value="${esc(draft.likes || "")}" placeholder="Par exemple : gratin, poulet, soupe"></label>`,
    read: () => { draft.allergies = $("#ob-allergies").value.trim(); draft.dislikes = $("#ob-dislikes").value.trim(); draft.likes = $("#ob-likes").value.trim(); },
    value: (p) => [p.allergies && "allergies : " + p.allergies, p.dislikes && "évite : " + p.dislikes].filter(Boolean).join(" · ") || "Rien de précisé" },
  { id: "style", title: "Cuisine", html: () => `
      <h1>Quel genre de cuisine ?</h1>
      ${choices("style", STYLES)}
      <p class="q">Cuisines que tu aimes</p>
      ${tagList("cuisines", CUISINES.map((c) => [c, c]))}
      <div>${toggleRow("batch", "Cuisiner plus pour avoir des restes", "Certains soirs, de quoi faire le déjeuner du lendemain.", "data-check")}
      ${(draft.kids || 0) > 0 ? toggleRow("picky", "Les enfants sont difficiles", "Des plats qu’ils acceptent facilement.", "data-check") : ""}</div>`,
    ok: () => !!draft.style, need: "Choisis un genre de cuisine.", value: (p) => [find(STYLES, p.style)[1], ...(p.cuisines || [])].join(", ") },
  { id: "meals", title: "Repas à prévoir", html: () => `
      <h1>Quels repas prévoir ?</h1>
      ${choices("meals", MEALSETS)}
      <div>${toggleRow("breakfast", "Ajouter petits-déjeuners et goûters", "Ajoutés à la liste de courses.", "data-check")}</div>`,
    ok: () => !!draft.meals, need: "Choisis quels repas prévoir.", value: (p) => find(MEALSETS, p.meals)[1] + (p.breakfast ? ", avec petits-déjeuners" : "") },
  { id: "store", title: "Magasin", html: () => `
      <h1>Où et quand tu fais tes courses ?</h1>
      <p class="q">Magasin</p>
      ${tagOne("store", STORES.map((s) => [s.id, s.name]))}
      <p class="q">Jour des courses</p>
      ${tagOne("shopDay", DAYS.map(([k, , s]) => [k, s]))}
      <div>${toggleRow("storeBrands", "Les marques du magasin me vont", "Souvent moins chères.", "data-check")}</div>`,
    ok: () => !!draft.store && !!draft.shopDay, need: "Choisis ton magasin et ton jour de courses.", value: (p) => `${storeOf(p.store).name}, le ${DAY_NAME[p.shopDay || "sam"]}` },
  { id: "budget", title: "Budget", html: () => {
      const sug = suggestion(draft);
      if (!draft.budgetEdited) draft.budget = sug.advised;
      const presets = [[sug.tight, "serré"], [sug.advised, "conseillé"], [sug.comfy, "confortable"]];
      return `
      <h1>Ton budget courses par semaine</h1>
      <p class="lead">J’ai calculé avec de vrais menus : pour ${plural(draft.adults || 1, "adulte")}${draft.kids ? ` et ${plural(draft.kids, "enfant")}` : ""}, ${find(MEALSETS, draft.meals)[1].toLowerCase()}${draft.breakfast ? " avec les petits-déjeuners" : ""}, chez ${esc(storeOf(draft.store).name)}, compte environ <b class="money">${sug.advised} €</b>.</p>
      <label class="amount"><input id="ob-budget" inputmode="numeric" value="${draft.budget}" aria-label="Budget par semaine en euros"><span>€ par semaine</span></label>
      ${tagOne("budgetPreset", presets.map(([v, l]) => [String(v), `${v} € · ${l}`]), draft.budget)}
      <p class="muted">Le budget serré est le minimum possible avec tes réponses : plus de plats simples et de saison. Modifiable à tout moment.</p>`; },
    read: () => { const v = parseFloat(String($("#ob-budget").value).replace(",", ".")); if (v > 0) draft.budget = Math.round(v); },
    ok: () => parseFloat(String($("#ob-budget").value).replace(",", ".")) >= 5, need: "Indique un budget en euros.", value: (p) => `${p.budget} € par semaine` },
  { id: "auto", title: "Automatique", html: () => `
      <h1>Ce que l’appli fait toute seule</h1>
      <p class="lead">Tout est activé. Tu peux changer d’avis plus tard dans les réglages.</p>
      <div>${AUTOS.map(([k, t, d]) => toggleRow(k, t, d(draft), "data-auto")).join("")}</div>`,
    value: (p) => { const a = autoOf(p); const n = AUTOS.filter(([k]) => a[k]).length; return `${n} sur ${AUTOS.length} activées`; } },
  { id: "recap", html: () => `
      <h1>Récapitulatif</h1>
      <div class="recap">${STEPS.filter((s) => s.value).map((s) => `<div><span class="k">${esc(s.title)}</span><span>${esc(s.value(draft))}</span></div>`).join("")}</div>
      <p class="muted">Juste après, tu pourras indiquer ce que tu as déjà à la maison et les promos du moment.</p>`, cta: "Créer ma première semaine" }
];

function openOnboarding(start = 0, single = false) {
  draft = JSON.parse(JSON.stringify(S.profile || { adults: 2, kids: 0, storeBrands: true, restrictions: [], cuisines: [], shopDay: "sam", auto: { ...AUTO_DEFAULT } }));
  draft.budgetEdited = !!S.profile;
  obIdx = start; obSingle = single;
  $("#main").hidden = true; $("#onboarding").hidden = false; closeSheet();
  renderOnboarding();
}
function renderOnboarding() {
  const st = STEPS[obIdx], total = STEPS.length - 1;
  const canBack = obSingle || obIdx > 0 || !!S.profile;
  $("#onboarding").innerHTML = `<div class="ob">
    <div class="ob-top">
      <button class="ob-back" data-act="ob-back" aria-label="${obSingle ? "Fermer" : "Retour"}"${canBack ? "" : ' style="visibility:hidden"'}>${ic(obSingle ? "x" : "chevL")}</button>
      ${obSingle ? `<b style="flex:1">${esc(st.title || "")}</b>` : obIdx ? `<div class="ob-bar"><i style="width:${obIdx / total * 100}%"></i></div><span class="ob-step">${obIdx}/${total}</span>` : ""}
    </div>
    <div class="ob-body">${st.html()}</div>
    <div class="ob-foot"><button class="btn primary big block" data-act="ob-next">${obSingle ? "Enregistrer" : st.cta || "Continuer"}</button></div>
  </div>`;
  window.scrollTo(0, 0);
}
function obNext() {
  const st = STEPS[obIdx];
  if (st.ok && !st.ok()) { toast(st.need); return; }
  if (st.read) st.read();
  if (!obSingle && obIdx < STEPS.length - 1) { obIdx++; renderOnboarding(); return; }
  const profile = { ...draft, done: true, updatedAt: Date.now() };
  delete profile.budgetEdited; delete profile.budgetPreset;
  const first = !S.profile || !S.week;
  S.profile = profile;
  Store.set("settings", "profile", profile);
  /* keep the meals, but redo quantities and prices for the new answers */
  if (S.week && S.week.slots) Store.set("weeks", "current", E.refresh(profile, S.week));
  $("#onboarding").hidden = true; $("#main").hidden = false;
  renderMain();
  if (obSingle) { setTab("reglages"); toast("Enregistré."); }
  else if (first) { setTab("semaine"); openPrep(); }
}
function obBack() {
  const st = STEPS[obIdx]; if (st.read) st.read();
  if (obSingle || obIdx === 0) { if (S.profile) { $("#onboarding").hidden = true; $("#main").hidden = false; renderMain(); } return; }
  obIdx--; renderOnboarding();
}
$("#onboarding").addEventListener("click", (e) => {
  const set = e.target.closest("[data-set]");
  if (set) {
    const f = set.dataset.set, v = set.dataset.val;
    if (f === "budgetPreset") { draft.budget = Number(v); draft.budgetEdited = true; }
    else draft[f] = v;
    renderOnboarding(); return;
  }
  const tg = e.target.closest("[data-toggle]");
  if (tg) {
    const f = tg.dataset.toggle, v = tg.dataset.val, arr = new Set(draft[f] || []);
    arr.has(v) ? arr.delete(v) : arr.add(v);
    if (v === "Halal" && arr.has("Halal")) arr.add("Sans porc");
    draft[f] = [...arr]; renderOnboarding(); return;
  }
  const stp = e.target.closest("[data-step]");
  if (stp) { const f = stp.dataset.step, min = Number(stp.dataset.min); draft[f] = Math.max(min, Math.min(10, (draft[f] ?? min) + Number(stp.dataset.d))); renderOnboarding(); }
});
$("#onboarding").addEventListener("change", (e) => {
  const c = e.target.closest("[data-check]"); if (c) { draft[c.dataset.check] = c.checked; return; }
  const a = e.target.closest("[data-auto]"); if (a) draft.auto = { ...autoOf(draft), [a.dataset.auto]: a.checked };
});
$("#onboarding").addEventListener("input", (e) => { if (e.target.id === "ob-budget") draft.budgetEdited = true; });
$("#onboarding").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); obNext(); } });

/* ---------- Planning ---------- */
function autoPantryText() {
  const w = S.week; if (!w || !autoOf(P()).pantry) return "";
  const have = (w.pantry || []).filter((n) => S.checked["p_" + slug(n)]);
  return [...(w.leftovers || []), ...have].join(", ");
}
function clearShoppingState() {
  Object.keys(S.checked).forEach((k) => Store.del("checked", k));
  Object.keys(S.extras).forEach((id) => { if (S.checked["x_" + id]) Store.del("extras", id); });
  S.skipped = []; S.allDone = null;
}
function generateWeek(prep, auto) {
  const start = new Date(); start.setHours(12, 0, 0, 0);
  /* the week being replaced counts as the most recent one, so none of its dishes come back */
  let hist = S.history || [];
  if (S.week && S.week.meals && S.week.meals.length) {
    hist = [{ weekOf: S.week.startDate, meals: S.week.meals.filter((m) => !m.restes).map((m) => m.name) }, ...hist].slice(0, 12);
    Store.set("history", "log", { weeks: hist });
  }
  const w = E.plan(P(), { history: hist, taste: S.taste || {}, start, prep });
  const week = { ...w, startDate: isoLocal(start), createdAt: Date.now(), auto: !!auto, budget: P().budget, store: P().store, prep };
  clearShoppingState();
  Store.set("weeks", "current", week);
  setTab("semaine");
  toast(auto ? "C’est ton jour de courses : ta nouvelle semaine est prête." : "Ta semaine est prête.");
}
function swapMeal(idx, reason) {
  const w = S.week, target = w && w.meals[idx]; if (!target || target.restes) return;
  if (reason === "Pas envie" && autoOf(P()).learn) addTaste("disliked", target.name);
  const next = E.swap(P(), w, idx, reason, engineOpts());
  closeSheet();
  if (!next) { toast("Pas d’autre plat qui convient pour ce repas."); return; }
  Store.set("weeks", "current", next);
  toast(`Nouveau plat : ${next.meals[idx].name}`, () => Store.set("weeks", "current", w));
}
function fixBudget() {
  const w = S.week; if (!w) return;
  const before = w.meals.map((m) => m.name);
  const next = E.fixBudget(P(), w, engineOpts());
  Store.set("weeks", "current", next);
  const changed = next.meals.filter((m) => !before.includes(m.name)).length;
  toast(changed ? `${plural(changed, "plat remplacé", "plats remplacés")}. Coût de la semaine : ${eur(next.spend)}.` : "Aucun plat moins cher ne convient.", changed ? () => Store.set("weeks", "current", w) : null);
}
function addTaste(kind, name) {
  const t = { liked: [...(S.taste.liked || [])], disliked: [...(S.taste.disliked || [])] };
  const other = kind === "liked" ? "disliked" : "liked";
  t[other] = t[other].filter((n) => n !== name);
  if (!t[kind].includes(name)) t[kind].push(name);
  S.taste = t; Store.set("settings", "taste", t);
}
function removeTaste(name) {
  const t = { liked: (S.taste.liked || []).filter((n) => n !== name), disliked: (S.taste.disliked || []).filter((n) => n !== name) };
  S.taste = t; Store.set("settings", "taste", t);
}
function maybeAutoWeek() {
  if (!autoOf(P()).week || !S.week || !isDue(S.week)) return;
  const today = isoLocal(new Date());
  if (S.autoMeta.ranFor === today) return;
  S.autoMeta = { ranFor: today };
  Store.set("settings", "auto", { ranFor: today });
  generateWeek({ home: autoPantryText(), promos: "", wishes: "" }, true);
}

/* ---------- Sheets ---------- */
function openSheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; document.body.style.overflow = "hidden"; }
function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; }
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
const sheetHead = (title, sub) => `<div class="sheet-head"><div>${sub ? `<p class="muted" style="font-size:15px">${sub}</p>` : ""}<h2 id="sheetTitle">${title}</h2></div><button class="close" data-act="close" aria-label="Fermer">${ic("x")}</button></div>`;

function openPrep() {
  const auto = autoPantryText();
  openSheet(`${sheetHead("Nouvelle semaine", `À partir d’aujourd’hui, ${dayLong(new Date())}`)}
    <form class="sheet-body" id="prepForm">
      <p class="muted">Tout est facultatif. Les mots que tu écris servent à choisir les plats.</p>
      <label class="field"><b>Ce que tu as déjà</b><small>Utilisé en priorité et pas racheté. Sépare par des virgules.</small>${auto ? `<span class="auto-fill">Rempli automatiquement avec les restes de la semaine dernière.</span>` : ""}<textarea class="input" id="homeText" placeholder="Par exemple : riz, pommes de terre, œufs">${esc(auto)}</textarea></label>
      <label class="field"><b>Promos du moment</b><small>Les plats qui utilisent ces produits passent en priorité.</small><textarea class="input" id="promoText" placeholder="Par exemple : poulet, saumon"></textarea></label>
      <label class="field"><b>Envies cette semaine</b><small>Par exemple : poisson, soupe, rapide, gratin.</small><input class="input" id="wishText" placeholder="Rien de spécial"></label>
      <button class="btn primary big block">Créer la semaine</button>
    </form>`);
}
function openMeal(i) {
  const w = S.week, m = w && w.meals[i]; if (!m) return;
  const liked = (S.taste.liked || []).includes(m.name), disliked = (S.taste.disliked || []).includes(m.name);
  const d = mealDate(w, m);
  openSheet(`${sheetHead(esc(m.name), `${dayLong(d)}, ${m.slot}`)}
    <div class="sheet-body">
      ${m.desc ? `<p>${esc(m.desc)}</p>` : ""}
      <div class="facts">${m.minutes ? `<span>${m.minutes} min</span>` : ""}${m.kcal ? `<span>${m.kcal} kcal par personne</span>` : ""}${m.cost ? `<span>≈ <span class="money">${eur(m.cost)}</span> pour le repas</span>` : ""}</div>
      ${m.ahead ? `<div class="status warn">${ic("bell")}<div><b>La veille</b><p>${esc(m.ahead)}</p></div></div>` : ""}
      ${m.leftover ? `<div class="status">${ic("auto")}<div><b>Restes prévus</b><p>${esc(m.leftover)}</p></div></div>` : ""}
      ${m.ingredients.length ? `<div class="section"><span class="label">Ingrédients</span><ul class="ing">${m.ingredients.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="section"><span class="label">Préparation</span><ol class="steps">${m.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      ${m.restes ? "" : `<div class="section"><span class="label">Ton avis</span>
        <div class="rate"><button class="btn" data-act="rate" data-i="${i}" data-kind="liked" aria-pressed="${liked}">${liked ? ic("check") : ""}On a aimé</button><button class="btn" data-act="rate" data-i="${i}" data-kind="disliked" aria-pressed="${disliked}">${disliked ? ic("check") : ""}Pas aimé</button></div>
        <p class="fine">${autoOf(P()).learn ? "Pris en compte automatiquement pour les prochaines semaines." : "Active « Apprendre de mes choix » dans les réglages pour que ça compte."}</p>
      </div>
      <div class="section"><span class="label">Changer ce plat</span>
        <div class="tags">${["Pas envie", "Trop long", "Moins cher", "Plus léger", "Plus copieux"].map((r) => `<button class="tagbtn" data-act="swap" data-i="${i}" data-reason="${r}">${r}</button>`).join("")}</div>
        <div class="addrow"><input class="input" id="swapWhy" placeholder="Ou écris ce que tu veux : poisson, soupe…"><button class="btn primary" data-act="swap" data-i="${i}" data-free="1">Changer</button></div>
      </div>`}
    </div>`);
}
function openTastes() {
  const t = S.taste || {};
  const list = (arr, title) => `<div class="section"><span class="label">${title}</span>${arr.length ? `<div class="rows">${arr.map((n) => `<div class="srow" style="grid-template-columns:1fr auto"><span>${esc(n)}</span><button class="link" data-act="untaste" data-name="${esc(n)}">Retirer</button></div>`).join("")}</div>` : `<p class="muted">Aucun pour l’instant.</p>`}</div>`;
  openSheet(`${sheetHead("Plats notés")}<div class="sheet-body">${list(t.liked || [], "Aimés, reviennent de temps en temps")}${list(t.disliked || [], "Évités, ne reviennent plus")}</div>`);
}
function openInstall() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const iosSteps = `<ol class="howto"><li>Ouvre ce lien dans Safari.</li><li>Appuie sur le bouton Partager, en bas de l’écran.</li><li>Choisis « Sur l’écran d’accueil », puis Ajouter.</li></ol>`;
  const andSteps = `<ol class="howto"><li>Ouvre ce lien dans Chrome.</li><li>Appuie sur les trois points, en haut à droite.</li><li>Choisis « Ajouter à l’écran d’accueil » ou « Installer l’appli ».</li></ol>`;
  openSheet(`${sheetHead("Ajouter à l’écran d’accueil")}
    <div class="sheet-body">
      <p>L’appli s’ouvre ensuite comme une vraie appli, même sans réseau dans le magasin.</p>
      <div class="status warn">${ic("alert")}<div><b>Important sur iPhone</b><p>Sans l’ajouter à l’écran d’accueil, Safari peut effacer tes données si tu n’ouvres pas l’appli pendant une semaine.</p></div></div>
      <div class="section"><span class="label">${ios ? "iPhone" : "Android"}</span>${ios ? iosSteps : andSteps}</div>
      <div class="section"><span class="label">${ios ? "Android" : "iPhone"}</span>${ios ? andSteps : iosSteps}</div>
      <button class="btn primary block" data-act="close">J’ai compris</button>
    </div>`);
}
function openBackup() {
  openSheet(`${sheetHead("Sauvegarde")}
    <div class="sheet-body">
      <p>Tes réponses, tes menus et ta liste sont enregistrés sur ce téléphone seulement. Pour changer de téléphone, copie ta sauvegarde et colle-la sur l’autre.</p>
      <button class="btn block" data-act="backup-copy">${ic("copy")}Copier ma sauvegarde</button>
      <label class="field"><b>Restaurer une sauvegarde</b><small>Colle ici le texte copié sur l’autre téléphone. Ça remplace tout ce qui est sur celui-ci.</small><textarea class="input" id="restoreText"></textarea></label>
      <button class="btn primary block" data-act="backup-restore">Restaurer</button>
    </div>`);
}

/* ---------- View: semaine ---------- */
function renderSemaine() {
  const box = $("#v-semaine");
  const p = P(), a = autoOf(p);
  const w = S.week;
  if (!w || !w.meals) {
    box.innerHTML = `<div class="head"><h1>${p.name ? `Bonjour ${esc(p.name)}` : "Ta semaine"}</h1><p>Aucune semaine pour l’instant.</p></div>
      <div class="box pad" style="display:grid;gap:14px">
        <p>L’appli choisit des repas pour ${esc(p.budget)} € par semaine environ, avec la liste de courses pour ${esc(storeOf(p.store).name)}.</p>
        <button class="btn primary big block" data-act="prep">Créer ma semaine</button>
      </div>`;
    return;
  }
  const now = new Date(), todayIso = isoLocal(now);
  const dates = weekDates(w), first = dates[0], last = dates[6];
  const budget = Number(p.budget || w.budget) || 0;
  const spend = w.spend ?? w.total;
  const over = budget && spend > budget + 0.5;
  const due = isDue(w, now);
  const meals = w.meals.map((m, i) => ({ m, i, d: mealDate(w, m) }));
  const todays = meals.filter((x) => isoLocal(x.d) === todayIso);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const aheadNotes = meals.filter((x) => isoLocal(x.d) === isoLocal(tomorrow) && x.m.ahead);
  const left = allItems().filter((x) => !S.checked[x.key]).length;

  let status = "";
  if (due) {
    status = `<div class="status warn">${ic("calendar")}<div><b>${dayKeyOf(now) === (p.shopDay || "sam") ? "C’est ton jour de courses" : "Ta semaine est terminée"}</b>
      <p>${a.week ? "La nouvelle semaine se prépare toute seule quand tu ouvres l’appli le jour des courses." : "Prépare la semaine suivante quand tu veux."}</p>
      <div class="acts"><button class="link" data-act="prep">Préparer la nouvelle semaine</button></div></div></div>`;
  } else if (w.auto && daysBetween(first, now) === 0) {
    status = `<div class="status">${ic("auto")}<div><b>Préparée automatiquement aujourd’hui</b><p>Avec ${w.prep && w.prep.home ? "les restes de la semaine dernière et " : ""}ton budget. Tu peux changer n’importe quel plat.</p></div></div>`;
  }
  const budgetBlock = `<div class="box pad budget">
      <div class="top"><span class="label">Coût de la semaine</span><span><span class="total">${eur(spend)}</span> <span class="of">sur ${eur(budget)}</span></span></div>
      <div class="meter${over ? " over" : ""}"><i style="width:${budget ? Math.min(100, spend / budget * 100) : 0}%"></i></div>
      ${over ? `<p class="note over">${eur(spend - budget)} au-dessus de ton budget.</p><button class="btn primary block" data-act="fix">Remplacer les plats les plus chers</button>`
        : `<p class="note">${eur(Math.max(0, budget - spend))} de marge · ${left ? `${plural(left, "article")} à acheter` : "courses faites"} · <button class="link" data-act="tab" data-tab="courses">Voir la liste</button></p>`}
      ${w.total > spend + 1 ? `<p class="note">À payer en caisse cette fois : environ ${eur(w.total)}. La différence, ce sont des produits qui dureront (riz, pâtes, épices…).</p>` : ""}
      ${w.warning ? `<p class="note">${esc(w.warning)}</p>` : ""}
    </div>`;
  const todayBlock = todays.length || aheadNotes.length ? `<div class="box today">
      <p class="when">Aujourd’hui, ${esc(dayLong(now))}</p>
      ${todays.map(({ m, i }) => `<button class="mrow" data-act="meal" data-i="${i}"><span class="slot">${m.slot === "midi" ? "Midi" : "Soir"}</span><span><span class="name">${esc(m.name)}</span><span class="meta" style="display:block">${[m.minutes && m.minutes + " min", m.kcal && m.kcal + " kcal"].filter(Boolean).join(" · ")}</span></span><span class="go">${ic("chevR")}</span></button>`).join("") || `<p class="mrow" style="grid-template-columns:1fr">Rien de prévu aujourd’hui.</p>`}
      ${aheadNotes.map((x) => `<div class="ahead">${ic("bell")}<span><b>Pour demain :</b> ${esc(x.m.ahead)}</span></div>`).join("")}
    </div>` : "";
  const byDay = dates.map((d) => [d, meals.filter((x) => isoLocal(x.d) === isoLocal(d))]).filter(([, l]) => l.length);
  const weekBlock = `<div class="section"><span class="label">La semaine</span><div class="week">${byDay.map(([d, l]) => {
      const iso = isoLocal(d), cls = iso < todayIso ? " past" : iso === todayIso ? " now" : "";
      return `<div class="wday${cls}"><div class="d">${DAYS.find((x) => x[0] === dayKeyOf(d))[2]}<small>${d.getDate()}</small></div><div class="wmeals">${l.map(({ m, i }) => `
        <button class="wmeal" data-act="meal" data-i="${i}"><span><span class="n">${esc(m.name)}</span>${p.meals !== "soirs" ? ` <span class="s">· ${m.slot}</span>` : ""}</span><span class="m">${m.minutes ? m.minutes + " min" : ""}</span></button>`).join("")}</div></div>`;
    }).join("")}</div></div>`;
  const tipsBlock = w.tips && w.tips.length ? `<div class="section"><span class="label">Bon à savoir cette semaine</span><ul class="tips">${w.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  box.innerHTML = `<div class="head"><h1>${p.name ? `Bonjour ${esc(p.name)}` : "Ta semaine"}</h1><p>Du ${esc(dayLong(first))} au ${esc(dayLong(last))}</p></div>
    ${status}${todayBlock}${budgetBlock}${weekBlock}${tipsBlock}
    ${!due ? `<button class="btn block" data-act="prep">Refaire une nouvelle semaine</button>` : ""}`;
}

/* ---------- View: courses ---------- */
const itemKey = (x) => "s_" + slug(x.product || x.name);
function searchUrl(product) {
  const st = storeOf(P().store);
  if (st.search) return st.search + encodeURIComponent(product);
  return "https://www.google.com/search?q=" + encodeURIComponent((st.site ? "site:" + st.site + " " : "") + product);
}
function allItems() {
  const w = S.week, shop = (w && w.shopping) || [];
  const extras = Object.entries(S.extras).map(([id, x]) => ({ name: x.name, product: x.name, qty: "", aisle: "Autre", price: 0, extraId: id, key: "x_" + id }));
  return [...shop.map((x) => ({ ...x, key: itemKey(x) })), ...extras];
}
function driveQueue() {
  const items = allItems().filter((x) => !S.checked[x.key]);
  items.sort((a, b) => AISLE_NAMES.indexOf(a.aisle) - AISLE_NAMES.indexOf(b.aisle));
  const skip = S.skipped.filter((k) => items.some((x) => x.key === k));
  return [...items.filter((x) => !skip.includes(x.key)), ...skip.map((k) => items.find((x) => x.key === k))];
}
function renderCourses() {
  const box = $("#v-courses");
  const w = S.week, st = storeOf(P().store);
  const all = allItems();
  const leftItems = all.filter((x) => !S.checked[x.key]);
  $("#tabCount").textContent = leftItems.length || "";
  const shopTotal = w ? w.total : 0;
  const leftCost = leftItems.reduce((a, x) => a + (x.price || 0), 0);
  const allDone = all.length > 0 && leftItems.length === 0;
  if (S.allDone === false && allDone) toast("Tout est dans le panier. Courses terminées.");
  S.allDone = all.length ? allDone : null;
  const head = `<div class="head"><h1>Courses</h1><p>${esc(st.name)}${w ? ` · ${plural(all.length, "article")} · ≈ <span class="money">${eur(shopTotal)}</span>` : ""}</p></div>`;
  const addForm = `<form id="extraForm" class="addrow"><input class="input" id="extraName" placeholder="Ajouter un article" aria-label="Article à ajouter" autocomplete="off"><button class="btn primary" aria-label="Ajouter">${ic("plus")}</button></form>`;
  if (!all.length) { box.innerHTML = head + `<p class="muted">La liste se remplit toute seule quand la semaine est créée.</p>` + addForm; return; }
  const seg = `<div class="seg" role="tablist"><button role="tab" data-act="shopmode" data-mode="liste" aria-selected="${S.shopMode === "liste"}">Liste</button><button role="tab" data-act="shopmode" data-mode="drive" aria-selected="${S.shopMode === "drive"}">Mode drive</button></div>`;
  if (S.shopMode === "drive") { box.innerHTML = head + seg + renderDrive(all.length); return; }
  let html = head + seg + `<div class="progress-line"><span><b>${all.length - leftItems.length}</b> sur ${all.length} dans le panier</span>${leftCost ? `<span>reste ≈ <span class="money">${eur(leftCost)}</span></span>` : ""}</div>` + addForm;
  for (const aisle of AISLE_NAMES) {
    const list = all.filter((x) => x.aisle === aisle);
    if (!list.length) continue;
    list.sort((a, b) => (!!S.checked[a.key] - !!S.checked[b.key]));
    const n = list.filter((x) => !S.checked[x.key]).length;
    html += `<section class="aisle"><div class="label"><span>${esc(aisle)}</span><span>${n ? n : "fait"}</span></div>` + list.map((x) => {
      const done = !!S.checked[x.key];
      return `<div class="line${done ? " done" : ""}">
        <label class="tick"><input type="checkbox" data-key="${esc(x.key)}"${done ? " checked" : ""} aria-label="Pris : ${esc(x.product)}"><span>${ic("check", "sm")}</span></label>
        <div class="main">
          <span class="prod">${esc(x.product)}${x.qty ? ` <span class="muted">${esc(x.qty)}</span>` : ""}</span><span class="price">${x.price ? eur(x.price) : ""}</span>
          ${x.promo ? `<span class="sub">en promo d’après toi</span>` : ""}
          ${x.why ? `<span class="why">${esc(x.why)}</span>` : ""}
          <span class="acts">${x.extraId ? `<button class="link" data-act="rm-extra" data-id="${esc(x.extraId)}">Retirer</button>` : `<button class="link" data-act="copy" data-copy="${esc(x.product)}">Copier le nom</button><a class="link" href="${esc(searchUrl(x.product))}" target="_blank" rel="noopener">Chercher</a>`}</span>
        </div>
      </div>`;
    }).join("") + `</section>`;
  }
  if (w && w.pantry && w.pantry.length) {
    html += `<section class="aisle"><div class="label"><span>Dans tes placards ?</span><span></span></div><p class="fine" style="padding-top:8px">Coche ce que tu as déjà.${autoOf(P()).pantry ? " C’est retenu automatiquement pour la semaine suivante." : ""}</p>` + w.pantry.map((name) => {
      const k = "p_" + slug(name), done = !!S.checked[k];
      return `<div class="line${done ? " done" : ""}"><label class="tick"><input type="checkbox" data-key="${esc(k)}"${done ? " checked" : ""} aria-label="J’en ai : ${esc(name)}"><span>${ic("check", "sm")}</span></label><div class="main"><span class="prod">${esc(name)}</span><span class="price"></span></div></div>`;
    }).join("") + `</section>`;
  }
  if (shopTotal) html += `<div class="receipt-total"><span>Total estimé</span><span class="money">${eur(shopTotal)}</span></div><p class="fine">Prix estimés d’après les prix habituels des marques magasin. Les vrais prix peuvent varier.</p>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-act="copy-list">${ic("copy")}Copier la liste</button><button class="btn" data-act="reset-list">Tout décocher</button></div>`;
  box.innerHTML = html;
}
function renderDrive(total) {
  const q = driveQueue();
  if (!q.length) return `<div class="box pad" style="display:grid;gap:10px"><h2>Tout est dans le panier</h2><p class="muted">Vérifie le total dans l’appli du magasin, puis valide ta commande.</p></div>`;
  const cur = q[0], next = q[1];
  const pos = total - q.length + 1;
  const a = autoOf(P());
  return `<div class="drive">
    <p class="count">Produit ${pos} sur ${total}</p>
    <div class="box dcard">
      <span class="aisle-name">${esc(cur.aisle)}</span>
      <span class="prod">${esc(cur.product)}</span>
      ${cur.qty ? `<span class="qty">Quantité ${esc(cur.qty)}</span>` : ""}
      ${cur.why ? `<span class="why">${esc(cur.why)}</span>` : ""}
      ${cur.price ? `<span class="price">≈ ${eur(cur.price)}</span>` : ""}
      <p class="copied" id="copied">${S.lastCopied === cur.product ? "Nom copié. Colle-le dans la recherche de l’appli." : ""}</p>
      <div class="drow"><button class="btn" data-act="copy" data-copy="${esc(cur.product)}">${ic("copy")}Copier</button>${cur.extraId ? `<span></span>` : `<a class="btn" href="${esc(searchUrl(cur.product))}" target="_blank" rel="noopener">${ic("search")}Chercher</a>`}</div>
    </div>
    <button class="btn primary big block" data-act="drive-ok" data-key="${esc(cur.key)}">Ajouté au panier</button>
    <button class="btn block" data-act="drive-skip" data-key="${esc(cur.key)}">Plus tard</button>
    ${next ? `<p class="next-up">Ensuite : ${esc(next.product)}</p>` : ""}
    <p class="fine">${a.copyNext ? "Quand tu appuies sur « Ajouté au panier », le nom du produit suivant est copié tout seul." : "Active « Drive : copier le produit suivant » dans les réglages pour aller plus vite."}</p>
  </div>`;
}

/* ---------- View: réglages ---------- */
function renderReglages() {
  const p = P(), a = autoOf(p), t = S.taste || {};
  const hist = (S.history || []).length;
  $("#v-reglages").innerHTML = `<div class="head"><h1>Réglages</h1><p>${p.name ? esc(p.name) + " · " : ""}${esc(STEPS[1].value(p))}</p></div>
    <div class="section"><span class="label">Automatique</span>
      <div>${AUTOS.map(([k, title, d]) => `<label class="toggle"><span><b>${esc(title)}</b><small>${esc(d(p))}</small></span><input type="checkbox" data-setauto="${k}"${a[k] ? " checked" : ""}></label>`).join("")}</div>
      <p class="fine">L’appli ne peut pas envoyer de notifications : ce qui est automatique se fait quand tu l’ouvres.</p>
    </div>
    <div class="section"><span class="label">Mes réponses</span>
      <div class="rows">${STEPS.map((s, i) => s.value && s.id !== "auto" ? `<button class="srow" data-act="edit-step" data-step="${i}"><span class="k">${esc(s.title)}</span><span class="v">${esc(s.value(p))}</span>${ic("chevR", "sm")}</button>` : "").join("")}</div>
    </div>
    <div class="section"><span class="label">Mémoire</span>
      <div class="rows">
        <button class="srow" data-act="tastes"><span class="k">Plats notés</span><span class="v">${(t.liked || []).length} aimés · ${(t.disliked || []).length} évités</span>${ic("chevR", "sm")}</button>
        <button class="srow" data-act="clear-history"><span class="k">Historique des menus</span><span class="v">${plural(hist, "semaine")}</span>${ic("chevR", "sm")}</button>
        <button class="srow" data-act="backup"><span class="k">Sauvegarde</span><span class="v">Changer de téléphone</span>${ic("chevR", "sm")}</button>
      </div>
      <p class="fine">L’historique sert à ne pas reproposer les mêmes plats. Tout est enregistré sur ce téléphone, rien n’est envoyé ailleurs.</p>
    </div>
    <div class="section"><span class="label">Téléphone</span>
      <div class="rows"><button class="srow" data-act="install"><span class="k">Ajouter à l’écran d’accueil</span><span class="v"></span>${ic("chevR", "sm")}</button></div>
    </div>
    <p class="fine">${E.RECIPES.length} recettes, dont ${E.poolFor(p, t).length} qui correspondent à tes réponses.</p>`;
}

/* ---------- Shell ---------- */
function renderAll() { renderSemaine(); renderCourses(); renderReglages(); }
function renderMain() {
  const p = P();
  $("#topStore").textContent = `${storeOf(p.store).name} · ${p.budget} € par semaine`;
  renderAll();
}
let wake = null;
async function updateWake() {
  const want = S.tab === "courses" && autoOf(P()).awake && document.visibilityState === "visible" && !$("#main").hidden;
  try {
    if (want && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); }
    else if (!want && wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
}
document.addEventListener("visibilitychange", () => { updateWake(); if (document.visibilityState === "visible" && S.profile && $("#onboarding").hidden) { maybeAutoWeek(); renderSemaine(); } });
function setTab(name) {
  S.tab = name;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  ["semaine", "courses", "reglages"].forEach((t) => { $("#v-" + t).hidden = t !== name; });
  try { localStorage.setItem(PREFIX + "tab", name); } catch (e) {}
  window.scrollTo(0, 0); updateWake();
}
$("#tab-semaine").innerHTML = ic("calendar") + "Semaine";
$("#tab-courses").innerHTML = ic("cart") + `Courses<span class="count" id="tabCount"></span>`;
$("#tab-reglages").innerHTML = ic("gear") + "Réglages";

/* Called synchronously from a tap so the browser allows the clipboard write */
function copyName(text) {
  S.lastCopied = text;
  try {
    navigator.clipboard.writeText(text).then(() => {
      const c = $("#copied"); if (c) c.textContent = "Nom copié. Colle-le dans la recherche de l’appli.";
      if (S.shopMode !== "drive" || S.tab !== "courses") toast("Copié. Colle-le dans la recherche du magasin.");
    }).catch(() => { S.lastCopied = ""; toast("La copie est bloquée sur cet appareil."); });
  } catch (e) { S.lastCopied = ""; toast("La copie est bloquée sur cet appareil."); }
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act;
  if (act === "tab") return setTab(a.dataset.tab);
  if (act === "close") return closeSheet();
  if (act === "ob-next") return obNext();
  if (act === "ob-back") return obBack();
  if (act === "prep") return openPrep();
  if (act === "fix") return fixBudget();
  if (act === "meal") return openMeal(Number(a.dataset.i));
  if (act === "swap") {
    let reason = a.dataset.reason || "";
    if (a.dataset.free) { reason = ($("#swapWhy").value || "").trim(); if (!reason) { toast("Écris ce que tu voudrais à la place."); return; } }
    return swapMeal(Number(a.dataset.i), reason);
  }
  if (act === "rate") {
    const m = S.week && S.week.meals[Number(a.dataset.i)]; if (!m) return;
    const kind = a.dataset.kind, on = (S.taste[kind] || []).includes(m.name);
    if (on) removeTaste(m.name); else addTaste(kind, m.name);
    openMeal(Number(a.dataset.i)); return;
  }
  if (act === "tastes") return openTastes();
  if (act === "untaste") { removeTaste(a.dataset.name); openTastes(); renderReglages(); return; }
  if (act === "install") return openInstall();
  if (act === "backup") return openBackup();
  if (act === "backup-copy") return copy(JSON.stringify({ app: "repas-courses", v: 1, at: Date.now(), data: Store.dump() }), "Sauvegarde copiée. Colle-la dans une note ou un message à toi-même.");
  if (act === "backup-restore") {
    try {
      const o = JSON.parse($("#restoreText").value);
      if (!o || o.app !== "repas-courses" || !o.data) throw new Error();
      Store.load(o.data); closeSheet(); toast("Sauvegarde restaurée.");
      if (!S.profile || !S.profile.done) openOnboarding(0, false); else { $("#onboarding").hidden = true; $("#main").hidden = false; renderMain(); }
    } catch (err) { toast("Ce texte n’est pas une sauvegarde de Repas & Courses."); }
    return;
  }
  if (act === "edit-step") return openOnboarding(Number(a.dataset.step), true);
  if (act === "shopmode") { S.shopMode = a.dataset.mode; renderCourses(); return; }
  if (act === "copy") return copyName(a.dataset.copy);
  if (act === "drive-ok") {
    const key = a.dataset.key;
    const next = driveQueue().find((x) => x.key !== key);
    if (next && autoOf(P()).copyNext) copyName(next.product);
    S.skipped = S.skipped.filter((k) => k !== key);
    Store.set("checked", key, { at: Date.now() });
    toast("Ajouté.", () => Store.del("checked", key));
    return;
  }
  if (act === "drive-skip") { const key = a.dataset.key; S.skipped = [...S.skipped.filter((k) => k !== key), key]; renderCourses(); return; }
  if (act === "rm-extra") { Store.del("extras", a.dataset.id); Store.del("checked", "x_" + a.dataset.id); return; }
  if (act === "copy-list") {
    const st = storeOf(P().store);
    const items = allItems().filter((x) => !S.checked[x.key]);
    if (!items.length) { toast("Rien à copier."); return; }
    let txt = `Courses ${st.name}\n`;
    for (const name of AISLE_NAMES) { const l = items.filter((x) => x.aisle === name); if (!l.length) continue; txt += `\n${name}\n` + l.map((x) => `- ${x.product}${x.qty ? " " + x.qty : ""}`).join("\n") + "\n"; }
    return copy(txt, "Liste copiée. Colle-la dans un message.");
  }
  if (act === "reset-list") return armConfirm(a, "Confirmer", () => { clearShoppingState(); toast("Liste décochée."); });
  if (act === "clear-history") {
    if (!(S.history || []).length) { toast("Pas encore d’historique."); return; }
    return armConfirm(a, "Effacer l’historique ?", () => { Store.set("history", "log", { weeks: [] }); toast("Historique effacé."); });
  }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest("#v-courses input[data-key]");
  if (c) { if (c.checked) Store.set("checked", c.dataset.key, { at: Date.now() }); else Store.del("checked", c.dataset.key); return; }
  const sa = e.target.closest("[data-setauto]");
  if (sa) {
    const p = { ...P(), auto: { ...autoOf(P()), [sa.dataset.setauto]: sa.checked } };
    S.profile = p; Store.set("settings", "profile", p);
    toast(sa.checked ? "Activé." : "Désactivé.");
    updateWake();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "extraForm") {
    e.preventDefault();
    const name = $("#extraName").value.trim(); if (!name) return;
    Store.set("extras", newId(), { name, aisle: "Autre" });
    $("#extraName").value = "";
    return;
  }
  if (e.target.id === "prepForm") {
    e.preventDefault();
    const prep = { home: $("#homeText").value.trim(), promos: $("#promoText").value.trim(), wishes: $("#wishText").value.trim() };
    closeSheet(); generateWeek(prep, false);
  }
});

/* ---------- Boot ---------- */
let started = false;
const refresh = () => {
  if (!started) {
    started = true; $("#loading").hidden = true;
    if (!S.profile || !S.profile.done) { openOnboarding(0, false); return; }
    $("#main").hidden = false;
    let t = null; try { t = localStorage.getItem(PREFIX + "tab"); } catch (e) {}
    setTab(["semaine", "courses", "reglages"].includes(t) ? t : "semaine");
  }
  if (!$("#onboarding").hidden) return;
  $("#main").hidden = false;
  renderMain();
};
Store.watch("settings", (d) => { S.profile = d.profile || null; S.taste = d.taste || { liked: [], disliked: [] }; S.autoMeta = d.auto || {}; if (started) refresh(); });
Store.watch("weeks", (d) => { S.week = d.current || null; if (started) refresh(); });
Store.watch("history", (d) => { S.history = (d.log && d.log.weeks) || []; if (started) refresh(); });
Store.watch("checked", (d) => { S.checked = d; if (started) refresh(); });
Store.watch("extras", (d) => { S.extras = d; if (started) refresh(); });
refresh();
if (S.profile && S.profile.done) maybeAutoWeek();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
