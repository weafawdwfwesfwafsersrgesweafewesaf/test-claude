/* Repas & Courses: weekly planner that works without any AI service.
 * Picks recipes from the library for a household profile (diet, restrictions, allergies, time, budget, season,
 * history and taste), spreads them over the week, then builds the shopping list in real pack sizes. */
(function (root) {
const D = (typeof module !== "undefined" && module.exports) ? require("./data.js") : root.RC_DATA;
const I = D.I;
const AISLES = ["Fruits & légumes", "Boucherie & poisson", "Crèmerie & œufs", "Épicerie salée", "Épicerie sucrée", "Boulangerie", "Surgelés", "Boissons", "Maison & hygiène", "Autre"];
const DAYKEYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const DAYNAMES = { lun: "lundi", mar: "mardi", mer: "mercredi", jeu: "jeudi", ven: "vendredi", sam: "samedi", dim: "dimanche" };
const STORE_FACTOR = { leclerc: 1, carrefour: 1.05, auchan: 1, intermarche: 1, superu: 1.04, lidl: 0.92, aldi: 0.9, netto: 0.92, casino: 1.1, monoprix: 1.3, franprix: 1.3 };
const TIME = { tres: [25, 25], simple: [35, 45], travaille: [50, 60], passion: [40, 240] };
const PIECE_GRAMS = { jambon: 40, saucisse: 100, merguez: 80, saumon: 125, oeuf: 55 };

const norm = (s) => String(s || "").replace(/[œŒ]/g, "oe").replace(/[æÆ]/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const stem = (w) => norm(w).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/(es|s|x)$/, "");
const terms = (txt) => norm(txt).split(/[,;\/\n]|\bet\b/).map((t) => t.replace(/[^a-z0-9 ]+/g, " ").trim()).filter((t) => t.length >= 3);
const round2 = (n) => Math.round(n * 100) / 100;
const wordStem = (s) => norm(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/(s|x)$/, "")).join(" ");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* true when the term appears as whole words, plural or singular */
const hasWords = (text, term) => { const t = wordStem(term); return t.length >= 3 && new RegExp(`(^| )${esc(t)}( |$)`).test(wordStem(text)); };
const hasFlag = (id, f) => I[id][5].includes(f);

function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- Recipes with derived facts ---------- */
function proteinOf(ing) {
  let best = null, bestW = 0;
  const cat = { v: "boeuf", p: "porc", l: "volaille", f: "poisson", c: "fruits de mer" };
  for (const [id, q] of ing) {
    const fl = I[id][5];
    const c = Object.keys(cat).find((k) => fl.includes(k));
    if (!c) continue;
    const w = I[id][2] === "pc" ? q * (PIECE_GRAMS[id] || 120) : q;
    if (w > bestW) { bestW = w; best = cat[c]; }
  }
  if (best) return best;
  const q = (id) => (ing.find((x) => x[0] === id) || [0, 0])[1];
  if (q("oeuf") >= 3) return "oeuf";
  if (ing.some(([id]) => id === "tofu")) return "tofu";
  if (ing.some(([id]) => hasFlag(id, "L"))) return "legumineuse";
  if (ing.some(([id]) => ["raclette", "reblochon", "feta", "chevre", "mozzarella", "ricotta"].includes(id))) return "fromage";
  return "legumes";
}
function starchOf(flags) {
  for (const [f, s] of [["S", "pates"], ["R", "riz"], ["M", "semoule"], ["Q", "quinoa"], ["P", "pommes de terre"], ["B", "pain"]]) if (flags.has(f)) return s;
  return "aucun";
}
const RECIPES = D.R.map(([id, n, d, m, k, c, s, t, ing, st, ah]) => {
  const flags = new Set();
  for (const [iid] of ing) {
    if (!I[iid]) throw new Error(`Ingrédient inconnu dans ${id} : ${iid}`);
    for (const ch of I[iid][5]) flags.add(ch);
  }
  return { id, n, d, m, k, c, s: s || "", t: t || [], ing, st, ah: ah || "", flags, protein: proteinOf(ing), starch: starchOf(flags),
    text: norm(`${n} ${d} ${c} ${ing.map(([i]) => I[i][0]).join(" ")}`) };
});
const BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/* ---------- Profile filters ---------- */
const DIET_EXCL = { tout: "", flexi: "", pesco: "vpl", vege: "vplfc", vegan: "vplfcod" };
const RESTR = {
  "Sans porc": (r) => r.flags.has("p"),
  "Halal": (r) => r.flags.has("p") || r.flags.has("a"),
  "Sans gluten": (r) => r.flags.has("g"),
  "Sans lactose": (r) => r.flags.has("d"),
  "Peu salé": (r) => r.t.includes("sale"),
  "Peu sucré (diabète)": (r) => r.t.includes("sucre"),
  "Pas épicé": (r) => r.t.includes("epice"),
  "Sans alcool en cuisine": (r) => r.flags.has("a")
};
const ALLERGY_RULES = [
  [/oeuf/, "o"], [/lait|lactose|laitier|fromage|beurre|creme/, "d"], [/gluten|\bble\b|celiaq|farine/, "g"],
  [/poisson/, "f"], [/crustace|crevette|fruits de mer|mollusque|moule/, "c"], [/arachide|cacahuete/, "n"],
  [/soja/, "s"], [/moutarde/, "m"], [/porc|cochon/, "p"], [/boeuf|agneau/, "v"], [/poulet|volaille|dinde/, "l"], [/alcool|\bvin\b/, "a"]
];
function textExcludes(r, txt) {
  for (const t of terms(txt)) {
    const rule = ALLERGY_RULES.find(([re]) => re.test(t));
    if (rule && r.flags.has(rule[1])) return true;
    if (hasWords(r.text, t)) return true;
  }
  return false;
}
function allowed(r, p, taste) {
  const excl = DIET_EXCL[p.diet] || "";
  for (const f of excl) if (r.flags.has(f)) return false;
  for (const x of p.restrictions || []) if (RESTR[x] && RESTR[x](r)) return false;
  if (p.allergies && textExcludes(r, p.allergies)) return false;
  if (p.dislikes && textExcludes(r, p.dislikes)) return false;
  if ((taste.disliked || []).includes(r.n)) return false;
  const [, maxWe] = TIME[p.style] || TIME.simple;
  if (r.m > maxWe) return false;
  return true;
}
function poolFor(p, taste) { return RECIPES.filter((r) => allowed(r, p, taste || {})); }

/* ---------- Helpers ---------- */
const eqOf = (p) => (p.adults || 1) + 0.6 * (p.kids || 0);
const isMeat = (r) => r.flags.has("v") || r.flags.has("p") || r.flags.has("l");
function seasonOf(d) { const m = d.getMonth(); return m < 2 || m === 11 ? "h" : m < 5 ? "p" : m < 8 ? "e" : "a"; }
const SEASON_NAME = { h: "hiver", p: "printemps", e: "été", a: "automne" };
/* Ingredients named in free text: "riz" means rice, not rice noodles or chorizo */
function matchIds(txt) {
  const out = new Set();
  for (const t of terms(txt)) {
    const st = wordStem(t);
    if (st.length < 3) continue;
    const ids = Object.keys(I);
    const starts = ids.filter((id) => { const n = wordStem(I[id][0]); return n === st || n.startsWith(st + " ") || st.startsWith(n + " ") || st === n; });
    (starts.length ? starts : ids.filter((id) => hasWords(I[id][0], st))).forEach((id) => out.add(id));
  }
  return out;
}
/* "310 g de lentilles corail, riz, 2 boîtes de thon" → how much of each ingredient is already at home (Infinity when no amount) */
function parseHome(txt) {
  const out = new Map();
  for (let t of norm(txt).split(/[,;\n]/)) {
    t = t.replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
    if (t.length < 3) continue;
    let qty = Infinity, unit = null, rest = t;
    const mm = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l)?\s+(?:de |d )?(.+)$/);
    if (mm) { const n = parseFloat(mm[1].replace(",", ".")); unit = mm[2] || null; qty = unit === "kg" || unit === "l" ? n * 1000 : unit === "cl" ? n * 10 : n; rest = mm[3]; }
    let ids = [...matchIds(rest)];
    if (!ids.length) for (const w of rest.split(" ").filter((x) => x.length >= 3).reverse()) { ids = [...matchIds(w)]; if (ids.length) break; }
    for (const id of ids) {
      const pc = I[id][2] === "pc";
      const q = qty === Infinity || (unit && pc) || (!unit && !pc) ? Infinity : qty;
      out.set(id, (out.get(id) || 0) + q);
    }
  }
  return out;
}
const homeSet = (txt) => new Set(parseHome(txt || "").keys());
const CUISINE_KEY = { "Française": "francaise", "Italienne": "italienne", "Méditerranéenne": "mediterraneenne", "Asiatique": "asiatique", "Orientale": "orientale", "Indienne": "indienne", "Mexicaine": "mexicaine", "Africaine": "africaine", "Antillaise": "antillaise", "Américaine": "americaine" };

function slotsFor(p, start) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const k = DAYKEYS[(d.getDay() + 6) % 7];
    if (p.meals === "midis-soirs" || (p.meals === "soirs-we" && (k === "sam" || k === "dim"))) out.push({ day: k, slot: "midi", i });
    out.push({ day: k, slot: "soir", i });
  }
  return out;
}

/* ---------- Scoring ---------- */
function makeContext(p, opts) {
  const hist = opts.history || [];
  const recent = new Set(hist.slice(0, 3).flatMap((w) => w.meals || []));
  const older = new Set(hist.slice(3, 8).flatMap((w) => w.meals || []));
  const lastServed = {};
  hist.forEach((w, i) => (w.meals || []).forEach((n) => { if (lastServed[n] === undefined) lastServed[n] = i + 1; }));
  const start = opts.start || new Date();
  return {
    p, taste: opts.taste || {}, recent, older, lastServed, season: seasonOf(start),
    cuisines: new Set((p.cuisines || []).map((c) => CUISINE_KEY[c]).filter(Boolean)),
    likes: terms(p.likes || ""), wishes: terms((opts.prep && opts.prep.wishes) || ""),
    promoIds: matchIds((opts.prep && opts.prep.promos) || ""), homeIds: homeSet(opts.prep && opts.prep.home),
    rng: mulberry32(opts.seed || ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0))
  };
}
function score(r, ctx, chosen) {
  const p = ctx.p;
  let s = ctx.rng() * 3;
  if (ctx.recent.has(r.n)) s -= 30;
  else if (ctx.older.has(r.n)) s -= 3;
  if ((ctx.taste.liked || []).includes(r.n)) s += (ctx.lastServed[r.n] || 99) >= 4 ? 2.5 : -2;
  if (r.s && !r.s.includes(ctx.season)) s -= 4;
  if (ctx.cuisines.has(r.c)) s += 1.5;
  for (const t of ctx.likes) if (hasWords(r.text, t)) { s += 1.5; break; }
  for (const t of ctx.wishes) {
    const st = wordStem(t);
    if (hasWords(r.text, t) || (st === "rapide" && r.m <= 25) || (st.startsWith("leger") && r.t.includes("leger")) || (/poisson/.test(st) && (r.flags.has("f") || r.flags.has("c")))) { s += 2.5; break; }
  }
  if (p.goal === "leger") { if (r.t.includes("leger") || r.k <= 500) s += 2; if (r.k > 650) s -= 3; }
  else if (p.goal === "copieux") { if (r.t.includes("copieux") || r.k >= 620) s += 2; if (r.k < 450) s -= 1.5; }
  else if (p.goal === "proteines") { if (r.t.includes("proteines")) s += 2.5; if (["legumes", "fromage"].includes(r.protein)) s -= 2; }
  else if (r.k > 720) s -= 1;
  if (p.picky) { if (r.t.includes("enfant")) s += 2; if (r.t.includes("epice")) s -= 3; }
  else if (p.kids && r.t.includes("enfant")) s += 0.5;
  for (const [id] of r.ing) { if (ctx.promoIds.has(id)) s += 2; if (ctx.homeIds.has(id)) s += 1.5; }
  /* variety against what is already chosen */
  const sameProtein = chosen.filter((c) => c.protein === r.protein).length;
  const cap = r.protein === "legumineuse" || r.protein === "legumes" ? 3 : 2;
  if (sameProtein >= cap) s -= 6; else if (sameProtein) s -= 1.5 * sameProtein;
  const last = chosen[chosen.length - 1];
  if (last && last.protein === r.protein) s -= 2;
  if (last && last.starch === r.starch && r.starch !== "aucun") s -= 1.5;
  if (chosen.filter((c) => c.c === r.c).length >= 2) s -= 2;
  if (chosen.filter((c) => c.starch === r.starch && r.starch !== "aucun").length >= 3) s -= 2.5;
  /* fewer wasted fresh products: reuse what another chosen meal already opens */
  const fresh = new Set(chosen.flatMap((c) => c.ing.filter(([id]) => !hasFlag(id, "k") && !hasFlag(id, "b")).map(([id]) => id)));
  let shared = 0;
  for (const [id] of r.ing) if (fresh.has(id)) shared++;
  s += Math.min(2, shared) * 0.8;
  if (p.diet === "flexi" && isMeat(r) && chosen.filter(isMeat).length >= 3) s -= 100;
  return s;
}
function pick(cands, ctx, chosen) {
  /* dishes served in the last 3 weeks only come back when nothing else fits */
  const fresh = cands.filter((r) => !ctx.recent.has(r.n));
  if (fresh.length) cands = fresh;
  const scored = cands.map((r) => ({ r, s: score(r, ctx, chosen) })).sort((a, b) => b.s - a.s).slice(0, 8);
  if (!scored.length) return null;
  const max = scored[0].s;
  const w = scored.map((x) => Math.exp((x.s - max) / 1.3));
  let t = ctx.rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) { t -= w[i]; if (t <= 0) return scored[i].r; }
  return scored[0].r;
}

/* ---------- Quantities, display and costs ---------- */
const fmtNum = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const elide = (w) => /^[aeiouyhéèêâîôûœ]/i.test(w) && !/^(haricot|hach)/i.test(w) ? `d’${w}` : `de ${w}`;
function lowName(id) { const n = I[id][0]; return /^[A-Z][a-zé]/.test(n) && !/^(Ras|Emmental|Parmesan)/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n.toLowerCase(); }
function fmtNeed(id, q) {
  const [, , unit, , , flags, , sg, pl] = I[id];
  const low = lowName(id);
  if (unit === "pc") {
    const n = q < 1 ? Math.max(0.5, Math.round(q * 2) / 2) : Math.round(q);
    return `${n === 0.5 ? "½" : fmtNum(n)} ${n > 1 ? pl : sg}`;
  }
  if (flags.includes("b")) {
    if (unit === "ml" && q <= 90) return `${Math.max(1, Math.round(q / 15))} c. à soupe ${elide(low)}`;
    if (unit === "g" && q <= 25) return `${Math.max(1, Math.round(q / 5))} c. à café ${elide(low)}`;
  }
  if (unit === "g") {
    if (q >= 1000) return `${fmtNum(q / 1000)} kg ${elide(low)}`;
    const r = q < 100 ? Math.max(5, Math.round(q / 5) * 5) : Math.round(q / 10) * 10;
    return `${r} g ${elide(low)}`;
  }
  if (q >= 1000) return `${fmtNum(q / 1000)} L ${elide(low)}`;
  const cl = Math.max(1, Math.round(q / 10));
  return `${cl} cl ${elide(low)}`;
}
function unitPrice(id, p) {
  const f = (STORE_FACTOR[p.store] || 1) * (p.storeBrands === false ? 1.25 : 1);
  return (I[id][4] / I[id][3]) * f;
}
function mealCost(r, scale, p, homeIds) {
  let c = 0;
  for (const [id, q] of r.ing) if (!hasFlag(id, "b") && !(homeIds && homeIds.has(id))) c += q * scale * unitPrice(id, p);
  return round2(c);
}

/* ---------- Assemble a week from its slots ---------- */
function assemble(p, slots, prep, extra) {
  const eq = eqOf(p);
  const base = eq / 4;
  const home = parseHome(prep.home || ""), homeIds = new Set(home.keys()), promoIds = matchIds(prep.promos || "");
  const meals = slots.map((sl) => {
    if (sl.restes) {
      const src = slots[sl.restesOf], r = BY_ID[src.rid];
      return { day: sl.day, slot: sl.slot, name: `Restes : ${r.n}`, desc: "Ce qui reste du dîner d’hier.", minutes: 5, kcal: r.k, cost: 0,
        ingredients: [], steps: ["Réchauffe les restes du dîner d’hier."], ahead: "", leftover: "", restes: true };
    }
    const r = BY_ID[sl.rid];
    const scale = base * (sl.mult || 1);
    return { day: sl.day, slot: sl.slot, rid: r.id, name: r.n, desc: r.d, minutes: r.m, kcal: r.k, cost: mealCost(r, scale, p, homeIds),
      ingredients: r.ing.map(([id, q]) => fmtNeed(id, q * scale)), steps: r.st, ahead: r.ah,
      leftover: sl.mult > 1 ? (sl.mult >= 2 ? "Fais le double : la moitié sert de déjeuner demain." : "Prévois une portion de plus pour le déjeuner de demain.") : "" };
  });
  /* needs per ingredient */
  const need = {}, usedOn = {};
  slots.forEach((sl) => {
    if (sl.restes) return;
    const r = BY_ID[sl.rid];
    for (const [id, q] of r.ing) {
      need[id] = (need[id] || 0) + q * base * (sl.mult || 1);
      (usedOn[id] = usedOn[id] || new Set()).add(sl.day);
    }
  });
  if (p.breakfast) for (const [id, q] of D.BREAKFAST) { need[id] = (need[id] || 0) + q * eq; (usedOn[id] = usedOn[id] || new Set()).add("petit-déjeuner"); }
  const shopping = [], pantry = [], leftovers = [], fromHome = [];
  let spend = 0;
  for (let [id, q] of Object.entries(need)) {
    const [name, aisle, unit, pack, , flags, product] = I[id];
    if (flags.includes("b")) { pantry.push(name); continue; }
    if (home.has(id)) {
      const have = home.get(id);
      if (have >= q * 0.95) { fromHome.push(name); continue; }
      q -= have;
    }
    const packs = Math.max(1, Math.ceil(q / pack - 0.08));
    const left = packs * pack - q;
    const days = [...usedOn[id]].map((d) => DAYNAMES[d] || d);
    let why = days.length > 1 ? `Pour ${days.slice(0, -1).join(", ")} et ${days[days.length - 1]}` : `Pour ${days[0]}`;
    if (left / pack >= 0.2 && unit !== "pc") {
      const txt = fmtNeed(id, left);
      if (flags.includes("k")) { why += `. Il en restera environ ${txt.replace(/ (de|d’).*$/, "")}`; leftovers.push(txt); }
    } else if (unit === "pc" && pack > 1 && left >= 1 && flags.includes("k")) leftovers.push(fmtNeed(id, left));
    const halal = (p.restrictions || []).includes("Halal") && (flags.includes("v") || flags.includes("l"));
    const price = round2(packs * pack * unitPrice(id, p));
    /* what the week really costs: long-life products only count for what is used, the rest serves next weeks */
    spend += flags.includes("k") ? q * unitPrice(id, p) : price;
    shopping.push({ id, name, product: product + (halal ? " (halal)" : ""), qty: packs > 1 ? `× ${packs}` : "", aisle: AISLES[aisle],
      price, promo: promoIds.has(id), why });
  }
  shopping.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name, "fr"));
  const total = round2(shopping.reduce((a, x) => a + x.price, 0));
  /* tips from the plan itself */
  const tips = [];
  const reuse = Object.entries(usedOn).filter(([id, s]) => s.size >= 3 && !hasFlag(id, "b") && !homeIds.has(id)).sort((a, b) => b[1].size - a[1].size)[0];
  if (reuse) tips.push(`${I[reuse[0]][0]} : un seul achat sert pour ${reuse[1].size} repas cette semaine.`);
  if (fromHome.length) tips.push(`Déjà chez toi, donc pas dans la liste : ${fromHome.slice(0, 4).join(", ").toLowerCase()}.`);
  const promoUsed = shopping.filter((x) => x.promo).map((x) => x.name.toLowerCase());
  if (promoUsed.length) tips.push(`Repas choisis autour de tes promos : ${promoUsed.slice(0, 3).join(", ")}.`);
  const cooked = meals.filter((m) => !m.restes && m.cost);
  if (cooked.length) {
    const cheap = cooked.reduce((a, b) => (a.cost <= b.cost ? a : b));
    tips.push(`Le repas le plus économique : ${cheap.name.toLowerCase()}, environ ${fmtNum(cheap.cost / eq)} € par personne.`);
  }
  if (leftovers.length) tips.push(`Il restera ${leftovers.slice(0, 2).join(" et ")} : ce sera repris la semaine prochaine.`);
  return { meals, shopping, pantry: [...new Set(pantry)], leftovers, total, spend: round2(spend), tips: tips.slice(0, 3), ...(extra || {}) };
}

/* ---------- Planning ---------- */
function assignBatch(p, slots) {
  if (!p.batch) return;
  let used = 0, lastI = -9;
  for (const s of slots) {
    if (used >= 3 || s.slot !== "soir" || s.i - lastI < 2) continue;
    if (p.meals === "soirs") {
      /* one extra portion to take to work: only when the next day is a weekday */
      if (["dim", "lun", "mar", "mer", "jeu"].includes(s.day)) { s.mult = 1 + 1 / eqOf(p); used++; lastI = s.i; }
    } else {
      const next = slots.find((x) => x.i === s.i + 1 && x.slot === "midi");
      if (next && !next.restes) { s.mult = 2; next.restes = true; next.restesOf = slots.indexOf(s); used++; lastI = s.i; }
    }
  }
}
function plan(p, opts) {
  opts = opts || {};
  const start = new Date(opts.start || Date.now()); start.setHours(12, 0, 0, 0);
  const prep = opts.prep || {};
  const ctx = makeContext(p, { ...opts, start });
  const [maxWk] = TIME[p.style] || TIME.simple;
  const slots = slotsFor(p, start);
  assignBatch(p, slots);
  const cookIdx = slots.map((s, i) => (s.restes ? -1 : i)).filter((i) => i >= 0);
  const weekendCook = cookIdx.filter((i) => slots[i].day === "sam" || slots[i].day === "dim").length;
  let pool = poolFor(p, ctx.taste);
  const warnings = [];
  if (pool.length < cookIdx.length) warnings.push(`Avec ces réponses, seulement ${pool.length} recettes conviennent : certaines reviennent plus souvent. Assouplis une contrainte pour plus de choix.`);
  const chosen = [];
  for (let k = 0; k < cookIdx.length; k++) {
    const longLeft = weekendCook - chosen.filter((c) => c.m > maxWk).length;
    let cands = pool.filter((r) => !chosen.includes(r) && (r.m <= maxWk || longLeft > 0));
    if (!cands.length) cands = pool.filter((r) => r.m <= maxWk || longLeft > 0);
    if (!cands.length) cands = pool.length ? pool : RECIPES.filter((r) => r.m <= maxWk);
    chosen.push(pick(cands, ctx, chosen));
  }
  /* put long recipes on the weekend, fragile ones early, the rest in a shuffled order */
  const fragility = (r) => r.ing.reduce((a, [id]) => a + (hasFlag(id, "x") ? (hasFlag(id, "f") || hasFlag(id, "c") ? 3 : 1) : 0), 0);
  const order = chosen.map((r) => ({ r, key: ctx.rng() })).sort((a, b) => a.key - b.key).map((x) => x.r);
  const weekendIdx = cookIdx.filter((i) => slots[i].day === "sam" || slots[i].day === "dim");
  const longOnes = order.filter((r) => r.m > maxWk);
  const rest = order.filter((r) => r.m <= maxWk).sort((a, b) => (fragility(b) >= 3) - (fragility(a) >= 3));
  const free = new Set(cookIdx);
  for (const r of longOnes) { const i = weekendIdx.find((x) => free.has(x)); if (i === undefined) { rest.push(r); continue; } slots[i].rid = r.id; free.delete(i); }
  for (const i of cookIdx) if (free.has(i)) { const r = rest.shift(); slots[i].rid = r.id; free.delete(i); }
  let week = assemble(p, slots, prep);
  /* budget: replace the most expensive meals by cheaper ones until it fits */
  const budget = Number(p.budget) || 0;
  for (let guard = 0; budget && week.spend > budget && guard < 30; guard++) {
    if (!replaceMostExpensive(p, slots, prep, ctx, pool)) break;
    week = assemble(p, slots, prep);
  }
  if (budget && week.spend > budget + 0.5) warnings.push(`Même avec les plats les moins chers, la semaine coûte environ ${fmtNum(week.spend)} €. Pour tenir ${budget} €, prévois moins de repas ou augmente un peu le budget.`);
  return { ...week, slots, warning: warnings.join(" "), seasonName: SEASON_NAME[ctx.season], poolSize: pool.length };
}
function replaceMostExpensive(p, slots, prep, ctx, pool) {
  const homeIds = homeSet(prep.home);
  const base = eqOf(p) / 4;
  const [maxWk] = TIME[p.style] || TIME.simple;
  const used = new Set(slots.filter((s) => s.rid).map((s) => s.rid));
  const cooked = slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.restes && s.rid)
    .map(({ s, i }) => ({ i, cost: mealCost(BY_ID[s.rid], base * (s.mult || 1), p, homeIds) })).sort((a, b) => b.cost - a.cost);
  for (const { i, cost } of cooked) {
    const s = slots[i];
    const weekend = s.day === "sam" || s.day === "dim";
    const others = slots.filter((x, j) => j !== i && x.rid && !x.restes).map((x) => BY_ID[x.rid]);
    const cands = pool.filter((r) => !used.has(r.id) && (r.m <= maxWk || weekend) && mealCost(r, base * (s.mult || 1), p, homeIds) < cost * 0.85);
    if (!cands.length) continue;
    const r = pick(cands, ctx, others);
    if (!r) continue;
    s.rid = r.id;
    return true;
  }
  return false;
}
function swap(p, week, idx, reason, opts) {
  opts = opts || {};
  const slots = week.slots.map((s) => ({ ...s }));
  const s = slots[idx];
  if (!s || s.restes) return null;
  const prep = week.prep || {};
  const ctx = makeContext(p, { ...opts, start: new Date(week.startDate), prep });
  const [maxWk] = TIME[p.style] || TIME.simple;
  const base = eqOf(p) / 4;
  const homeIds = homeSet(prep.home);
  const cur = BY_ID[s.rid];
  const curCost = mealCost(cur, base * (s.mult || 1), p, homeIds);
  const weekend = s.day === "sam" || s.day === "dim";
  const used = new Set(slots.filter((x) => x.rid).map((x) => x.rid));
  const pool = poolFor(p, ctx.taste).filter((r) => !used.has(r.id) && r.id !== cur.id && (r.m <= maxWk || weekend));
  const rs = norm(reason || "");
  const FILTERS = {
    "moins cher": (r) => mealCost(r, base * (s.mult || 1), p, homeIds) < curCost * 0.85,
    "trop long": (r) => r.m <= Math.min(cur.m - 5, maxWk),
    "plus leger": (r) => r.k <= cur.k - 60,
    "plus copieux": (r) => r.k >= cur.k + 60
  };
  let cands = pool;
  if (FILTERS[rs]) cands = pool.filter(FILTERS[rs]);
  else if (rs && rs !== "pas envie") {
    const want = terms(reason);
    const kw = (r) => want.some((t) => {
      const st = stem(t);
      if (/poisson/.test(st)) return r.flags.has("f") || r.flags.has("c");
      if (/viande/.test(st)) return isMeat(r);
      if (/vege/.test(st)) return !isMeat(r) && !r.flags.has("f") && !r.flags.has("c");
      if (/rapide/.test(st)) return r.m <= 25;
      if (/leger/.test(st)) return r.t.includes("leger");
      if (/soupe|veloute/.test(st)) return /soupe|veloute/.test(r.text);
      return hasWords(r.text, t);
    });
    cands = pool.filter(kw);
  }
  if (!cands.length) cands = pool;
  if (!cands.length) return null;
  const others = slots.filter((x, j) => j !== idx && x.rid && !x.restes).map((x) => BY_ID[x.rid]);
  const r = pick(cands, ctx, others);
  s.rid = r.id;
  const next = assemble(p, slots, prep);
  return { ...week, ...next, slots, warning: "" };
}
function fixBudget(p, week, opts) {
  const slots = week.slots.map((s) => ({ ...s }));
  const prep = week.prep || {};
  const ctx = makeContext(p, { ...(opts || {}), start: new Date(week.startDate), prep });
  const pool = poolFor(p, ctx.taste);
  let next = assemble(p, slots, prep);
  const budget = Number(p.budget) || 0;
  for (let guard = 0; budget && next.spend > budget && guard < 30; guard++) {
    if (!replaceMostExpensive(p, slots, prep, ctx, pool)) break;
    next = assemble(p, slots, prep);
  }
  const warning = budget && next.spend > budget + 0.5 ? `Impossible de descendre sous ${budget} € avec ces réponses : le minimum trouvé est d’environ ${fmtNum(next.spend)} €.` : "";
  return { ...week, ...next, slots, warning };
}
/* Shopping list again after a profile change (people, store, breakfast) without changing the meals */
function refresh(p, week) {
  if (!week.slots) return week;
  return { ...week, ...assemble(p, week.slots.map((s) => ({ ...s })), week.prep || {}) };
}

/* Budget suggestion from real plans: typical cost, cheapest reachable, and a comfortable margin */
function suggest(p) {
  const totals = [11, 22, 33].map((seed) => plan({ ...p, budget: 0 }, { seed, start: new Date() }).spend).sort((a, b) => a - b);
  const typical = totals[1];
  const cheapest = fixBudget({ ...p, budget: 1 }, { ...plan({ ...p, budget: 0 }, { seed: 44, start: new Date() }), startDate: new Date().toISOString().slice(0, 10), prep: {} }, { seed: 55 }).spend;
  const r5 = (n) => Math.max(10, Math.round(n / 5) * 5);
  return { tight: r5(Math.max(cheapest, typical * 0.8)), advised: r5(typical), comfy: r5(typical * 1.25) };
}

const engine = { plan, swap, fixBudget, refresh, suggest, poolFor, RECIPES, AISLES, eqOf, slotsFor };
if (typeof module !== "undefined" && module.exports) module.exports = engine;
else root.RC_ENGINE = engine;
})(typeof window !== "undefined" ? window : globalThis);
