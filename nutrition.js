/* Garvis – Tab „Ernährung“ (Zusatzmodul, wird von app.js nachgeladen).
   Programme: off | S (Fueling-Ampel, kein Tracking) | M (Schnell-Check) | L (vollständiges Tracking).
   - Empfehlung: window.TODAY.nutrition (vom Planungslauf; ohne Feld zeigt die App einen Hinweis).
   - Einstellung: settings.json › "nutrition" im Repo garvis-data (andere Schlüssel bleiben unverändert).
   - Eingaben (M/L): logs/nutrition/YYYY-MM-DD.json, Lebensmittel: logs/nutrition/foods.json.
     Jede Eingabe landet zuerst in einer Warteschlange (localStorage) und wird dann per GitHub Contents API
     geschrieben (Datei lesen → Änderungen anwenden → mit sha zurückschreiben; bei 409/422 neu laden, erneut).
   - Open Food Facts: Suche (cgi/search.pl) und Barcode (/api/v2/product/{code}), Nährwerte pro 100 g → Portion.
   Lokal (file://): Anzeige ja, Speichern aus. */
(() => {
const A = window.GarvisApp;
if (!A || window.GarvisNutrition) return;
window.GarvisNutrition = true;
const { esc, nf, IC, t, readLocal, writeLocal } = A.util;
const info = (title, html, label) => A.util.infoBtn ? A.util.infoBtn(title, html, label) : "";   // Info-Symbol statt Aufklapp-Bereich
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY = 86400000;
const OFF = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,product_name_de,generic_name_de,brands,quantity,serving_quantity,nutriments,categories_tags";
const LOG_DIR = "logs/nutrition";
const FOODS_PATH = `${LOG_DIR}/foods.json`;
const fileUrl = p => `${A.API}/repos/${A.DATA_REPO}/contents/${p}`;
const SETTINGS_URL = fileUrl("settings.json");
const QKEY = "garvis.nutri.queue", FKEY = p => "garvis.nutri.file." + p;
const web = () => !!(window.GARVIS && window.GARVIS.web);
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const localIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = s => { if (s == null || s === "") return null; const v = parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")); return isFinite(v) ? v : null; };
const dec = v => v == null ? "" : String(v).replace(".", ",");
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const isRange = a => Array.isArray(a) && a.length === 2 && a.every(x => typeof x === "number");
const rng = (a, d = 0) => isRange(a) ? (a[0] === a[1] ? nf(a[0], d) : `${nf(a[0], d)}–${nf(a[1], d)}`) : typeof a === "number" ? nf(a, d) : "–";
const lo = a => isRange(a) ? a[0] : typeof a === "number" ? a : null;
const hi = a => isRange(a) ? a[1] : typeof a === "number" ? a : null;
const liters = ml => nf(ml / 1000, ml % 1000 === 0 ? 0 : 1);
const litersR = a => isRange(a) ? `${liters(a[0])}–${liters(a[1])}` : typeof a === "number" ? liters(a) : "–";
const shortDay = iso => { const dt = new Date(t(iso)); return `${WD[(dt.getUTCDay() + 6) % 7]} ${dt.getUTCDate()}.${dt.getUTCMonth() + 1}.`; };
const dayLabel = iso => {
  const d = Math.round((t(localIso()) - t(iso)) / DAY), dt = new Date(t(iso));
  const base = `${WD[(dt.getUTCDay() + 6) % 7]}, ${dt.getUTCDate()}. ${MONTHS[dt.getUTCMonth()]}`;
  return d === 0 ? `Heute · ${base}` : d === 1 ? `Gestern · ${base}` : base;
};

// ---------- Symbole (gleicher Stil wie app.js) ----------
const svgI = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const NI = {
  apple: svgI('<path d="M12 7.5c-1.6-1.2-5.2-1.6-6.6 1.4-1.3 2.8-.4 7 1.6 9.6 1.4 1.8 3 2 5 1 2 1 3.6.8 5-1 2-2.6 2.9-6.8 1.6-9.6-1.4-3-5-2.6-6.6-1.4z"/><path d="M12 7.5c0-2 1-3.6 3-4.5"/>'),
  drop: svgI('<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>'),
  scale: svgI('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0l-2.2 2.6"/>'),
  barcode: svgI('<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/>'),
  star: svgI('<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/>'),
  search: svgI('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  trash: svgI('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  close: svgI('<path d="M6 6l12 12M18 6L6 18"/>'),
  left: svgI('<path d="M15 5l-7 7 7 7"/>'),
  right: svgI('<path d="M9 5l7 7-7 7"/>'),
  camera: svgI('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  bowl: svgI('<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0zM8 7.5c0-1 1-1.5 1-2.5M12 7.5c0-1 1-1.5 1-2.5M16 7.5c0-1 1-1.5 1-2.5"/>'),
  pause: svgI('<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>'),
  sync: svgI('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>'),
};

// ---------- Programme & Stammdaten ----------
const PROGS = [
  { k: "off", n: "Aus", short: "Keine Ernährungstipps", d: "Garvis zeigt keine Ernährungsempfehlung an." },
  { k: "S", n: "S · Fueling-Ampel", short: "Gerichte-Vorschläge, nichts eintragen", d: "Jeden Tag eine Ampel (Kohlenhydrate niedrig, mittel oder hoch) und für jede Mahlzeit ein passendes Gericht – vor, während und nach der Einheit, im Dienst und vor dem Schlafen. Täglich neue Ideen, „Warum?“ zum Aufklappen. Ohne Zahlen, ohne Tracking." },
  { k: "M", n: "M · Schnell-Check", short: "1–3 Antippen am Tag", d: "Wie S. Dazu ein kurzer Check (Fueling umgesetzt? Protein-Mahlzeiten? Magen-Darm?), Trinken per Knopf, Gewicht vor/nach dem Training für deine Schweißrate und einmal pro Woche ein Energie-Check." },
  { k: "L", n: "L · Tracking", short: "Mahlzeiten schnell erfassen", d: "Wie M, dazu Grammzahlen und alle Mahlzeiten: Barcode mit der Kamera scannen, Vorschlag mit einem Tipp eintragen, „Meine“ mit Favoriten und Häufigem, „Wie gestern“, gemerkte Portionen. Garvis zeigt nur Mindestmengen – nie ein Kalorien-Defizit. Jederzeit pausierbar." },
];
const PROG = Object.fromEntries(PROGS.map(p => [p.k, p]));
const AVOID = [["laktose", "Laktose"], ["milch", "Milcheiweiß"], ["gluten", "Gluten"], ["nuss", "Nüsse"], ["erdnuss", "Erdnuss"], ["ei", "Ei"], ["soja", "Soja"],
  ["fisch", "Fisch"], ["meeresfruechte", "Meeresfrüchte"], ["sesam", "Sesam"], ["sellerie", "Sellerie"], ["senf", "Senf"], ["huelsenfruechte", "Hülsenfrüchte"],
  ["schwein", "Schwein"], ["rind", "Rind"], ["gefluegel", "Geflügel"], ["alkohol", "Alkohol (Kochen)"]];
const DIETS = [{ k: "omnivore", n: "Mischkost" }, { k: "pescetarian", n: "Pescetarisch" }, { k: "vegetarian", n: "Vegetarisch" }, { k: "vegan", n: "Vegan" }];
const MEALS = [
  { k: "fruehstueck", n: "Frühstück" }, { k: "mittag", n: "Mittag" }, { k: "abend", n: "Abend" },
  { k: "snack", n: "Snack" }, { k: "training", n: "Training" }, { k: "nacht", n: "Nachtdienst" },
];
const MEAL = Object.fromEntries(MEALS.map(m => [m.k, m]));
// ---------- Dienste: Nachtdienst/24-h-Dienst gehört bis Dienstende zum Vortag ----------
// Quellen: TODAY.nutrition.shifts (Kalender + App-Status, vom Planungslauf), TODAY.status und settings.status (lokal, aktueller)
const NIGHT_END = "07:30";   // wie nutrition.py NIGHT_END / H24_START, wenn nur das Datum bekannt ist
const statusList = k => [((window.TODAY && window.TODAY.status) || {})[k], ((readLocal(A.util.SET_KEY) || {}).status || {})[k]]
  .flatMap(x => Array.isArray(x) ? x.filter(v => typeof v === "string") : []);
const planShifts = () => { const n = window.TODAY && window.TODAY.nutrition; return Array.isArray(n && n.shifts) ? n.shifts.filter(s => s && s.start && s.end) : []; };
const isNightKind = k => k === "nacht" || k === "24h";
// laufender Dienst, der gestern begann → {day: Dienst-Tag, end: Date} (sonst null)
function shiftCarry(now = new Date()) {
  const y = localIso(new Date(now.getTime() - DAY));
  const s = planShifts().find(x => isNightKind(x.kind) && String(x.start).slice(0, 10) === y && now < new Date(x.end));
  if (s) return { day: y, end: new Date(s.end) };
  const end = new Date(`${localIso(now)}T${NIGHT_END}`);
  return (statusList("night_shifts").includes(y) || statusList("shifts_24h").includes(y)) && now < end ? { day: y, end } : null;
}
// „Ernährungstag“: nachts nach Dienstbeginn zählt alles zum Dienst-Tag (Einträge um 02:00 landen nicht im neuen Tag)
const nutriToday = () => { const c = shiftCarry(); return c ? c.day : localIso(); };
const shiftDay = d => statusList("night_shifts").includes(d) || statusList("shifts_24h").includes(d) || planShifts().some(x => isNightKind(x.kind) && String(x.start).slice(0, 10) === d);
const onNightShift = (now = new Date()) => { const h = now.getHours() + now.getMinutes() / 60;
  return !!shiftCarry(now) || (h >= 21 && shiftDay(localIso(now))); };
const defaultMeal = () => { if (onNightShift()) return "nacht"; const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 10.5 ? "fruehstueck" : h < 14.5 ? "mittag" : h < 17.5 ? "snack" : "abend"; };
const mealsFor = (d, entries, cur) => MEALS.filter(m => m.k !== "nacht" || cur === "nacht" || shiftDay(d) || (entries || []).some(e => e.meal === "nacht"));
const CLASS = {
  niedrig: { i: 0, w: "Kohlenhydrate niedrig", d: "Ruhetag oder lockere Einheit: normale Mahlzeiten, Gemüse und Eiweiß im Vordergrund – kein extra Fueling nötig." },
  mittel: { i: 1, w: "Kohlenhydrate mittel", d: "Moderate Belastung: zu jeder Mahlzeit eine Portion Kohlenhydrate, rund um die Einheit etwas mehr." },
  hoch: { i: 2, w: "Kohlenhydrate hoch", d: "Harte oder lange Einheit: Kohlenhydrate gezielt vorher, währenddessen und danach – Speicher füllen und schnell auffüllen." },
};
const GAUGE = ["var(--q3)", "var(--q4)", "var(--q6)"];  // geordnet → eine Farbrampe (hell & dunkel validiert, s. app.js)
const CHECKS = {
  fueling: { n: "Fueling umgesetzt?", opts: [["ja", "Ja"], ["teilweise", "Teilweise"], ["nein", "Nein"]] },
  protein_meals: { n: "Protein-Mahlzeiten", opts: [[0, "0"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]] },
  gi_issues: { n: "Magen-Darm-Probleme?", opts: [["keine", "Keine"], ["leicht", "Leicht"], ["deutlich", "Deutlich"]] },
};
const DISCLAIMER = "Allgemeine Orientierung für gesunde Sportlerinnen und Sportler – keine medizinische Beratung. Bei Vorerkrankungen, Unverträglichkeiten, Essstörungen oder unklaren Beschwerden bitte ärztlich bzw. ernährungsfachlich beraten lassen.";

// ---------- Einstellung (settings.json › nutrition) ----------
const settingsNutri = () => ((readLocal(A.util.SET_KEY) || {}).nutrition) || null;
function program() {
  const s = settingsNutri(), N = window.TODAY && window.TODAY.nutrition;
  const p = s && PROG[s.program] ? s.program : N && PROG[N.program] ? N.program : "off";
  return p;
}
const paused = () => { const s = settingsNutri(); return !!(s && s.paused); };
// gespeichert, aber der Planungslauf kennt es noch nicht
function pendingProgram() {
  const s = settingsNutri(), T = window.TODAY, N = T && T.nutrition;
  if (!s || !s.program || !s.updated) return false;
  const gen = T && T.generated ? Date.parse(T.generated.replace(" ", "T")) : 0;
  return Date.parse(s.updated) > gen && (N ? N.program !== s.program : s.program !== "off");
}
const NS = { loading: false, loaded: false, saving: false, msg: null };
async function saveNutri(patch) {
  // mit Offline-Puffer (actions.js): sofort lokal gespeichert, gesendet sobald Netz da ist
  const GA = window.GarvisActions;
  if (GA && GA.saveSettings) {
    const res = await GA.saveSettings({ kind: "set", key: "nutrition", merge: true, value: { ...patch, updated: new Date().toISOString() } });
    if (res === "ok") return { ok: true };
    if (res === "queued") return { ok: true, queued: true };
    if (res === "local") return { ok: false, status: -1 };
    return { ok: true, queued: true, kept: true, r: res && res.r };   // nicht verloren – bleibt im Puffer, Hinweis „Schlüssel prüfen“ erscheint
  }
  for (let i = 0; i < 3; i++) {
    const st = await A.fetchSettings();
    if (!st.ok) return st.r;
    if (st.broken) return { status: -2 };
    const data = st.data || {};
    const next = { ...data, nutrition: { ...(data.nutrition || {}), ...patch, updated: new Date().toISOString() } };
    const r = await A.gh(SETTINGS_URL, { method: "PUT", body: JSON.stringify({ message: "Garvis: Ernährung", content: A.utf8b64(JSON.stringify(next, null, 2) + "\n"), ...(st.sha ? { sha: st.sha } : {}) }) });
    if (r.status === 409 || r.status === 422) continue;  // inzwischen geändert → neu laden, erneut
    if (r.ok) writeLocal(A.util.SET_KEY, next);
    return r;
  }
  return { status: 409 };
}
const saveErr = r => r.status === -2 ? "settings.json im Repo ist kein gültiges JSON – bitte erst unter Ziel &amp; Fokus speichern oder die Datei reparieren."
  : (r.status === 403 && !r.rl) || r.status === 404 ? esc(A.WRITE_HELP) : esc(A.errText(r, "Speichern"));
async function refreshSettings() {
  if (!web() || NS.loaded || NS.loading) return;
  NS.loading = true;
  const r = await A.fetchSettings();
  NS.loading = false;
  if (r.ok) { NS.loaded = true; if (!r.data) localStorage.removeItem(A.util.SET_KEY); rerender(); }
}

// ---------- Dateien & Warteschlange ----------
const queue = () => readLocal(QKEY) || [];
const setQueue = q => writeLocal(QKEY, q);
const cacheOf = p => readLocal(FKEY(p));
const setCache = (p, data, sha) => writeLocal(FKEY(p), { data, sha, at: Date.now() });
const emptyDay = d => ({ date: d, entries: [], water_ml: 0, checks: { fueling: null, protein_meals: null, gi_issues: null },
  body: { weight_kg_pre: null, weight_kg_post: null, session_min: null, drank_ml: null } });
const dayPath = d => `${LOG_DIR}/${d}.json`;
function normDay(o, d) {
  const e = emptyDay(d);
  if (!o || typeof o !== "object") return e;
  return { ...e, ...o, date: o.date || d, entries: Array.isArray(o.entries) ? o.entries : [], water_ml: +o.water_ml || 0, fuel: Array.isArray(o.fuel) ? o.fuel : [],
    checks: { ...e.checks, ...(o.checks || {}) }, body: { ...e.body, ...(o.body || {}) } };
}
const normFoods = o => ({ ...(o && typeof o === "object" ? o : {}), foods: o && Array.isArray(o.foods) ? o.foods : [] });
function applyOp(data, op) {
  if (op.path === FOODS_PATH) {
    const f = data.foods;
    const i = op.k === "unfood" ? -1 : f.findIndex(x => x.id === op.v.id);
    if (op.k === "food") { if (i >= 0) f[i] = { ...f[i], ...op.v }; else f.push(op.v); }
    else if (op.k === "unfood") { const j = f.findIndex(x => x.id === op.v); if (j >= 0) f.splice(j, 1); }
    else if (op.k === "use") {
      const mu = op.v.meal ? { [op.v.meal]: 1 } : {}, old = i >= 0 ? f[i] : null;
      const meal_uses = { ...((old && old.meal_uses) || {}) }; Object.keys(mu).forEach(m => { meal_uses[m] = (meal_uses[m] || 0) + 1; });
      const v = { ...op.v }; delete v.meal;
      if (old) f[i] = { ...old, ...v, favorite: old.favorite || !!v.favorite, custom: old.custom || !!v.custom, uses: (old.uses || 0) + 1, meal_uses };
      else f.push({ ...v, uses: 1, meal_uses });
    }
    // aufräumen: Favoriten + eigene behalten, sonst die 80 zuletzt verwendeten
    const keep = f.filter(x => x.favorite || x.custom), rest = f.filter(x => !x.favorite && !x.custom).sort((a, b) => String(b.last_used || "").localeCompare(String(a.last_used || "")));
    data.foods = keep.concat(rest.slice(0, 80));
    return data;
  }
  if (op.k === "water") data.water_ml = Math.max(0, Math.round((data.water_ml || 0) + op.v));
  else if (op.k === "check") data.checks = { ...data.checks, ...op.v };
  else if (op.k === "body") data.body = { ...data.body, ...op.v };
  else if (op.k === "put") { const i = data.entries.findIndex(e => e.id === op.v.id); if (i >= 0) data.entries[i] = op.v; else data.entries.push(op.v); }
  else if (op.k === "del") data.entries = data.entries.filter(e => e.id !== op.v);
  else if (op.k === "fuel") data.fuel = (data.fuel || []).concat([op.v]);
  else if (op.k === "unfuel") data.fuel = (data.fuel || []).filter(x => x.id !== op.v);
  return data;
}
const norm = (p, o) => p === FOODS_PATH ? normFoods(o) : normDay(o, p.slice(LOG_DIR.length + 1, -5));
const clone = o => JSON.parse(JSON.stringify(o));
// Ansicht = letzter Stand aus dem Repo + noch nicht übertragene Eingaben
function view(p) {
  const c = cacheOf(p);
  return queue().filter(o => o.path === p).reduce((d, o) => applyOp(d, o), norm(p, c ? clone(c.data) : null));
}
const SY = { busy: false, err: null, timer: null, loading: {}, tried: {}, again: false };
function addOp(path, k, v) {
  const q = queue(); q.push({ id: uid(), path, k, v, ts: Date.now() }); setQueue(q);
  rerender();
  clearTimeout(SY.timer); SY.timer = setTimeout(flush, 900);  // mehrere Antipper → ein Schreibvorgang
}
async function getFile(p) {
  const r = await A.gh(fileUrl(p));
  if (r.status === 200 && r.body && r.body.sha) {
    if (r.body.content == null || r.body.content === "") return { ok: true, data: null, sha: r.body.sha };
    try { return { ok: true, data: JSON.parse(A.b64utf8(r.body.content)), sha: r.body.sha }; }
    catch (e) { return { ok: true, data: null, sha: r.body.sha, broken: true }; }
  }
  if (r.status === 404) return { ok: true, data: null, sha: null };
  return { ok: false, r };
}
async function flush() {
  if (!web()) return;
  if (SY.busy) { SY.again = true; return; }
  if (!queue().length) return;
  SY.busy = true; SY.err = null; renderSync();
  try {
    const paths = [...new Set(queue().map(o => o.path))];
    for (const p of paths) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const ops = queue().filter(o => o.path === p);
        if (!ops.length) break;
        const cur = await getFile(p);
        if (!cur.ok) { SY.err = cur.r; return; }
        const data = ops.reduce((d, o) => applyOp(d, o), norm(p, cur.data));
        if (p !== FOODS_PATH) data.updated = new Date().toISOString();
        const r = await A.gh(fileUrl(p), { method: "PUT", body: JSON.stringify({
          message: `Garvis: Ernährung ${p === FOODS_PATH ? "Lebensmittel" : p.slice(LOG_DIR.length + 1, -5)}`,
          content: A.utf8b64(JSON.stringify(data, null, 1) + "\n"), ...(cur.sha ? { sha: cur.sha } : {}) }) });
        if (r.ok) {
          const done = new Set(ops.map(o => o.id));
          setQueue(queue().filter(o => !done.has(o.id)));
          setCache(p, data, r.body && r.body.content && r.body.content.sha);
          break;
        }
        if (r.status === 409 || r.status === 422) continue;  // Datei inzwischen geändert → neu laden und erneut anwenden
        SY.err = r; return;
      }
    }
  } finally {
    SY.busy = false;
    rerender();
    if (SY.again) { SY.again = false; setTimeout(flush, 300); }
  }
}
async function load(p, maxAge = 60000) {
  if (!web() || SY.loading[p]) return;
  const c = cacheOf(p);
  if (c && Date.now() - c.at < maxAge) return;
  if (queue().some(o => o.path === p)) return SY.busy || SY.err ? undefined : flush();  // flush lädt ohnehin frisch
  if (Date.now() - (SY.tried[p] || 0) < 20000) return;  // nach Fehler nicht in Schleife neu laden
  SY.loading[p] = true; SY.tried[p] = Date.now();
  const r = await getFile(p);
  SY.loading[p] = false;
  if (r.ok) { setCache(p, r.data, r.sha); SY.err = null; }
  else if (!c) SY.err = r.r;
  rerender();
}
addEventListener("online", () => flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });

// ---------- Open Food Facts ----------
async function offGet(url) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status };
    return { status: 200, body: await res.json() };
  } catch (e) { return { status: 0 }; } finally { clearTimeout(to); }
}
const firstBrand = b => (Array.isArray(b) ? b[0] : String(b || "").split(",")[0] || "").trim();
function offFood(p) {
  if (!p) return null;
  const n = p.nutriments || {}, g = k => n[k] == null || n[k] === "" || isNaN(+n[k]) ? null : +n[k];
  const kj = g("energy-kj_100g") ?? (n.energy_unit === "kJ" || n.energy_unit == null ? g("energy_100g") : null);
  const kcal = g("energy-kcal_100g") ?? (kj != null ? kj / 4.184 : null);
  const code = String(p.code || "");
  return {
    id: "off:" + code, barcode: code, name: (p.product_name_de || p.product_name || p.generic_name_de || "").trim() || `Produkt ${code}`,
    brand: firstBrand(p.brands), quantity: p.quantity || "",
    per100: { kcal: kcal != null ? Math.round(kcal) : null, carbs_g: r1(g("carbohydrates_100g")), protein_g: r1(g("proteins_100g")), fat_g: r1(g("fat_100g")), fiber_g: r1(g("fiber_100g")),
      ...(g("caffeine_100g") ? { caffeine_mg: Math.round(g("caffeine_100g") * (g("caffeine_100g") < 1 ? 1000 : 1)) } : {}) },
    serving_g: +p.serving_quantity > 0 ? +p.serving_quantity : null,
    // Getränke (Open-Food-Facts-Kategorie „beverages“): Nährwerte gelten dort je 100 ml → Eingabe in ml, zählt zum Trinken
    ...(offDrink(p) ? { unit: "ml", density: 1, density_src: "Angaben je 100 ml (≈ 1 g/ml)", drink: true } : {}),
  };
}
function offDrink(p) {
  const t = (p.categories_tags || []).map(String);
  return t.includes("en:beverages") && !t.some(x => /spirits|liqueurs|distilled/.test(x));
}
const offSearch = q => offGet(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&lc=de&fields=${OFF_FIELDS}`);
const offProduct = code => offGet(`${OFF}/api/v2/product/${encodeURIComponent(code)}?lc=de&fields=${OFF_FIELDS}`);
const offErr = s => s === 0 ? "Open Food Facts nicht erreichbar – offline? Schnell-Erfassung oder eigene Lebensmittel gehen trotzdem."
  : s === 429 || s === 503 ? "Open Food Facts ist gerade ausgelastet – in einer Minute erneut versuchen." : `Open Food Facts meldet Fehler ${s}.`;
const gtinOk = c => { if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false; const d = c.split("").map(Number), chk = d.pop(); const s = d.reverse().reduce((a, x, i) => a + x * (i % 2 ? 1 : 3), 0); return (10 - s % 10) % 10 === chk; };

// ---------- Grundnahrungsmittel (generic_foods.json: USDA FoodData Central, gemeinfrei · Frida/DTU, CC BY 4.0) ----------
const GF = { list: null, loading: null, sources: {} };
const norm_ = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").trim();
function loadGeneric() {
  if (GF.list || GF.loading) return GF.loading;
  const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  GF.loading = Promise.all([get("generic_foods.json"), get("dishes.json")]).then(([d, g]) => {
    if (!d && !g) throw new Error("keine Daten");
    GF.sources = { ...((d && d.sources) || {}), ...((g && g.sources) || {}) };
    const prep = f => ({ ...f, brand: "", quantity: "", generic: true, serving_g: (f.portions || [])[0] && f.portions[0].n !== "100 g" ? f.portions[0].g : null,
      _k: [f.name, ...(f.aliases || [])].map(norm_) });
    GF.list = ((d && d.foods) || []).map(prep).concat(((g && g.dishes) || []).map(f => prep({ ...f, dish: true, group: "Gerichte",
      ...(DRINK_DISH.test(f.name || "") && !/kuchen|torte|creme|pudding|eis\b/i.test(f.name || "") ? { unit: "ml", density: 1, density_src: "≈ 1 g/ml", drink: true } : {}) })));
    if (SH.open && !SH.food) renderSheet();
  }).catch(() => { GF.loading = null; });
  return GF.loading;
}
// Treffer: Wortanfang zuerst, dann enthalten; „150 Banane“ / „2x Apfel“ funktionieren über parseShort
function genericSearch(q, n = 12) {
  if (!GF.list || !q) return [];
  const k = norm_(q); if (k.length < 2) return [];
  const sc = f => Math.min(...f._k.map(x => x === k ? 0 : x.startsWith(k) ? 1 : x.split(" ").some(w => w.startsWith(k)) ? 2 : x.includes(k) ? 3 : 9));
  return GF.list.map(f => [sc(f), f]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, n).map(x => x[1]);
}
const genericById = id => (GF.list || []).find(f => f.id === id);

// Flüssigkeiten: Eingabe in ml, intern Gramm (Dichte aus der Quelle bzw. ≈ 1 g/ml)
const isMl = f => !!(f && f.unit === "ml" && f.density > 0);
const toMl = (f, g) => g == null ? null : Math.round(g / f.density);
// Getränk = Flüssigkeit aus Getränke/Milch (ohne Spirituosen, Sahne, Öl, Essig) → zählt zum Trinken
const DRINK_DISH = /kaffee|cappuccino|latte|espresso|kakao|trinkschokolade|smoothie|saft|schorle|\btee\b|eistee|shake|milchmix|lassi|limonade|cola|bier|wein|sekt/i;
// Getränk → zählt zum Trinken: Getränke/Milch aus dem Katalog, gescannte Getränke (Open Food Facts), Getränke-Gerichte (Kaffee-, Kakao-, Saftgetränke)
const isDrink = f => !!f && !/spirituosen|schnaps|likör|sahne\b|schlagsahne/i.test(f.name || "") &&
  (f.drink || (isMl(f) && ["Getränke", "Milch & Milchprodukte"].includes(f.group)) || (f.dish && DRINK_DISH.test(f.name || "")));
const amtTxt = (f, g) => isMl(f) ? `${nf(toMl(f, g))} ml` : `${nf(g)} g`;
// Portion aus Nährwerten pro 100 g
function portion(food, g) {
  const p = food.per100 || {}, f = g / 100, v = k => p[k] == null ? null : r1(p[k] * f);
  return { kcal: p.kcal == null ? null : Math.round(p.kcal * f), carbs_g: v("carbs_g"), protein_g: v("protein_g"), fat_g: v("fat_g"), fiber_g: v("fiber_g"),
    ...(p.caffeine_mg ? { caffeine_mg: Math.round(p.caffeine_mg * f) } : {}) };
}
const KEYS = ["kcal", "carbs_g", "protein_g", "fat_g", "fiber_g"];
const totals = entries => Object.fromEntries(KEYS.map(k => [k, entries.reduce((s, e) => s + (+e[k] || 0), 0)]));
const macroLine = e => [e.carbs_g != null && `KH ${nf(e.carbs_g)}`, e.protein_g != null && `P ${nf(e.protein_g)}`, e.fat_g != null && `F ${nf(e.fat_g)}`].filter(Boolean).join(" · ");

// ---------- Zustand der Ansicht ----------
const ST = { day: nutriToday(), auto: true, progOpen: false, open: {}, pending: false };   // auto: folgt dem aktuellen Tag
const N = () => (window.TODAY && window.TODAY.nutrition) || null;
// Ziele: für den Tag der Empfehlung – und für „heute“ auch, wenn der Planungslauf noch vom Vortag stammt (dann mit „Plan vom …“),
// damit Ampel-Karte, Trinken und Tagesübersicht nie widersprüchlich sind
const planDate = () => (window.TODAY && window.TODAY.date) || null;
const targetsFor = d => { const n = N(), pd = planDate(); return n && n.targets && pd && (pd === d || (pd < d && d === nutriToday())) ? n.targets : null; };
const staleFor = d => { const pd = planDate(); return !!(targetsFor(d) && pd !== d); };
const planFrom = () => shortDay(planDate());
const canSave = () => web();
const disabledAttr = () => canSave() ? "" : " disabled";
const LOCAL_HINT = `<div class="hint">${IC.info}<span>Lokal geöffnet (Datei) – Anzeige ja, Speichern nur in der Garvis-App auf dem iPhone bzw. im Browser.</span></div>`;

// ---------- Bausteine ----------
function gauge(cls) {
  const c = CLASS[cls]; if (!c) return "";
  return `<div class="nu-gauge" role="img" aria-label="Tagesklasse: ${esc(c.w)}">
    ${["niedrig", "mittel", "hoch"].map((k, i) => `<div class="${i <= c.i ? "on" : ""}${i === c.i ? " cur" : ""}" style="--c:${GAUGE[i]}"><i></i><span>${k}</span></div>`).join("")}</div>`;
}
function targetStats(T, compact) {
  if (!T) return "";
  const prot = T.protein_g != null ? `<div class="nu-st"><div class="fl">Protein</div><div class="v">${isRange(T.protein_g) ? rng(T.protein_g) : "≥ " + nf(T.protein_g)}<small>g</small></div>${T.protein_meals ? `<div class="foot">${esc(T.protein_meals)}× 20–40 g verteilt</div>` : ""}</div>` : "";
  const items = [
    T.carbs_g != null && `<div class="nu-st"><div class="fl">Kohlenhydrate</div><div class="v">${rng(T.carbs_g)}<small>g</small></div></div>`,
    prot,
    T.water_ml != null && `<div class="nu-st"><div class="fl">Trinken</div><div class="v">${litersR(T.water_ml)}<small>l</small></div><div class="foot">plus während der Einheit</div></div>`,
    !compact && T.fat_g != null && `<div class="nu-st"><div class="fl">Fett</div><div class="v">${rng(T.fat_g)}<small>g</small></div></div>`,
    !compact && T.kcal != null && `<div class="nu-st"><div class="fl">Energie</div><div class="v${rng(T.kcal).length > 7 ? " sm" : ""}">${rng(T.kcal)}<small>kcal</small></div></div>`,
  ].filter(Boolean);
  return `<div class="nu-stats">${items.join("")}</div>`;
}
// S/M: statt Grammzahlen nur Trinken als Zahl (Liter versteht jeder) – den Rest zeigen die Gerichte
function waterStat(T) {
  if (!T || T.water_ml == null) return "";
  return `<div class="nu-stats"><div class="nu-st"><div class="fl">Trinken</div><div class="v">${litersR(T.water_ml)}<small>l</small></div><div class="foot">plus während der Einheit</div></div>
    <div class="nu-st"><div class="fl">Eiweiß</div><div class="v">${esc(T.protein_meals || 4)}<small>×</small></div><div class="foot">pro Tag eine Portion zu jeder Mahlzeit</div></div></div>`;
}
function sessionLine(S) {
  if (!S) return "";
  const parts = [isRange(S.carbs_g_h) ? `<b>${rng(S.carbs_g_h)} g</b> KH/h` : S.carbs_g_h ? `<b>${nf(S.carbs_g_h)} g</b> KH/h` : "keine Kohlenhydrate nötig",
    S.fluid_ml_h != null && `<b>${rng(S.fluid_ml_h)} ml</b>/h trinken`, S.sodium_mg_h != null && `<b>${rng(S.sodium_mg_h)} mg</b> Natrium/h`].filter(Boolean);
  return parts.join(" · ");
}
const hasRec = n => !!(n && CLASS[n.day_class]);
function ampelCard(n, P) {
  if (!hasRec(n)) {
    return `<article class="card nu-ampel"><div class="kicker">Heute</div>
      <div class="nu-title">Noch keine Empfehlung</div>
      <p class="note">${P === "off" ? "" : pendingProgram() ? "Dein Programm ist gespeichert – die erste Empfehlung entsteht beim nächsten Planungslauf (spätestens morgen früh)." : "Die Empfehlung entsteht beim nächsten Planungslauf. Bis dahin: normal essen, rund um harte Einheiten etwas mehr Kohlenhydrate."}</p></article>`;
  }
  const c = CLASS[n.day_class] || CLASS.mittel;
  const R = window.TODAY && window.TODAY.recommendation;
  const other = window.TODAY.date !== localIso();
  return `<article class="card nu-ampel">
    <div class="kicker">${other ? `Empfehlung vom ${esc(dayLabel(window.TODAY.date).replace(/^(Heute|Gestern) · /, ""))}` : "Heute"}${R && R.title && R.level !== "rest" ? ` · ${esc(R.title)}` : R && R.level === "rest" ? " · Ruhetag" : ""}</div>
    <div class="nu-title">${esc(c.w)}${info("Warum diese Empfehlung?", `${n.why_class ? `<p>${esc(n.why_class)}</p>` : ""}
      ${(n.basis || []).length ? `<p><b>Worauf das beruht</b></p><ul>${n.basis.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      <p class="nu-disc">${esc(n.disclaimer || DISCLAIMER)}</p>`)}</div>
    ${gauge(n.day_class)}
    <p class="note">${esc(c.d)}</p>
    ${P === "L" ? targetStats(n.targets) : waterStat(n.targets)}
    ${(n.shift_tips || []).length ? `<div class="subhead">Tipps für heute</div><ul class="why nu-tips">${n.shift_tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  </article>`;
}
function timelineCard(n) {
  if (!hasRec(n) || (!(n.timeline || []).length && !n.session)) return "";
  const S = n.session;
  const src = Object.values(n.sources || {});
  return `<article class="card"><h3 class="chead">${IC.clock}Rund um die Einheit${src.length ? info("Quellen", `<ul>${src.map(v => `<li>${esc(v)}</li>`).join("")}</ul>`, "Quellen der Empfehlungen") : ""}</h3>
    ${S ? `<div class="nu-sess"><div class="kicker">Während der Einheit</div><div class="nu-sl">${sessionLine(S)}</div>
      ${(S.examples || []).length ? `<ul class="nu-ex">${S.examples.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${fuelBox(n)}</div>` : ""}
    ${(n.timeline || []).length ? `<ol class="nu-tl">${n.timeline.map((x, i) => tlItem(n, x, i)).join("")}</ol>` : ""}
  </article>`;
}
// ---------- Meal-Prep (Sa/So) ----------
function prepCard(n) {
  const P_ = n && n.meal_prep; if (!P_ || !(P_.meals || []).length) return "";
  const ms = P_.meals.filter(okMeal); if (!ms.length) return "";
  return `<article class="card"><h3 class="chead">${NI.bowl}Meal-Prep für die Woche</h3>
    <p class="desc">${esc(P_.text)}</p>
    ${ms.map((m, i) => `<details class="more nu-hx" data-k="mp${i}"${ST.open["mp" + i] ? " open" : ""}><summary>${esc(m.name.replace(/^Meal-Prep:\s*/, ""))} <span class="nu-tag">${m.servings} Boxen · ${m.keeps_days} Tage</span></summary>
      <p class="note"><b>Einkauf &amp; Kochen:</b> ${esc(m.batch || "")}</p>
      <p class="note"><b>Pro Box:</b> ${esc(m.portion || "")} · ≈ ${nf(m.carb_g)} g KH, ${nf(m.protein_g)} g Eiweiß, ${nf(m.kcal)} kcal</p>
      ${m.storage ? `<p class="note"><b>Lagern:</b> ${esc(m.storage)}</p>` : ""}
      ${m.swap ? `<p class="note"><b>Tausch-Tipp:</b> ${esc(m.swap)}</p>` : ""}
      <p class="note">${esc(m.why || "")}</p></details>`).join("")}
    ${P_.src ? `<p class="nu-src">${esc(String(P_.src).split("(")[0].trim())}</p>` : ""}</article>`;
}
// ---------- Wettkampf-Ernährung & Darmtraining ----------
function raceCard(n) {
  if (!n || (!n.race && !n.gut_training)) return "";
  const R = n.race, gt = n.gut_training;
  return `<article class="card"><h3 class="chead">${IC.bolt}${esc(R ? R.title : "Darmtraining")}${R && R.race ? `<span class="r muted" style="font-size:12px">${esc(R.race)}</span>` : ""}</h3>
    ${R ? `<ul class="why">${(R.items || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>${R.src ? `<p class="nu-src">Quellen: ${esc(R.src)}</p>` : ""}` : ""}
    ${gt ? `<div class="hint" style="margin-top:10px">${IC.trend}<span><b>Darmtraining Woche ${gt.week} von ${gt.weeks}:</b> in langen Einheiten jetzt ${gt.rate_g_h} g Kohlenhydrate pro Stunde, Ziel fürs Rennen ${gt.target_g_h} g/h. Nach jeder langen Einheit im Schnell-Check „Magen-Darm“ antippen – ohne Beschwerden geht es nächste Woche +10 g/h weiter, bei deutlichen Beschwerden eine Stufe zurück (Jeukendrup 2017).</span></div>` : ""}
  </article>`;
}
// ---------- Nährstoffe & Nahrungsergänzung (Inhalte: nutrients.json, supplements.json – öffentlich, nicht persönlich) ----------
const HC = { data: null, loading: false, err: false };
async function loadHealth() {
  if (HC.data || HC.loading) return;
  HC.loading = true;
  try {
    const [a, b] = await Promise.all(["nutrients.json", "supplements.json"].map(u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(r.status))));
    HC.data = { nut: a, sup: b };
  } catch (e) { HC.err = true; }
  HC.loading = false; rerender();
}
function healthCard(n) {
  if (!n || !n.health_flags) return "";
  if (!HC.data) { if (ST.open.health) loadHealth(); }
  const fl = new Set(n.health_flags), m = new Date().getMonth() + 1, w = (n.body && n.body.weight_kg) || 70, today = new Set(n.supp_today || []);
  let body = `<p class="note" style="font-size:13px">${HC.err ? "Inhalte gerade nicht ladbar – später erneut öffnen." : "Lädt …"}</p>`;
  if (HC.data) {
    const N_ = HC.data.nut, S_ = HC.data.sup, src = { ...(N_.sources || {}), ...(S_.sources || {}) };
    const spec = x => (x.who || []).filter(f => f !== "all" && fl.has(f)).length;
    const nut = (N_.items || []).filter(x => (x.who || []).some(f => fl.has(f)) && (!x.months || x.months.includes(m))).sort((a, b) => spec(b) - spec(a));
    const cite = keys => (keys || []).map(k => src[k]).filter(Boolean).map(c => String(c).split(/[.(]/)[0].trim()).join("; ");
    // Belege: Zitat + Link zur Quelle (alle Angaben am 07.11.2026 gegen die Originalquellen geprüft)
    const refs = x => (x.refs || []).length ? ` · Belege (${x.refs.length})` + info(`Belege: ${x.name}`, `<ul>${x.refs.map(r => `<li>${esc(r.claim || "")}: „${esc(r.quote || "")}“ – ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.cite || "Quelle")}</a>` : esc(r.cite || "")}</li>`).join("")}</ul>`) : "";
    const nutHtml = nut.map(x => `<details class="more nu-hx"><summary>${esc(x.name)}${spec(x) ? ` <span class="nu-tag">für dich</span>` : ""}</summary>
      <p class="note">${esc(x.why)}</p>
      ${(x.food || []).length ? `<p class="note"><b>Lebensmittel:</b> ${esc(x.food.join(", "))}</p>` : ""}
      ${x.lab ? `<p class="note"><b>Labor:</b> ${esc(x.lab.test)} – ${esc(x.lab.when)}${x.lab.targets ? ` · ${esc(x.lab.targets)}` : ""}</p>` : ""}
      ${x.supplement ? `<p class="note"><b>Ergänzen:</b> ${esc(x.supplement)}</p>` : ""}
      <p class="nu-src">${esc(cite(x.src))}${x.verified ? ` · geprüft ${esc(x.verified.split("-").reverse().join("."))}` : ""}${refs(x)}</p></details>`).join("");
    const amt = mg => mg >= 1000 ? `${nf(Math.round(mg / 100) / 10, 1)} g` : `${nf(Math.round(mg / 10) * 10)} mg`;
    const dose = x => x.dose_mg_kg ? ` <b>Für dich (${nf(w, 0)} kg): ≈ ${amt(x.dose_mg_kg * w)}${x.dose_mg_kg_basis ? ` (${esc(x.dose_mg_kg_basis)})` : ""}.</b>` : "";
    const supRow = x => `<details class="more nu-hx"><summary><span class="nu-ev ev-${esc(x.evidence)}">${esc(x.evidence)}</span>${esc(x.name)}${(x.use_when || []).some(u => today.has(u)) ? ` <span class="nu-tag">heute</span>` : ""}</summary>
      <p class="note">${esc(x.effect)}</p>${x.dose ? `<p class="note"><b>Dosis:</b> ${esc(x.dose)}${dose(x)}</p>` : ""}
      ${x.caution ? `<p class="note"><b>Achtung:</b> ${esc(x.caution)}</p>` : ""}<p class="nu-src">${esc(cite(x.src))}${x.verified ? ` · geprüft ${esc(x.verified.split("-").reverse().join("."))}` : ""}${refs(x)}</p></details>`;
    const sup = (S_.items || []).slice().sort((a, b) => String(a.evidence).localeCompare(String(b.evidence)));
    const now = sup.filter(x => (x.use_when || []).some(u => today.has(u)) && !(x.use_when || []).includes("never_default"));
    body = `<div class="subhead">Nährstoffe</div><p class="note" style="font-size:12.5px">Ohne Tracking – worauf du bei deinem Training, der Jahreszeit${fl.has("night_shift") ? ", den Diensten" : ""} und deiner Ernährung achten solltest. Ergänzen nur nach Laborwert.</p>${nutHtml}
      <div class="subhead">Nahrungsergänzung</div><p class="note" style="font-size:12.5px">${esc(S_.note || "")}</p>
      ${now.length ? `<p class="note" style="font-size:12.5px"><b>Heute ggf. sinnvoll:</b> ${esc(now.map(x => x.name).join(", "))}</p>` : ""}
      <p class="note" style="font-size:12px">Evidenz: <b>A</b> gut belegt (in bestimmten Situationen) · <b>B</b> neue/gemischte Daten · <b>C</b> kaum belegt – nach AIS-Gruppen bzw. IOC-Konsens 2018; jede Angabe mit Beleg und Link</p>
      ${sup.map(supRow).join("")}`;
  }
  return `<article class="card"><details class="more" data-k="health"${ST.open.health ? " open" : ""}><summary><span class="chead" style="margin:0">${IC.info}Nährstoffe &amp; Nahrungsergänzung</span></summary>${body}</details></article>`;
}
// Gewählte Alternative pro Tag und Eintrag (lokal) – „Andere Idee“ blättert durch die Vorschläge
const PICK = "garvis.nutri.pick";
const pickOf = (d, i) => ((readLocal(PICK) || {})[d] || {})[i] || 0;
function setPick(d, i, v) { const o = readLocal(PICK) || {}; Object.keys(o).forEach(k => { if (k < localIso(new Date(Date.now() - 3 * DAY))) delete o[k]; }); (o[d] = o[d] || {})[i] = v; writeLocal(PICK, o); }
const SLOT_MEAL = { fruehstueck: "fruehstueck", mittag: "mittag", abend: "abend", snack: "snack", pre: null, pre_short: "training", during: "training", recovery: "training", night_shift: "nacht", pre_sleep: "snack" };
const prefs = () => { const s_ = settingsNutri() || {}; return { avoid: s_.avoid || [], dislikes: s_.dislikes || [], likes: s_.likes || [] }; };
// bereits abgelehnte Gerichte (oder neue Unverträglichkeiten) sofort ausblenden – der nächste Planungslauf ersetzt sie
const okMeal = m => { const p_ = prefs(); return !p_.dislikes.includes(m.id) && !(m.contains || []).some(c => p_.avoid.includes(c)); };
function tlItem(n, x, i) {
  const M = (x.meals || []).filter(okMeal), d = window.TODAY && window.TODAY.date || localIso();
  if (!M.length) return `<li><span class="tm">${esc(x.time || "")}</span><div><b>${esc(x.label || "")}</b><p>${esc(x.text || "")}</p></div></li>`;
  const k = pickOf(d, i) % M.length, m = M[k], P = program();
  const can = P === "L" && !paused() && canSave() && (d === localIso() || d === nutriToday());
  return `<li><span class="tm">${esc(x.time || "")}</span><div class="nu-dish"><b>${esc(x.label || "")}</b>
    <div class="nu-dn">${esc(m.name)}${info("Warum dieses Gericht?", `      ${m.swap ? `<p class=""><b>Tausch-Tipp:</b> ${esc(m.swap)}</p>` : ""}
      <p class="">${esc(m.why || "")}${m.src && n.sources && n.sources[m.src] ? ` <span class="muted">(${esc(String(n.sources[m.src]).split(/[.(]/)[0].trim())})</span>` : ""}</p>
      <p class="nu-num">${esc(x.text || "")}${m.carb_g != null ? ` · Dieses Gericht: ≈ ${nf(m.carb_g)} g Kohlenhydrate, ${nf(m.protein_g)} g Eiweiß, ${nf(m.kcal)} kcal${n.body && n.body.weight_kg ? ` – Portion auf dein Gewicht (${nf(n.body.weight_kg, 1)} kg) umgerechnet` : ""}` : ""}</p>`, "Warum: " + m.name)}</div>
    ${m.portion ? `<p class="nu-dp">${esc(m.portion)}${m.prep_min ? ` · ${m.prep_min <= 5 ? "schnell" : `≈ ${m.prep_min} min`}` : ""}</p>` : ""}
    <div class="nu-da">${M.length > 1 ? `<button type="button" class="txtbtn" data-act="alt" data-i="${i}" data-n="${M.length}">Andere Idee <small>${k + 1}/${M.length}</small></button>` : ""}
      ${can ? (ST.logsug === i ? [0.5, 1, 1.5, 2].map(f => `<button type="button" class="txtbtn" data-act="logsugx" data-i="${i}" data-f="${f}">${dec(f)} ×</button>`).join("")
        : `<button type="button" class="txtbtn" data-act="logsug" data-i="${i}">${IC.plus}Eintragen</button>`) : ""}
      ${canSave() ? `<button type="button" class="txtbtn nu-thumb" data-act="like" data-id="${esc(m.id)}" aria-pressed="${prefs().likes.includes(m.id)}" aria-label="Mag ich – öfter vorschlagen">👍</button>
        <button type="button" class="txtbtn nu-thumb" data-act="dislike" data-id="${esc(m.id)}" aria-label="Nicht mehr vorschlagen">👎</button>` : ""}</div>
    </div></li>`;
}
// Fortschritt gegen Ziel: eine Farbe, Zielspanne als Band, Mindestmengen betont – keine roten Strafen
function bar(label, val, target, unit, opts = {}) {
  const l = lo(target), h = hi(target), d = opts.d || 0;
  const max = Math.max(h != null ? h * 1.15 : 0, val * 1.05, l != null ? l * 1.2 : 0, 1);
  const pct = v => Math.max(0, Math.min(100, v / max * 100));
  const reached = l != null && val >= l;
  const fmt = opts.fmt || (v => nf(v, d));
  const tgtTxt = target == null ? "" : opts.min ? `mind. ${fmt(l)}` : isRange(target) ? `${fmt(l)}–${fmt(h)}` : fmt(l);
  let state = "";
  if (target != null) {
    if (reached && opts.min) state = `<span class="nu-ok">${IC.check}${opts.min === "soft" ? "erreicht" : "Minimum erreicht"}</span>`;
    else if (reached && h != null && val > h) state = `<span class="muted">über der Spanne</span>`;
    else if (reached) state = `<span class="nu-ok">${IC.check}im Zielbereich</span>`;
    else if (opts.min) state = `<span class="muted">noch ${fmt(l - val)} ${unit}</span>`;
  }
  return `<div class="nu-bar">
    <div class="nu-bl"><b>${esc(label)}</b><span class="nu-bv"><b>${fmt(val)}</b>${tgtTxt ? ` / ${tgtTxt}` : ""} ${unit}</span></div>
    ${target == null ? "" : `<div class="nu-trk" role="img" aria-label="${esc(label)}: ${fmt(val)} ${unit}${tgtTxt ? ` von ${tgtTxt} ${unit}` : ""}">
      ${l != null ? `<i class="band" style="left:${pct(l)}%;width:${Math.max(0, (h != null ? pct(h) : 100) - pct(l))}%"></i><i class="tick" style="left:${pct(l)}%"></i>` : ""}
      <i class="fill" style="width:${pct(val)}%"></i></div>`}
    ${state ? `<div class="nu-bs">${state}</div>` : ""}</div>`;
}
function syncLine() {
  if (!canSave()) return "";
  const q = queue().length;
  if (SY.busy) return `<span class="nu-sync">${NI.sync}Speichere …</span>`;
  if (SY.err && q) {
    const e = SY.err, net = e.status === 0;
    return `<span class="nu-sync">${NI.sync}${net ? `${q} ${q === 1 ? "Eingabe wartet" : "Eingaben warten"} auf Verbindung – wird automatisch übertragen`
      : (e.status === 403 && !e.rl) || e.status === 404 ? esc(A.WRITE_HELP) : esc(A.errText(e, "Speichern"))}
      <button type="button" class="nu-link" data-act="retry">Jetzt senden</button></span>`;
  }
  if (q) return `<span class="nu-sync">${NI.sync}${q} ${q === 1 ? "Eingabe" : "Eingaben"} noch nicht übertragen</span>`;
  return SY.err ? `<span class="nu-sync">${esc(A.errText(SY.err, "Laden"))}</span>` : `<span class="nu-sync ok">${IC.check}Gespeichert</span>`;
}
const renderSync = () => { const h = syncLine(); document.querySelectorAll(".nu-syncbox").forEach(n => { if (n.__gh !== h) { n.innerHTML = h; n.__gh = h; } }); };
function dayNav() {
  const today = localIso(), isToday = ST.day >= today;
  return `<div class="nu-daynav"><button type="button" class="iconbtn" data-act="dprev" aria-label="Vorheriger Tag">${NI.left}</button>
    <b>${esc(dayLabel(ST.day))}</b>
    <button type="button" class="iconbtn" data-act="dnext" aria-label="Nächster Tag"${isToday ? " disabled" : ""}>${NI.right}</button>
    <span class="nu-syncbox">${syncLine()}</span></div>`;
}
// Werte des Tages: Log-Datei (mit Warteschlange) – lokal/ohne Datei: Stand des Planungslaufs
function dayData() {
  const p = dayPath(ST.day), haveFile = !!cacheOf(p) || queue().some(o => o.path === p);
  const d = view(p);
  const tr = N() && N().tracking, trToday = tr && tr.today && window.TODAY.date === ST.day ? tr.today : null;
  if (!haveFile && trToday) {
    return { day: d, sums: { kcal: +trToday.kcal || 0, carbs_g: +trToday.carbs_g || 0, protein_g: +trToday.protein_g || 0, fat_g: +trToday.fat_g || 0, fiber_g: +trToday.fiber_g || 0 },
      water: +trToday.water_ml || 0, fromPlan: true };
  }
  const drinks = d.entries.reduce((a, e) => a + (+e.drink_ml || 0), 0);
  const gw = trToday && +trToday.water_garmin_ml || 0, app = (d.water_ml || 0) + drinks;
  return { day: d, sums: totals(d.entries), water: Math.max(app, gw), waterParts: { tap: d.water_ml || 0, drinks, garmin: gw }, fromPlan: false };
}
function waterCard(D, T) {
  const tgt = T && T.water_ml;
  return `<article class="card"><h3 class="chead">${NI.drop}Trinken</h3>
    <div class="nu-water"><div class="hero-v nu-wv">${liters(D.water)}<small>l</small></div>
      <div class="sec">${tgt != null ? `Ziel ${litersR(tgt)} l${staleFor(ST.day) ? ` <span class="muted">(Plan vom ${esc(planFrom())})</span>` : ""}` : "Für diesen Tag ist kein Ziel gespeichert"}<br><span class="muted">${D.waterParts && (D.waterParts.drinks || D.waterParts.garmin) ? [D.waterParts.tap ? `Wasser ${liters(D.waterParts.tap)} l` : "", D.waterParts.drinks ? `Getränke ${liters(D.waterParts.drinks)} l` : "", D.waterParts.garmin ? `Garmin ${liters(D.waterParts.garmin)} l` : ""].filter(Boolean).join(" · ") : "ohne Getränke während der Einheit"}</span></div></div>
    ${tgt != null ? bar("Getrunken", D.water / 1000, isRange(tgt) ? [tgt[0] / 1000, tgt[1] / 1000] : tgt / 1000, "l", { min: true, fmt: v => nf(v, 1) }).replace(/<div class="nu-bl">.*?<\/div>/, "") : ""}
    <div class="nu-btns">
      <button type="button" class="btn nu-add" data-act="water" data-v="250"${disabledAttr()}>+250 ml</button>
      <button type="button" class="btn nu-add" data-act="water" data-v="500"${disabledAttr()}>+500 ml</button>
      <button type="button" class="txtbtn" data-act="water" data-v="-250"${disabledAttr()}${D.water <= 0 ? " disabled" : ""} aria-label="250 ml zurücknehmen">−250</button>
    </div></article>`;
}
// Wochen-Check Energie (IOC REDs CAT2): freiwillig, alle 7 Tage, nur heute
const REDS = [["fatigue", "Anhaltend müde"], ["performance", "Leistung stagniert/sinkt"], ["illness", "Häufiger krank"], ["injury", "Verletzung/ständig Wehwehchen"],
  ["libido", "Weniger Libido/Morgenerektion"], ["mood", "Schlaf/Stimmung schlechter"], ["weight_loss", "Ungewollt abgenommen"]];
const RS = { sel: [] };
function redsCard(D, n) {
  if (ST.day !== nutriToday() || D.fromPlan) return "";
  const c = D.day.checks || {}, last = n && n.tracking && n.tracking.reds_last;
  if (Array.isArray(c.reds)) return "";
  if (last && (t(localIso()) - t(last)) / DAY < 7) return "";
  return `<article class="card"><h3 class="chead">${IC.info}Wochen-Check Energie</h3>
    <p class="desc">Einmal pro Woche: Trifft in den letzten 2 Wochen etwas davon zu? Mehrere Punkte zusammen können heißen, dass du zu wenig isst für dein Training (REDs).</p>
    <div class="nu-chips" role="group" aria-label="Wochen-Check">${REDS.map(([k, l]) => `<button type="button" data-act="reds" data-k="${k}" aria-pressed="${RS.sel.includes(k)}"${disabledAttr()}>${l}</button>`).join("")}</div>
    <div class="formfoot" style="margin-top:12px"><button type="button" class="btn" data-act="redssave"${disabledAttr()}>${RS.sel.length ? "Speichern" : "Nichts davon"}</button>
      <span class="muted">Bleibt privat in deinem Repo.</span></div></article>`;
}
function checkCard(D, n, P) {
  const c = D.day.checks || {};
  const keys = P === "L" ? ["fueling", "gi_issues"] : ["fueling", "protein_meals", "gi_issues"];
  const goalMeals = n && n.targets && n.targets.protein_meals;
  return `<article class="card"><h3 class="chead">${IC.check}Schnell-Check</h3>
    <p class="desc">Einmal am Abend antippen – Garvis lernt daraus${P === "L" ? ". Protein-Mahlzeiten zählt die App aus deinen Einträgen." : "."}</p>
    ${keys.map(k => `<div class="nu-q"><span class="kicker">${esc(CHECKS[k].n)}${k === "protein_meals" && goalMeals ? ` <i>Ziel ${esc(goalMeals)}</i>` : ""}</span>
      <div class="nu-chips${k === "protein_meals" ? " num" : ""}" role="group" aria-label="${esc(CHECKS[k].n)}">${CHECKS[k].opts.map(([v, l]) => `<button type="button" data-act="check" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}"${disabledAttr()}>${l}</button>`).join("")}</div></div>`).join("")}
    ${P === "M" && N() && N().session && isRange(N().session.carbs_g_h) ? `<p class="note" style="font-size:13px">Fueling heute: ${sessionLine(N().session)}</p>` : ""}
  </article>`;
}
function bodyCard(D, P) {
  const b = D.day.body || {}, s = settingsNutri() || {}, tr = N() && N().tracking;
  const R = window.TODAY && window.TODAY.recommendation;
  const mins = b.session_min ?? (R && R.level !== "rest" && window.TODAY.date === ST.day ? R.duration : null);
  let calc = "";
  if (b.weight_kg_pre && b.weight_kg_post && mins) {
    const loss = b.weight_kg_pre - b.weight_kg_post, sweat = Math.round((loss * 1000 + (+b.drank_ml || 0)) / (mins / 60)), pctLoss = loss / b.weight_kg_pre * 100;
    calc = `<div class="nu-calc"><div class="nu-st"><div class="fl">Schweißrate</div><div class="v">${nf(Math.max(0, sweat))}<small>ml/h</small></div></div>
      <div class="nu-st"><div class="fl">Gewichtsverlust</div><div class="v">${nf(Math.max(0, pctLoss), 1)}<small>%</small></div><div class="foot">${nf(loss, 1)} kg</div></div>
      ${pctLoss > 2 ? `<div class="hint" style="grid-column:1/-1;margin-top:0">${IC.info}<span>Mehr als 2 % verloren – beim nächsten Mal während der Einheit etwas mehr trinken.</span></div>` : ""}
      ${sweat > 0 && canSave() ? `<button type="button" class="txtbtn" data-act="usesweat" data-v="${sweat}" style="grid-column:1/-1;justify-self:start">${s.sweat_rate_ml_h === sweat ? "Als Schweißrate übernommen" : "Als meine Schweißrate übernehmen"}</button>` : ""}</div>`;
  }
  const known = s.sweat_rate_ml_h || (tr && tr.sweat_rate_ml_h);
  return `<article class="card"><details class="nu-body" data-k="body"${ST.open.body ?? (b.weight_kg_pre || b.weight_kg_post) ? " open" : ""}><summary><h3 class="chead">${NI.scale}Gewicht vor/nach dem Training</h3>
    <span class="desc">Für deine Schweißrate${known ? ` · bisher ${nf(known)} ml/h` : ""}</span></summary>
    <form class="nu-form" data-form="body">
      <div class="frow">
        <label class="field"><span class="kicker">Vorher (kg)</span><input name="weight_kg_pre" inputmode="decimal" autocomplete="off" value="${dec(b.weight_kg_pre)}" placeholder="z. B. 71,4"${disabledAttr()}></label>
        <label class="field"><span class="kicker">Nachher (kg)</span><input name="weight_kg_post" inputmode="decimal" autocomplete="off" value="${dec(b.weight_kg_post)}" placeholder="z. B. 70,6"${disabledAttr()}></label>
        <label class="field"><span class="kicker">Dauer (min)</span><input name="session_min" inputmode="numeric" autocomplete="off" value="${mins ?? ""}"${disabledAttr()}></label>
        <label class="field"><span class="kicker">Getrunken (ml)</span><input name="drank_ml" inputmode="numeric" autocomplete="off" value="${b.drank_ml ?? ""}" placeholder="0"${disabledAttr()}></label>
      </div>
      <p class="note" style="font-size:12.5px">Ohne Kleidung bzw. trocken wiegen, vor dem Training nach dem Toilettengang.</p>
      <div class="formfoot" style="margin-top:10px"><button type="submit" class="btn"${disabledAttr()}>Speichern</button></div>
    </form>${calc}</details></article>`;
}
// ---------- 6: Verpflegung während des Trainings (M/L) → erreichte g/h fürs Darmtraining ----------
const FUEL = [["gel", "Gel", 25], ["drink30", "500 ml Sportgetränk 6 %", 30], ["drink60", "750 ml Sportgetränk 8 %", 60], ["bar", "Riegel", 40], ["banana", "Banane", 25], ["chews", "3 Fruchtgummis/Chews", 25]];
function fuelBox(n) {
  const S = n && n.session, P = program();
  if (!S || ST.day !== nutriToday() || !canSave() || !(P === "M" || P === "L") || (P === "L" && paused())) return "";
  const D = view(dayPath(ST.day)), F = D.fuel || [], tot = F.reduce((a, x) => a + (+x.carbs_g || 0), 0);
  const h = (S.duration || 60) / 60, rate = Math.round(tot / h), gt = n.gut_training;
  const tgt = gt ? gt.rate_g_h : isRange(S.carbs_g_h) ? S.carbs_g_h[1] : null;
  return `<div class="nu-fuel"><div class="kicker">Im Training genommen</div>
    <div class="nu-fuelsum"><b>${nf(tot)} g</b> KH${tot ? ` · ≈ ${nf(rate)} g/h bei ${nf(S.duration)} min` : ""}${tgt ? ` <span class="muted">· Ziel ${nf(tgt)} g/h</span>` : ""}</div>
    <div class="nu-chips">${FUEL.map(([k, l, g]) => `<button type="button" data-act="fuel" data-k="${k}">+ ${esc(l)} <small>${g} g</small></button>`).join("")}</div>
    ${F.length ? `<p class="note" style="font-size:12.5px;margin:6px 0 0">${F.map(x => `${esc(x.name)} ${esc(x.time || "")}`).join(" · ")} <button type="button" class="txtbtn" data-act="unfuel">Letztes entfernen</button></p>` : ""}
  </div>`;
}
// ---------- 5: Live-Bilanz vor dem Training (L) – angepasst an das, was du schon gegessen hast ----------
function liveCard(D, n, T) {
  const S = n && n.session;
  if (!S || S.done || !S.start || ST.day !== nutriToday() || !T || !isRange(T.carbs_g)) return "";
  const now = nowHM(); if (now >= S.start) return "";
  const w = (n.body && n.body.weight_kg) || 70, mins = hmMin(S.start) - hmMin(now);
  const from = minHm(hmMin(S.start) - 240);   // 1–4 h vorher zählen als Vor-Mahlzeit (Thomas 2016)
  const pre = D.day.entries.filter(e => String(e.time || "") >= from).reduce((a, e) => a + (+e.carbs_g || 0), 0);
  const need = S.duration >= 60 ? [Math.round(w), Math.round(2 * w)] : [20, 40];   // 1–2 g/kg bzw. kleiner Snack
  const left = Math.max(0, need[0] - pre), dayLeft = Math.max(0, T.carbs_g[0] - D.sums.carbs_g);
  const tl = n.timeline || [], i = tl.findIndex(x => (x.slot === "pre" || x.slot === "pre_short") && (x.meals || []).length);
  const cand = i >= 0 ? tl[i].meals.filter(okMeal) : [];
  const pick = left ? cand.slice().sort((a, b) => Math.abs((a.carb_g || 0) - left) - Math.abs((b.carb_g || 0) - left))[0] : null;
  const soon = mins < 60;
  return `<article class="card nu-live"><h3 class="chead">${IC.clock}Bis zur Einheit um ${esc(S.start)}${info("Wie rechnet Garvis?", `<p>Vor einer Einheit ab 60 min sind 1–2 g Kohlenhydrate pro kg in den 1–4 Stunden davor sinnvoll (Thomas 2016, ACSM/AND/DC) – bei dir ≈ ${need[0]}–${need[1]} g. Gezählt wird alles, was du seit ${esc(from)} Uhr eingetragen hast.</p><p>Weniger als 60 min vorher: nur noch leicht Verdauliches (Banane, Toast mit Honig, Gel).</p>`)}</h3>
    <div class="nu-livev"><b>${nf(pre)} g</b> seit ${esc(from)} <span class="muted">· Ziel ${need[0]}–${need[1]} g</span></div>
    ${left ? `<p class="note" style="margin:6px 0 0">Noch ≈ <b style="color:var(--text-primary)">${nf(left)} g</b> ${soon ? "– jetzt nur noch leicht Verdauliches" : `bis ${esc(minHm(hmMin(S.start) - 60))} Uhr`}${pick ? `: z. B. <b style="color:var(--text-primary)">${esc(pick.name)}</b> (≈ ${nf(pick.carb_g)} g)` : ""}.</p>`
      : `<p class="note" style="margin:6px 0 0"><span class="nu-ok">${IC.check}Vor-Mahlzeit erreicht</span> – jetzt nur noch trinken.</p>`}
    <p class="note" style="font-size:12.5px;margin:6px 0 0">Tag: ${nf(D.sums.carbs_g)} von ${rng(T.carbs_g)} g Kohlenhydraten${dayLeft ? ` · noch ≥ ${nf(dayLeft)} g über den Tag` : ""}</p></article>`;
}
const hmMin = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; };
const minHm = m => { m = Math.max(0, Math.min(1439, m)); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
// ---------- 9: Koffein (L): EFSA 2015 – bis 400 mg/Tag und 200 mg je Portion unbedenklich; ~100 mg kurz vor dem Schlafen
// können den Schlaf stören (EFSA 2015); 400 mg selbst 6 h vor dem Schlafen verschlechterten ihn (Drake 2013).
function caffeineLine(D) {
  const es = D.day.entries.filter(e => +e.caffeine_mg > 0), mg = es.reduce((a, e) => a + (+e.caffeine_mg || 0), 0);
  if (!mg) return "";
  const last = es.map(e => String(e.time || "")).sort().at(-1) || "", big = es.some(e => +e.caffeine_mg > 200);
  const shifts = ((N() && N().shifts) || []).map(x => x && x.kind);
  const night = shifts.includes("nacht") || shifts.includes("24h");
  const tip = mg > 400 ? "über 400 mg – mehr als die EFSA für Erwachsene pro Tag als unbedenklich ansieht"
    : big ? "eine Portion über 200 mg – EFSA: bis 200 mg je Portion unbedenklich"
    : night ? "Nachtdienst: Koffein nur in der ersten Dienst-Hälfte"
    : last >= "14:00" ? `zuletzt ${last} Uhr – mit Abstand von 6 h und mehr zum Schlafen schläfst du meist besser` : "";
  return `<p class="note nu-caf" style="font-size:13px">☕ Koffein heute <b style="color:var(--text-primary)">${nf(mg)} mg</b>${tip ? ` · ${esc(tip)}` : ""}${info("Koffein", `<p>EFSA (2015): Für gesunde Erwachsene sind bis 400 mg pro Tag und bis 200 mg je Einzelportion unbedenklich. Etwa 100 mg kurz vor dem Schlafen können Schlafbeginn und -dauer beeinträchtigen.</p><p>Drake et al. (2013, J Clin Sleep Med): 400 mg Koffein selbst 6 Stunden vor dem Zubettgehen verschlechterten den Schlaf messbar.</p><p>Werte je Getränk aus USDA FoodData Central (Kaffee ≈ 40 mg, Schwarztee ≈ 20 mg, Cola ≈ 9 mg pro 100 ml) bzw. Packungsangabe.</p>`)}</p>`;
}
function summaryCard(D, T) {
  const s = D.sums;
  const meals = MEALS.filter(m => sumProt(D.day.entries, m.k) >= 20).length;
  return `<article class="card"><h3 class="chead">${NI.bowl}Tagesübersicht${D.fromPlan ? `<span class="r muted" style="font-size:12px">Stand Planungslauf</span>` : ""}</h3>
    ${T ? (staleFor(ST.day) ? `<p class="desc">Ziele aus dem Plan vom ${esc(planFrom())}.</p>` : "") : `<p class="desc">Für diesen Tag sind keine Ziele gespeichert – nur deine Summen.</p>`}
    <div class="nu-bars nu-mini">
      ${bar("Kohlenhydrate", s.carbs_g, T && T.carbs_g, "g", { min: "soft" })}
      ${bar("Protein", s.protein_g, T && T.protein_g != null ? (isRange(T.protein_g) ? T.protein_g : T.protein_g) : null, "g", { min: true })}
      ${bar("Energie", s.kcal, T && T.kcal, "kcal")}
      ${bar("Fett", s.fat_g, T && T.fat_g, "g")}
    </div>
    ${D.fromPlan ? "" : caffeineLine(D)}
    ${D.fromPlan ? "" : `<p class="note" style="font-size:13px">Protein-Mahlzeiten (≥ 20 g): <b style="color:var(--text-primary)">${meals}</b>${T && T.protein_meals ? ` von ${esc(T.protein_meals)}` : ""}</p>`}
  </article>`;
}
const sumProt = (entries, meal) => entries.filter(e => e.meal === meal).reduce((a, e) => a + (+e.protein_g || 0), 0);
const prevIso = d => new Date(t(d) - DAY).toISOString().slice(0, 10);
function mealsCard(D) {
  const E = D.day.entries.slice().sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  const Y = !D.fromPlan && canSave() ? view(dayPath(prevIso(ST.day))).entries : [];
  const done = D.day.checks && D.day.checks.complete === "ja";
  return `<article class="card"><h3 class="chead">${IC.list}Mahlzeiten</h3>
    ${D.fromPlan ? `<p class="note">Einzelne Einträge sind nur in der App mit Schlüssel sichtbar.</p>` : ""}
    <div class="nu-meals">${mealsFor(ST.day, E).map(m => {
      const es = E.filter(e => (MEAL[e.meal] ? e.meal : "snack") === m.k), tt = totals(es);
      return `<div class="nu-meal"><div class="nu-mh"><b>${m.n}</b><span class="muted">${es.length ? `${nf(tt.kcal)} kcal · ${macroLine(tt)}` : ""}</span>
        ${!es.length && Y.some(e => (MEAL[e.meal] ? e.meal : "snack") === m.k) ? `<button type="button" class="txtbtn nu-copy" data-act="copy" data-meal="${m.k}"${disabledAttr()}>Wie gestern</button>` : ""}
        ${es.length >= 1 && canSave() && !D.fromPlan ? `<button type="button" class="txtbtn nu-copy" data-act="savemeal" data-meal="${m.k}" aria-label="${m.n} als Mahlzeit oder Rezept speichern">${NI.star}Merken</button>` : ""}
        <button type="button" class="iconbtn nu-plus" data-act="add" data-meal="${m.k}" aria-label="${m.n} hinzufügen"${disabledAttr()}>${IC.plus}</button></div>
        ${es.length ? `<ul class="nu-el">${es.map(e => `<li><button type="button" data-act="edit" data-id="${esc(e.id)}"${disabledAttr()}>
          <span class="nm">${esc(e.name || "Eintrag")}${e.source && String(e.source).startsWith("off:") ? "" : e.source === "favorite" ? ` <span class="nu-fav">${NI.star}</span>` : ""}</span>
          <span class="kc">${e.kcal != null ? nf(e.kcal) : "–"}<small>kcal</small></span>
          <span class="mt">${[e.amount_ml ? `${nf(e.amount_ml)} ml` : e.amount_g ? `${nf(e.amount_g)} g` : "", e.time, macroLine(e)].filter(Boolean).map(esc).join(" · ")}</span></button></li>`).join("")}</ul>` : ""}</div>`;
    }).join("")}</div>
    ${D.fromPlan ? "" : `<div class="nu-done"><button type="button" class="txtbtn nu-donebtn" data-act="check" data-k="complete" data-v="ja" aria-pressed="${done}"${disabledAttr()}>${IC.check}${ST.day === nutriToday() ? "Alles für heute eingetragen" : "Tag vollständig eingetragen"}</button>
      <span class="muted">Damit Garvis weiß, dass die Summe stimmt – sonst zählt ein knapper Tag nur als „vielleicht unvollständig“.</span></div>`}</article>`;
}
// ---------- 13: Wochen-Diagramm (L): Kohlenhydrate je Tag gegen die Zielspanne der Tagesklasse; Eiweiß je Mahlzeit heute ----------
// Eine Reihe → keine Legende (der Titel benennt sie), Zielspanne als graues Band, Werte per Antippen (Tooltip) und als Tabelle darunter.
function carbChart(W) {
  const rows = W.filter(w => w.carbs_target);
  if (!rows.length || !rows.some(w => w.carbs_g)) return "";
  const max = Math.max(...rows.map(w => Math.max(w.carbs_g || 0, w.carbs_target[1] || 0)), 1) * 1.08;
  const pc = v => Math.max(0, Math.min(100, v / max * 100));
  return `<div class="subhead" style="margin-top:6px">Kohlenhydrate je Tag <span class="muted" style="font-weight:400">· Band = Ziel der Tagesklasse</span></div>
    <div class="nu-wchart" role="img" aria-label="Kohlenhydrate der letzten 7 Tage gegen das Tagesziel">${rows.map(w => {
      const [lo_, hi_] = w.carbs_target, v = w.carbs_g;
      return `<div class="nu-wcol" data-tipw="${esc(shortDay(w.date))}|${v == null ? "nicht erfasst" : nf(v) + " g"}|${nf(lo_)}–${nf(hi_)} g|${esc(w.day_class || "")}">
        <i class="bandw" style="bottom:${pc(lo_)}%;height:${pc(hi_) - pc(lo_)}%"></i>
        <i class="val${v == null ? " none" : ""}" style="height:${v == null ? 100 : pc(v)}%"></i></div>`; }).join("")}</div>
    <div class="nu-wlab">${rows.map(w => `<span>${esc(shortDay(w.date).split(" ")[0])}</span>`).join("")}</div>`;
}
function proteinChart(D) {
  if (!D || D.fromPlan) return "";
  const ms = MEALS.filter(m => m.k !== "training").map(m => ({ n: m.n, g: sumProt(D.day.entries, m.k) }));
  if (!ms.some(m => m.g)) return "";
  const max = Math.max(45, ...ms.map(m => m.g)) * 1.08, pc = v => Math.max(0, Math.min(100, v / max * 100));
  return `<div class="subhead" style="margin-top:14px">Eiweiß je Mahlzeit heute <span class="muted" style="font-weight:400">· Band = 20–40 g (Jäger 2017)</span></div>
    <div class="nu-pdist" role="img" aria-label="Eiweiß je Mahlzeit heute">${ms.map(m => `<div class="nu-wcol" data-tipw="${esc(m.n)}|${nf(m.g)} g|20–40 g|">
      <i class="bandw" style="bottom:${pc(20)}%;height:${pc(40) - pc(20)}%"></i><i class="val${m.g ? "" : " none"}" style="height:${m.g ? pc(m.g) : 100}%"></i></div>`).join("")}</div>
    <div class="nu-wlab" style="grid-template-columns:repeat(${ms.length},minmax(0,1fr))">${ms.map(m => `<span>${esc(m.n)}</span>`).join("")}</div>`;
}
function weekCard(tr, D) {
  const W = tr && Array.isArray(tr.week) ? tr.week.filter(w => w && w.date) : [];
  const adh = tr && tr.adherence, warn = (tr && tr.warnings) || [];
  if (!W.length && adh == null && !warn.length) return "";
  const adhTxt = typeof adh === "number" ? `${nf(adh <= 1 ? adh * 100 : adh)} %` : adh && typeof adh === "object" ? Object.entries(adh).map(([k, v]) => `${esc(k)} ${typeof v === "number" ? nf(v <= 1 ? v * 100 : v) + " %" : esc(v)}`).join(" · ") : adh ? esc(adh) : "";
  return `<article class="card"><h3 class="chead">${IC.trend}Letzte Tage</h3>
    ${adhTxt ? `<p class="desc">Umsetzung: <b style="color:var(--text-primary)">${adhTxt}</b></p>` : ""}
    ${program() === "L" ? carbChart(W) + proteinChart(D) : ""}
    ${warn.map(w => `<div class="hint">${IC.info}<span>${esc(w)}</span></div>`).join("")}
    ${W.length ? `<div class="tscroll" style="max-height:none;margin-top:10px"><table><thead><tr><th>Tag</th><th class="n">kcal</th><th class="n">KH g</th><th class="n">Protein g</th><th class="n">Wasser l</th></tr></thead>
      <tbody>${W.map(w => `<tr><td>${esc(shortDay(w.date))}</td><td class="n">${nf(w.kcal)}</td><td class="n">${nf(w.carbs_g)}</td><td class="n">${nf(w.protein_g)}</td><td class="n">${w.water_ml != null ? nf(w.water_ml / 1000, 1) : "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </article>`;
}

// ---------- Programmauswahl (oben im Tab und in Mehr) ----------
function progOpts(name, cur, dis) {
  return `<div class="opts nu-opts">${PROGS.map(p => `<label class="opt"><input type="radio" name="${name}" value="${p.k}"${p.k === cur ? " checked" : ""}${dis ? " disabled" : ""}>
    <b>${p.n}</b><small>${esc(p.short)}</small></label>`).join("")}</div>`;
}
function progBar(P) {
  const p = PROG[P];
  const pend = pendingProgram();
  return `<div class="card nu-prog">
    <div class="nu-pr"><span class="mi">${NI.apple}</span><span><span class="kicker">Programm</span><b>${esc(p.n)}</b><small>${esc(p.short)}</small></span>
      <button type="button" class="txtbtn" data-act="progtoggle" aria-expanded="${ST.progOpen}">${ST.progOpen ? "Fertig" : "Ändern"}</button></div>
    ${ST.progOpen ? `<div class="nu-pick">${progOpts("nuprog", P, !canSave())}<p class="note" style="font-size:13px">${esc(PROG[P].d)}</p>
      <a class="linkrow" href="#mehr/ernaehrungsprogramm" style="margin-top:10px">Gewicht, Ernährungsform &amp; Schweißrate ${IC.chev}</a></div>` : ""}
    ${!canSave() && ST.progOpen ? LOCAL_HINT : ""}
    ${NS.msg ? `<div class="hint ${NS.msg.kind}">${NS.msg.kind === "ok" ? IC.check : IC.warning}<span>${NS.msg.html}</span></div>` : ""}
    ${pend && !NS.msg ? `<div class="hint">${IC.clock}<span><b>Programm gespeichert.</b> Die Empfehlung passt sich beim nächsten Planungslauf an.</span></div>` : ""}
    ${P === "L" && paused() ? `<div class="hint">${NI.pause}<span><b>Tracking pausiert.</b> Du siehst nur die Ampel. <button type="button" class="txtbtn" data-act="pause" data-v="0"${disabledAttr()}>Fortsetzen</button></span></div>` : ""}
  </div>`;
}
async function setProgram(k) {
  if (!canSave() || NS.saving) return;
  NS.saving = true; NS.msg = { kind: "", html: "Speichere …" }; rerender();
  const r = await saveNutri({ program: k });
  NS.saving = false;
  NS.msg = r.ok ? { kind: "ok", html: `<b>${r.queued ? "Offline gespeichert" : "Gespeichert"}: ${esc(PROG[k].n)}.</b>${r.queued ? " Wird gesendet, sobald du wieder Netz hast." : k === "off" ? "" : " Die Empfehlung passt sich beim nächsten Planungslauf an."}` } : { kind: "bad", html: saveErr(r) };
  if (r.ok) ST.progOpen = false;
  rerender();
  setTimeout(() => { if (NS.msg && NS.msg.kind === "ok") { NS.msg = null; rerender(); } }, 6000);
}

// ---------- Tab „Ernährung“ ----------
function renderView() {
  const host = $("v-ernaehrung");
  if (!host) return;
  bindView(host);
  // nicht neu zeichnen, während jemand tippt (sonst gehen Eingabe und Fokus verloren) – danach nachholen
  const ae = document.activeElement;
  if (ae && host.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== "radio") { ST.pending = true; renderSync(); return; }
  ST.pending = false;
  refreshSettings();
  if (ST.auto) ST.day = nutriToday();   // z. B. nach Dienstende um 07:30 oder nach Mitternacht automatisch weiter
  const P = program(), n = N(), track = (P === "M" || P === "L") && !(P === "L" && paused());
  if (track) { load(dayPath(ST.day)); if (P === "L") { load(FOODS_PATH, 300000); load(dayPath(prevIso(ST.day)), 600000); } if (queue().length && !SY.busy && !SY.err) flush(); }
  const T = targetsFor(ST.day), D = track ? dayData() : null;
  // [html, Spalte am Desktop (0 links, 1 rechts), Reihenfolge am iPhone]
  const cards = [];
  if (P !== "off") cards.push([ampelCard(n, P), 0, 1]);
  if (P === "S" || (P === "L" && !track)) cards.push([timelineCard(n), 1, 2]);
  if (track) cards.push([redsCard(D, n), 1, 9]);
  if (P !== "off") cards.push([raceCard(n), 0, 1], [prepCard(n), 1, 19], [healthCard(n), 1, 20]);
  if (P === "M" && track) cards.push([timelineCard(n), 0, 2], [checkCard(D, n, P), 1, 3], [waterCard(D, T), 1, 4], [bodyCard(D, P), 1, 5], [weekCard(n && n.tracking), 1, 6]);
  if (P === "L" && track) cards.push([liveCard(D, n, T), 0, 0], [waterCard(D, T), 0, 1], [mealsCard(D), 0, 2], [summaryCard(D, T), 0, 3], [timelineCard(n), 1, 5],
    [checkCard(D, n, P), 1, 6], [bodyCard(D, P), 1, 7], [weekCard(n && n.tracking, D), 1, 8]);
  const col = c => cards.filter(x => x[0] && x[1] === c).map(x => x[0].replace("<article ", `<article style="order:${x[2]}" `)).join("");
  const right = col(1);
  // Gleicher Inhalt (z. B. Nachladen im Hintergrund ohne Änderung): DOM stehen lassen – kein Flackern, Scroll-/Fokuszustand bleibt
  const html = `<div class="vhead"><div class="eyebrow">${esc(dayLabel(localIso()))}</div><h1>Ernährung</h1>
      <p class="sub">${P === "off" ? "Wähle, wie viel Garvis dich beim Essen und Trinken unterstützen soll." : "Passend zu deinem Training – Richtwerte, keine Vorschriften."}</p></div>
    ${progBar(P)}
    ${P === "off" ? offCard() : ""}
    ${track ? dayNav() : ""}
    ${track && !canSave() ? LOCAL_HINT : ""}
    ${track && P === "L" && canSave() ? `<div class="nu-lbar"><button type="button" class="btn" data-act="add" data-meal="">${IC.plus}Essen hinzufügen</button>
      <button type="button" class="txtbtn" data-act="scan">${NI.barcode}Scannen</button>
      <button type="button" class="txtbtn" data-act="pause" data-v="1">${NI.pause}Tracking pausieren</button></div>` : ""}
    <div class="nu-grid${right ? "" : " one"}"><div class="stack">${col(0)}</div>${right ? `<div class="stack">${right}</div>` : ""}</div>`;
  if (host.__gh === html) return renderSync();
  host.innerHTML = html; host.__gh = html;
}
function offCard() {
  return `<article class="card"><h3 class="chead">${NI.apple}Programme im Überblick</h3>
    <dl class="nu-dl">${PROGS.filter(p => p.k !== "off").map(p => `<dt>${esc(p.n)}</dt><dd>${esc(p.d)}</dd>`).join("")}</dl>
    <p class="note" style="font-size:13px">Empfehlung zum Start: <b style="color:var(--text-primary)">S</b> – wenig Aufwand, größter Nutzen fürs Training. Oben unter „Ändern“ auswählen.</p>
    <p class="note nu-disc">${esc(DISCLAIMER)}</p></article>`;
}
function bindView(host) {
  if (host.dataset.nuBound) return;
  host.dataset.nuBound = "1";
  host.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === "progtoggle") { ST.progOpen = !ST.progOpen; NS.msg = null; rerender(); }
    else if (a === "water") addOp(dayPath(ST.day), "water", +b.dataset.v);
    else if (a === "check") {
      const k = b.dataset.k, raw = b.dataset.v, v = k === "protein_meals" ? +raw : raw;
      const cur = view(dayPath(ST.day)).checks[k];
      const extra = {};
      if (k === "gi_issues" && cur !== v && ST.day === nutriToday()) {   // Vor-Mahlzeit merken → Garvis lernt, was dir vor dem Training nicht bekommt
        const n = N(), tl = (n && n.timeline) || [], i = tl.findIndex(x => (x.slot === "pre" || x.slot === "pre_short") && (x.meals || []).length);
        const ms = i >= 0 ? tl[i].meals.filter(okMeal) : [];
        if (ms.length) extra.pre_meal_id = ms[pickOf(window.TODAY.date, i) % ms.length].id;
      }
      addOp(dayPath(ST.day), "check", { [k]: cur === v ? null : v, ...extra });  // erneut tippen = zurücksetzen
    }
    else if (a === "dprev" || a === "dnext") { ST.day = new Date(t(ST.day) + (a === "dprev" ? -DAY : DAY)).toISOString().slice(0, 10); if (ST.day > localIso()) ST.day = localIso(); ST.auto = ST.day === nutriToday(); rerender(); }
    else if (a === "retry") { SY.err = null; flush(); }
    else if (a === "add") openSheet({ meal: b.dataset.meal || defaultMeal() });
    else if (a === "like" || a === "dislike") {
      const id = b.dataset.id, p_ = prefs(), key = a === "like" ? "likes" : "dislikes", has = p_[key].includes(id);
      const patch = { [key]: has ? p_[key].filter(x => x !== id) : p_[key].concat(id).slice(-200) };
      if (a === "dislike") patch.likes = p_.likes.filter(x => x !== id);
      const s_ = readLocal(A.util.SET_KEY) || {}; writeLocal(A.util.SET_KEY, { ...s_, nutrition: { ...(s_.nutrition || {}), ...patch } });   // sofort sichtbar
      rerender();
      saveNutri(patch).then(r => { if (!r.ok) { NS.msg = { kind: "bad", html: saveErr(r) }; rerender(); } });
      if (a === "dislike" && !has && window.GarvisActions) window.GarvisActions.undo("Wird nicht mehr vorgeschlagen", () => {
        const p2 = prefs(), back = { dislikes: p2.dislikes.filter(x => x !== id) };
        const s2 = readLocal(A.util.SET_KEY) || {}; writeLocal(A.util.SET_KEY, { ...s2, nutrition: { ...(s2.nutrition || {}), ...back } }); rerender(); saveNutri(back);
      });
      else if (a === "like" && !has) A.toast("Merke ich mir – kommt öfter");
    }
    else if (a === "alt") { const d = window.TODAY.date, i = +b.dataset.i; setPick(d, i, (pickOf(d, i) + 1) % +b.dataset.n); rerender(); }
    else if (a === "logsug") { ST.logsug = +b.dataset.i; rerender(); }
    else if (a === "fuel") {
      const it = FUEL.find(x => x[0] === b.dataset.k); if (!it) return;
      const path = dayPath(ST.day), fu = { id: uid(), kind: it[0], name: it[1], carbs_g: it[2], time: nowHM() };
      addOp(path, "fuel", fu);
      let en = null;
      if (program() === "L") { en = { id: uid(), time: fu.time, meal: "training", name: `${it[1]} (Training)`, amount_g: null, kcal: it[2] * 4, carbs_g: it[2], protein_g: 0, fat_g: 0, fiber_g: 0, source: "fuel:" + fu.id }; addOp(path, "put", en); }
      if (window.GarvisActions) window.GarvisActions.undo(`${it[1]} eingetragen (${it[2]} g)`, () => { addOp(path, "unfuel", fu.id); if (en) addOp(path, "del", en.id); });
    }
    else if (a === "unfuel") {
      const path = dayPath(ST.day), F = view(path).fuel || [], last = F.at(-1); if (!last) return;
      addOp(path, "unfuel", last.id);
      const en = view(path).entries.find(e => e.source === "fuel:" + last.id); if (en) addOp(path, "del", en.id);
    }
    else if (a === "logsugx") {
      ST.logsug = null;
      const n = N(), i = +b.dataset.i, x = n && n.timeline && n.timeline[i], fac = +b.dataset.f || 1; if (!x || !x.meals) return;
      const ms = x.meals.filter(okMeal); if (!ms.length) return;
      const m = ms[pickOf(window.TODAY.date, i) % ms.length], path = dayPath(nutriToday());
      const meal = SLOT_MEAL[x.slot] || defaultMeal();
      const sc = v => v == null ? null : Math.round(v * fac);
      const fat = m.kcal != null && m.carb_g != null && m.protein_g != null ? Math.max(0, Math.round((m.kcal - 4 * m.carb_g - 4 * m.protein_g) / 9)) : null;
      const e = { id: uid(), time: nowHM(), meal, name: fac === 1 ? m.name : `${m.name} (${dec(fac)} ×)`, amount_g: null, kcal: sc(m.kcal), carbs_g: sc(m.carb_g), protein_g: sc(m.protein_g),
        fat_g: sc(fat), fiber_g: null, source: "suggestion:" + m.id };
      addOp(path, "put", e);
      if (window.GarvisActions) window.GarvisActions.undo(`„${m.name}“ eingetragen – Werte geschätzt, antippen zum Anpassen`, () => addOp(path, "del", e.id));
    }
    else if (a === "reds") { const k = b.dataset.k; RS.sel = RS.sel.includes(k) ? RS.sel.filter(x => x !== k) : RS.sel.concat(k); rerender(); }
    else if (a === "redssave") { addOp(dayPath(ST.day), "check", { reds: RS.sel.slice() }); RS.sel = []; A.toast("Danke – nächste Woche fragt Garvis wieder"); }
    else if (a === "savemeal") {
      const m = b.dataset.meal, es = view(dayPath(ST.day)).entries.filter(e => (MEAL[e.meal] ? e.meal : "snack") === m);
      if (es.length) openSheet({ meal: m, saveMeal: { meal: m, ids: es.map(e => e.id) } });
    }
    else if (a === "scan") openSheet({ meal: defaultMeal(), tab: "barcode", cam: true });
    else if (a === "copy") {   // Mahlzeit von gestern übernehmen (neue IDs, Uhrzeit jetzt), mit Rückgängig
      const path = dayPath(ST.day), m = b.dataset.meal, now = ST.day === nutriToday() ? nowHM() : null;
      const src = view(dayPath(prevIso(ST.day))).entries.filter(e => (MEAL[e.meal] ? e.meal : "snack") === m);
      const copies = src.map(e => ({ ...e, id: uid(), time: now || e.time, meal: m }));
      copies.forEach(e => addOp(path, "put", e));
      if (window.GarvisActions) window.GarvisActions.undo(`${MEAL[m].n} wie gestern eingetragen (${copies.length})`, () => copies.forEach(e => addOp(path, "del", e.id)));
    }
    else if (a === "edit") { const en = view(dayPath(ST.day)).entries.find(x => x.id === b.dataset.id); if (en) openSheet({ edit: en, meal: MEAL[en.meal] ? en.meal : "snack" }); }
    else if (a === "pause") setPaused(b.dataset.v === "1");
    else if (a === "usesweat") saveNutri({ sweat_rate_ml_h: +b.dataset.v }).then(r => { NS.msg = r.ok ? { kind: "ok", html: `<b>Schweißrate ${nf(+b.dataset.v)} ml/h gespeichert.</b>` } : { kind: "bad", html: saveErr(r) }; rerender(); });
  });
  host.addEventListener("change", e => {
    if (e.target.name === "nuprog" && e.target.checked) setProgram(e.target.value);
  });
  host.addEventListener("pointerover", e => { const c = e.target.closest("[data-tipw]"); if (!c || !A.util.showTip) return;
    const [t_, v, z, k] = c.dataset.tipw.split("|"); A.util.showTip(e, t_, [{ k: "Ist", v }, { k: "Ziel", v: z }, ...(k ? [{ k: "Tagesklasse", v: k }] : [])]); });
  host.addEventListener("pointerdown", e => { const c = e.target.closest("[data-tipw]"); if (!c || !A.util.showTip) return;
    const [t_, v, z, k] = c.dataset.tipw.split("|"); A.util.showTip(e, t_, [{ k: "Ist", v }, { k: "Ziel", v: z }, ...(k ? [{ k: "Tagesklasse", v: k }] : [])]); });
  host.addEventListener("pointerout", e => { if (e.target.closest("[data-tipw]") && A.util.hideTip) A.util.hideTip(); });
  host.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.k) { ST.open[d.dataset.k] = d.open; if (d.dataset.k === "health" && d.open) loadHealth(); } }, true);
  host.addEventListener("focusout", () => { if (ST.pending) setTimeout(() => { if (ST.pending) renderView(); }, 300); });
  host.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]"); if (!f) return;
    e.preventDefault();
    if (f.dataset.form === "body" && canSave()) {
      const v = n => num(f.elements[n].value);
      const body = { weight_kg_pre: r1(v("weight_kg_pre")), weight_kg_post: r1(v("weight_kg_post")), session_min: v("session_min") != null ? Math.round(v("session_min")) : null, drank_ml: v("drank_ml") != null ? Math.round(v("drank_ml")) : null };
      const bad = ["weight_kg_pre", "weight_kg_post"].find(k => body[k] != null && (body[k] < 25 || body[k] > 250));
      if (bad) { f.elements[bad].setAttribute("aria-invalid", "true"); return; }
      addOp(dayPath(ST.day), "body", body);
    }
  });
}
async function setPaused(on) {
  if (!canSave()) return;
  NS.msg = { kind: "", html: "Speichere …" }; rerender();
  const r = await saveNutri({ paused: on });
  NS.msg = r.ok ? { kind: "ok", html: on ? "<b>Tracking pausiert.</b> Ampel und Fueling bleiben sichtbar." : "<b>Tracking läuft wieder.</b>" } : { kind: "bad", html: saveErr(r) };
  rerender();
  setTimeout(() => { if (NS.msg && NS.msg.kind === "ok") { NS.msg = null; rerender(); } }, 5000);
}

// ---------- Erfassen (Programm L): Blatt mit Suche, Barcode, Favoriten, Zuletzt, Eigene, Schnell ----------
const SH = { open: false, tab: "mine", meal: "snack", q: "", results: null, busy: false, err: "", food: null, amount: null, edit: null, code: "", newFood: false, added: [] };
const TABS = [["mine", "Meine"], ["search", "Suchen"], ["barcode", "Scannen"], ["own", "Eigene"], ["quick", "Schnell"]];
// gemerkte Menge: wie zuletzt › Packungsportion › 100 g
const usualG = f => f.last_g || f.serving_g || 100;
// „Meine“: Favoriten zuerst, dann was du zu dieser Mahlzeit oft isst, dann zuletzt verwendet
function mineList(foods, meal) {
  const sc = f => (f.favorite ? 1000 : 0) + 8 * ((f.meal_uses || {})[meal] || 0) + Math.min(f.uses || 0, 20);
  return foods.filter(f => f.favorite || f.last_used).sort((a, b) => sc(b) - sc(a) || String(b.last_used || "").localeCompare(String(a.last_used || ""))).slice(0, 40);
}
function sheetEl() {
  let s = $("nuSheet");
  if (s) return s;
  s = document.createElement("div"); s.id = "nuSheet"; s.className = "nu-sheet"; s.hidden = true;
  s.innerHTML = `<div class="nu-back"></div><div class="nu-panel" role="dialog" aria-modal="true" aria-labelledby="nuShT"><div id="nuShBody"></div></div>`;
  document.body.appendChild(s);
  s.addEventListener("click", sheetClick);
  s.addEventListener("submit", sheetSubmit);
  s.addEventListener("input", sheetInput);
  s.addEventListener("change", e => { const t_ = e.target; if (t_.matches && t_.matches("[data-shphoto]") && t_.files && t_.files[0]) { decodePhoto(t_.files[0]); t_.value = ""; } });
  addEventListener("keydown", e => { if (e.key === "Escape" && SH.open) closeSheet(); });
  return s;
}
function openSheet(o) {
  Object.assign(SH, { open: true, err: "", food: null, amount: null, edit: null, newFood: false, fromList: null, added: [], saveMeal: null }, o);
  if (!o.tab && !o.edit) SH.tab = foodsAll().some(f => f.favorite || f.last_used) ? "mine" : "search";
  if (!o.edit) { load(FOODS_PATH, 300000); loadGeneric(); }
  const s = sheetEl(); s.hidden = false; document.documentElement.classList.add("nu-lock");
  renderSheet();
  if (SH.tab === "barcode" && o.cam) startCam();
  shKey = null;
}
function closeSheet() { SH.open = false; stopCam(); const s = $("nuSheet"); if (s) s.hidden = true; document.documentElement.classList.remove("nu-lock"); }
const foodsAll = () => view(FOODS_PATH).foods;
const foodRow = (f, extra = "", quick = false) => {
  if (f.type === "meal") {
    const per = mealTotals(f);
    return `<li class="nu-q"><button type="button" data-sh="pick" data-id="${esc(f.id)}"><span class="nm">${esc(f.name)} <span class="nu-fav">${NI.star}</span></span>
      <span class="kc">${per.kcal != null ? nf(per.kcal) : "–"}<small>kcal · 1 Portion</small></span>
      <span class="mt">${esc([f.servings > 1 ? "Rezept" : "Mahlzeit", (f.items || []).length + " Zutaten", extra].filter(Boolean).join(" · "))}</span></button>
      <button type="button" class="iconbtn nu-qadd" data-sh="qadd" data-id="${esc(f.id)}" aria-label="${esc(f.name)}: 1 Portion hinzufügen">${IC.plus}</button></li>`;
  }
  const g = usualG(f), kc = f.per100 && f.per100.kcal != null ? Math.round(f.per100.kcal * g / 100) : null;
  return `<li class="${quick ? "nu-q" : ""}"><button type="button" data-sh="pick" data-id="${esc(f.id)}">
  <span class="nm">${esc(f.name)}${f.favorite ? ` <span class="nu-fav">${NI.star}</span>` : ""}</span>
  <span class="kc">${quick ? (kc != null ? nf(kc) : "–") : f.per100 && f.per100.kcal != null ? nf(f.per100.kcal) : "–"}<small>${quick ? `kcal · ${amtTxt(f, g)}` : isMl(f) ? "kcal/100 g (≈ 100 ml)" : "kcal/100 g"}</small></span>
  <span class="mt">${esc([f.brand, f.quantity, extra].filter(Boolean).join(" · "))}</span></button>
  ${quick ? `<button type="button" class="iconbtn nu-qadd" data-sh="qadd" data-id="${esc(f.id)}" aria-label="${esc(f.name)}: ${nf(g)} g hinzufügen">${IC.plus}</button>` : ""}</li>`;
};
// nach dem Eintragen: Blatt bleibt offen, zurück zur Liste/Suche (Suchbegriff und Treffer bleiben), Hinweis oben
function backToList(en) {
  SH.food = null; SH.amount = null; SH.short = null; SH.err = "";
  if (SH.tab === "barcode") SH.code = "";
  renderSheet();
  if (SH.tab === "barcode") startCam();
  if (en && window.GarvisActions) window.GarvisActions.undo(`${en.name} eingetragen`, () => { addOp(dayPath(ST.day), "del", en.id); SH.added = SH.added.filter(x => x.id !== en.id); if (SH.open) renderSheet(); });
}
function sheetHead(title, back) {
  const n = SH.added.length, kc = SH.added.reduce((a, e) => a + (+e.kcal || 0), 0);
  return `<div class="nu-sh"><div>${back ? `<button type="button" class="nu-link" data-sh="${back}">${NI.left}Zurück</button>` : ""}<h3 id="nuShT">${esc(title)}</h3>
    ${n ? `<div class="nu-added" role="status">${IC.check}${n} ${n === 1 ? "Eintrag" : "Einträge"} · ${nf(kc)} kcal hinzugefügt</div>` : ""}</div>
    ${n ? `<button type="button" class="btn nu-done" data-sh="close">Fertig</button>` : `<button type="button" class="iconbtn" data-sh="close" aria-label="Schließen">${NI.close}</button>`}</div>`;
}
const mealChips = cur => `<div class="nu-chips nu-mealsel" role="group" aria-label="Mahlzeit">${mealsFor(ST.day, null, cur).map(m => `<button type="button" data-sh="meal" data-v="${m.k}" aria-pressed="${cur === m.k}">${m.n}</button>`).join("")}</div>`;
// Neuzeichnen ohne Springen: Scroll-Position bleibt, solange dieselbe Ansicht (Liste/Portion/…) gezeigt wird; Fokus nur auf Wunsch
let shKey = null;
function renderSheet() {
  const p = document.querySelector("#nuSheet .nu-panel"), key = SH.edit ? "edit" : SH.saveMeal ? "save" : SH.food ? "food:" + SH.food.id : SH.newFood ? "new" : "tab:" + SH.tab;
  const top = p ? p.scrollTop : 0, ae = document.activeElement, keepFocus = ae && p && p.contains(ae) && ae.name ? ae.name : null, sel = keepFocus && ae.selectionStart;
  renderSheet_(); camAttach();
  if (p) p.scrollTop = key === shKey ? top : 0;
  shKey = key;
  if (SH.wantFocus && p) { const i = p.querySelector('input[name="q"]'); if (i) i.focus({ preventScroll: true }); SH.wantFocus = false; }
  else if (keepFocus && p) { const i = p.querySelector(`input[name="${keepFocus}"]`); if (i) { i.focus({ preventScroll: true }); try { if (sel != null) i.setSelectionRange(sel, sel); } catch (e) { /* type=number */ } } }
}
function renderSheet_() {
  const b = $("nuShBody"); if (!b) return;
  if (SH.edit) return renderEdit(b);
  if (SH.saveMeal) return renderSaveMeal(b);
  if (SH.food && SH.food.type === "meal") return renderMealPortion(b);
  if (SH.food) return renderPortion(b);
  if (SH.newFood) return renderNewFood(b);
  const foods = foodsAll();
  let body = "";
  if (SH.tab === "search") {
    body = `<form class="nu-sf" data-shf="search"><input type="search" name="q" value="${esc(SH.q)}" placeholder="z. B. Skyr, „150 Haferflocken“, „2x Banane“" enterkeyhint="search" autocomplete="off">
      <button class="btn" type="submit"${SH.busy ? " disabled" : ""}>${NI.search}<span class="sr">Suchen</span></button></form>
      ${SH.busy ? `<p class="note">Suche in Open Food Facts …</p>` : ""}
      ${SH.err ? `<div class="hint">${IC.info}<span>${esc(SH.err)}</span></div>` : ""}
      <div id="nuGen">${genHtml()}</div>
      ${SH.results ? (SH.results.length ? `<div class="kicker" style="margin-top:14px">Produkte (Open Food Facts)</div><ul class="nu-list">${SH.results.map(f => foodRow(f)).join("")}</ul>` : `<p class="note">Keine Produkte gefunden – anders schreiben, Barcode probieren oder unter „Eigene“ anlegen.</p>`) : ""}
      ${!SH.results && !SH.busy ? recentPreview(foods) : ""}
      ${!SH.results && !SH.busy ? `<p class="note" style="font-size:12.5px">Tipp: Menge gleich mitschreiben („150 Skyr“, „2x Banane“) – Garvis sucht zuerst in deinen Lebensmitteln. Mit dem Mikrofon der Tastatur geht das auch per Sprache.</p>` : ""}
      <p class="nu-src">Grundnahrungsmittel und Gerichte: Bundeslebensmittelschlüssel BLS 4.0, Max Rubner-Institut (CC BY 4.0); ergänzend USDA FoodData Central (gemeinfrei) und Frida/DTU (CC BY 4.0); Standardrezepte aus diesen Zutaten = grobe Schätzung. Produkte: Open Food Facts (ODbL) – Angaben der Community, ohne Gewähr.</p>`;
  } else if (SH.tab === "barcode") {
    const live = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const held = cam && cam.hold;
    body = `<div id="nuCam"></div>
      ${SH.busy ? `<p class="note">Suche Produkt …</p>` : ""}
      ${SH.err ? `<div class="hint">${IC.info}<span>${esc(SH.err)}</span></div>` : ""}
      ${SH.unknownCode && !SH.busy ? `<div class="nu-scanbtns"><button type="button" class="btn" data-sh="newcode">${IC.plus}Neu anlegen</button><button type="button" class="txtbtn" data-sh="quicktab">Schnell erfassen</button></div>` : ""}
      <div class="nu-scanbtns" style="margin-top:10px">${live && (!cam || held) ? `<button type="button" class="${SH.unknownCode ? "txtbtn" : "btn"}" data-sh="cam">${NI.camera}${cam ? "Weiter scannen" : "Kamera starten"}</button>` : ""}
        <label class="txtbtn nu-photo">${NI.barcode}Foto vom Strichcode<input type="file" accept="image/*" capture="environment" data-shphoto hidden></label></div>
      <form class="nu-sf" data-shf="barcode" style="margin-top:12px"><input name="code" value="${esc(SH.code)}" inputmode="numeric" pattern="[0-9]*" placeholder="oder Zahl unter dem Strichcode" autocomplete="off">
      <button class="btn" type="submit"${SH.busy ? " disabled" : ""}>Nachschlagen</button></form>
      ${cam ? "" : `<p class="note" style="font-size:12.5px">Nach dem ersten Erlauben startet die Kamera hier von selbst. „Foto“ kommt ganz ohne Nachfrage aus.</p>`}`;
  } else if (SH.tab === "mine" || SH.tab === "own") {
    const list = SH.tab === "own" ? foods.filter(f => f.custom) : mineList(foods, SH.meal);
    const empty = SH.tab === "own" ? "Noch keine eigenen Lebensmittel." : "Hier sammeln sich deine Favoriten und was du oft isst – sortiert nach Mahlzeit. Einfach einmal über „Suchen“ oder „Scannen“ etwas eintragen.";
    body = `${SH.tab === "own" ? `<button type="button" class="txtbtn" data-sh="newfood">${IC.plus}Eigenes Lebensmittel anlegen</button>` : `<p class="note" style="font-size:12.5px;margin-top:0">„+“ trägt sofort die gewohnte Menge ein, Antippen öffnet die Menge.</p>`}
      ${list.length ? `<ul class="nu-list">${list.map(f => foodRow(f, f.uses > 1 ? `${f.uses}×` : "", true)).join("")}</ul>` : `<p class="note">${empty}</p>`}`;
  } else if (SH.tab === "quick") {
    body = `<form class="nu-form" data-shf="quick">
      <label class="field"><span class="kicker">Bezeichnung <i>optional</i></span><input name="name" maxlength="80" placeholder="z. B. Pasta im Restaurant" autocomplete="off"></label>
      <div class="frow nu-f4">${[["kcal", "kcal"], ["carbs_g", "KH g"], ["protein_g", "Protein g"], ["fat_g", "Fett g"], ["drink_ml", "Getränk ml"]].map(([k, l]) => `<label class="field"><span class="kicker">${l}</span><input name="${k}" inputmode="decimal" autocomplete="off"></label>`).join("")}</div>
      ${SH.err ? `<div class="hint">${IC.info}<span>${esc(SH.err)}</span></div>` : ""}
      <div class="formfoot"><button class="btn" type="submit">Hinzufügen</button><span class="muted">Schätzen ist okay.</span></div></form>`;
  }
  b.innerHTML = `${sheetHead("Essen hinzufügen")}${mealChips(SH.meal)}
    <div class="seg nu-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-sh="tab" data-v="${k}" aria-pressed="${SH.tab === k}" aria-selected="${SH.tab === k}">${l}</button>`).join("")}</div>
    <div class="nu-shc">${body}</div>`;
}
function genHtml() {
  const q = (parseShort(SH.q) || {}).q || SH.q, hits = genericSearch(q, 16);
  if (!hits.length) return GF.list || !SH.q ? "" : `<p class="note">Lade Lebensmittel und Gerichte …</p>`;
  const dish = hits.filter(f => f.dish).slice(0, 8), base = hits.filter(f => !f.dish).slice(0, 8);
  const sec = (t_, L) => L.length ? `<div class="kicker" style="margin-top:14px">${t_}</div><ul class="nu-list">${L.map(f => foodRow(f, f.dish ? (f.src === "bls" ? "BLS" : f.src === "recipe" ? "Standardrezept" : "") : (f.state || f.group || ""), true)).join("")}</ul>` : "";
  return sec("Grundnahrungsmittel", base) + sec("Gerichte", dish);
}
function recentPreview(foods) {
  const rec = mineList(foods, SH.meal).slice(0, 5);
  return rec.length ? `<div class="kicker" style="margin-top:14px">Häufig zu dieser Mahlzeit</div><ul class="nu-list">${rec.map(f => foodRow(f, "", true)).join("")}</ul>` : "";
}
function renderPortion(b) {
  const f = SH.food, stored = foodsAll().find(x => x.id === f.id), last = (stored && stored.last_g) || f.last_g;
  const g = SH.amount ?? last ?? f.serving_g ?? 100, P = portion(f, g || 0), p = f.per100 || {};
  const fav = !!(stored ? stored.favorite : f.favorite);
  const miss = KEYS.filter(k => p[k] == null && k !== "fiber_g");
  const named = (f.portions || (stored && stored.portions) || []).filter(x => x && x.g > 0).slice(0, 5);
  const ml = isMl(f);
  const base_ = f.dish ? [150, 250, 350, 450] : [30, 50, 100, 150, 200];
  const chips = [...new Set([last, ...(named.length ? [] : [f.serving_g]), ...base_].filter(Boolean).map(Math.round))].filter(c => !named.some(x => Math.round(x.g) === c));
  b.innerHTML = `${sheetHead(f.name, "back")}
    <div class="nu-pmeta">${esc([f.brand, f.quantity, f.barcode && `EAN ${f.barcode}`, f.generic && f.src_name ? `Quelle: ${({ frida: "Frida/DTU", bls: "BLS 4.0 (Max Rubner-Institut)", fndds: "USDA FNDDS", recipe: "Standardrezept (aus BLS/USDA-Zutaten)", usda_sr: "USDA" })[f.src] || f.src} ${f.src_id || ""}` : ""].filter(Boolean).join(" · "))}</div>
    ${mealChips(SH.meal)}
    <form class="nu-form" data-shf="portion">
      <label class="field"><span class="kicker">Menge (${ml ? "ml" : "g"})</span><input name="amount" inputmode="decimal" value="${ml ? toMl(f, g) : nf(g, g % 1 ? 1 : 0).replace(/\./g, "")}" autocomplete="off"></label>
      <div class="sugg" style="margin-top:0">${ml ? `${last ? `<button type="button" data-sh="amt" data-v="${toMl(f, last)}">Wie zuletzt · ${toMl(f, last)} ml</button>` : ""}${named.filter(x => !last || x.ml !== toMl(f, last)).map(x => `<button type="button" data-sh="amt" data-v="${x.ml || toMl(f, x.g)}">${esc(x.n)}</button>`).join("")}`
        : named.map(x => `<button type="button" data-sh="amt" data-v="${Math.round(x.g)}">${esc(x.n)} · ${Math.round(x.g)} g</button>`).join("")}${ml ? "" : chips.map(c => `<button type="button" data-sh="amt" data-v="${c}">${c === Math.round(last || -1) ? `Wie zuletzt · ${c} g` : c === Math.round(f.serving_g || -1) ? `1 Portion · ${c} g` : `${c} g`}</button>`).join("")}</div>
      <div class="nu-prev" id="nuPrev">${previewHtml(P)}</div>
      ${miss.length ? `<p class="note" style="font-size:12.5px">Unvollständige Angaben (${miss.map(k => ({ kcal: "kcal", carbs_g: "KH", protein_g: "Protein", fat_g: "Fett" })[k]).join(", ")}) – zählt als 0.</p>` : ""}
      <div class="formfoot"><button class="btn" type="submit">Hinzufügen</button>
        <button type="button" class="txtbtn" data-sh="fav" aria-pressed="${fav}">${NI.star}${fav ? "Favorit" : "Als Favorit"}</button></div>
    </form>
    ${f.dish && f.src_name && f.src !== "bls" ? `<p class="nu-src">${esc(f.note || "Grobe Schätzung aus einem Standardrezept")}: ${esc(f.src_name)}</p>` : ""}
    ${ml ? `<p class="nu-src">Umrechnung ${String(f.density).replace(".", ",")} g/ml (${esc(f.density_src || "")})</p>` : ""}
    <p class="nu-src">Pro 100 g: ${nf(p.kcal)} kcal · KH ${nf(p.carbs_g, 1)} · Protein ${nf(p.protein_g, 1)} · Fett ${nf(p.fat_g, 1)}${p.fiber_g != null ? ` · Ballaststoffe ${nf(p.fiber_g, 1)}` : ""} g</p>`;
}
const previewHtml = P => `<div><b>${nf(P.kcal)}</b><small>kcal</small></div><div><b>${nf(P.carbs_g, 1)}</b><small>KH g</small></div><div><b>${nf(P.protein_g, 1)}</b><small>Protein g</small></div><div><b>${nf(P.fat_g, 1)}</b><small>Fett g</small></div>`;
// ---------- Gespeicherte Mahlzeiten & Rezepte ----------
const mealTotals = f => { const t_ = totals(f.items || []), n = f.servings || 1; return Object.fromEntries(KEYS.map(k => [k, r1(t_[k] / n)])); };
function renderSaveMeal(b) {
  const S = SH.saveMeal, es = view(dayPath(ST.day)).entries.filter(e => S.ids.includes(e.id)), tt = totals(es);
  b.innerHTML = `${sheetHead("Mahlzeit merken")}
    <p class="note" style="margin-top:0">${es.map(e => esc(e.name)).join(", ")} · ${nf(tt.kcal)} kcal</p>
    <form class="nu-form" data-shf="savemeal">
      <label class="field"><span class="kicker">Name</span><input name="name" maxlength="60" required autocomplete="off" placeholder="z. B. Mein Müsli, Omas Linsensuppe"></label>
      <div class="frow nu-f4">
        <label class="field"><span class="kicker">Ergibt Portionen</span><input name="servings" inputmode="decimal" value="1" autocomplete="off"></label>
        <label class="field"><span class="kicker">Davon gegessen</span><input name="eaten" inputmode="decimal" value="1" autocomplete="off"></label>
      </div>
      <p class="note" style="font-size:12.5px">Mahlzeit: 1 Portion. Rezept (z. B. Topf für 4): alle Zutaten unter dieser Mahlzeit eintragen, „Ergibt 4“, „Davon gegessen 1“ – Garvis ersetzt die Zutaten dann durch 1 Portion.</p>
      ${SH.err ? `<div class="hint">${IC.info}<span>${esc(SH.err)}</span></div>` : ""}
      <div class="formfoot"><button class="btn" type="submit">Speichern</button></div></form>`;
}
function renderMealPortion(b) {
  const f = SH.food, n = SH.amount ?? 1, per = mealTotals(f), P = Object.fromEntries(KEYS.map(k => [k, per[k] == null ? null : r1(per[k] * n)]));
  b.innerHTML = `${sheetHead(f.name, "back")}
    <div class="nu-pmeta">${f.servings > 1 ? `Rezept · ergibt ${nf(f.servings)} Portionen` : "Gespeicherte Mahlzeit"} · ${esc((f.items || []).map(i => i.name).join(", "))}</div>
    ${mealChips(SH.meal)}
    <form class="nu-form" data-shf="mealportion">
      <label class="field"><span class="kicker">Portionen</span><input name="amount" inputmode="decimal" value="${dec(n)}" autocomplete="off"></label>
      <div class="sugg" style="margin-top:0">${[0.5, 1, 1.5, 2].map(c => `<button type="button" data-sh="amt" data-v="${c}">${dec(c)} ×</button>`).join("")}</div>
      <div class="nu-prev" id="nuPrev">${previewHtml(P)}</div>
      <div class="formfoot"><button class="btn" type="submit">Hinzufügen</button>
        <button type="button" class="txtbtn" data-sh="unmeal">${NI.trash}Löschen</button></div>
    </form>`;
}
function logMeal(f, n) {
  const per = mealTotals(f);
  const e = addEntry({ name: n === 1 ? f.name : `${f.name} (${dec(n)} Portionen)`, amount_g: null, ...Object.fromEntries(KEYS.map(k => [k, per[k] == null ? null : (k === "kcal" ? Math.round(per[k] * n) : r1(per[k] * n))])), source: "meal:" + f.id });
  addOp(FOODS_PATH, "use", { ...f, last_used: new Date().toISOString(), last_g: null, meal: SH.meal });
  return e;
}
function renderNewFood(b) {
  b.innerHTML = `${sheetHead("Eigenes Lebensmittel", "back")}${SH.unknownCode ? `<p class="note" style="margin-top:0">Wird mit Barcode <b>${esc(SH.unknownCode)}</b> gespeichert – Nährwerte stehen auf der Packung (pro 100 g).</p>` : ""}
    <form class="nu-form" data-shf="newfood">
      <label class="field"><span class="kicker">Name</span><input name="name" maxlength="80" required autocomplete="off" placeholder="z. B. Omas Müsli"></label>
      <div class="kicker" style="margin-top:4px">Nährwerte pro 100 g</div>
      <div class="frow nu-f4">${[["kcal", "kcal"], ["carbs_g", "KH g"], ["protein_g", "Protein g"], ["fat_g", "Fett g"], ["fiber_g", "Ballastst. g"], ["serving_g", "Portion g"]].map(([k, l]) => `<label class="field"><span class="kicker">${l}</span><input name="${k}" inputmode="decimal" autocomplete="off"></label>`).join("")}</div>
      ${SH.err ? `<div class="hint">${IC.info}<span>${esc(SH.err)}</span></div>` : ""}
      <div class="formfoot"><button class="btn" type="submit">Speichern &amp; auswählen</button></div></form>`;
}
function renderEdit(b) {
  const e = SH.edit;
  b.innerHTML = `${sheetHead("Eintrag bearbeiten")}${mealChips(SH.meal || e.meal)}
    <form class="nu-form" data-shf="edit">
      <label class="field"><span class="kicker">Bezeichnung</span><input name="name" maxlength="80" value="${esc(e.name || "")}" autocomplete="off"></label>
      <div class="frow nu-f4">
        <label class="field"><span class="kicker">Menge g</span><input name="amount_g" inputmode="decimal" value="${dec(e.amount_g)}" autocomplete="off"${e.amount_g ? "" : ` placeholder="–"`}></label>
        <label class="field"><span class="kicker">Uhrzeit</span><input name="time" type="time" value="${esc(e.time || "")}"></label>
        ${KEYS.map(k => `<label class="field"><span class="kicker">${({ kcal: "kcal", carbs_g: "KH g", protein_g: "Protein g", fat_g: "Fett g", fiber_g: "Ballastst. g" })[k]}</span><input name="${k}" inputmode="decimal" value="${dec(e[k])}" autocomplete="off"></label>`).join("")}
      </div>
      ${e.amount_g ? `<p class="note" style="font-size:12.5px">Menge ändern rechnet die Nährwerte mit.</p>` : ""}
      <div class="formfoot"><button class="btn" type="submit">Speichern</button>
        <button type="button" class="txtbtn" data-sh="del">${NI.trash}Löschen</button></div></form>`;
}
function addEntry(fields) {
  const e = { id: uid(), time: ST.day === nutriToday() ? nowHM() : "12:00", meal: SH.meal, name: "", amount_g: null, kcal: null, carbs_g: null, protein_g: null, fat_g: null, fiber_g: null, source: "manual", ...fields };
  addOp(dayPath(ST.day), "put", e);
  SH.added.push(e);
  return e;
}
// Lebensmittel mit Menge eintragen (Portion, „+“, Kurzschreibweise)
function logFood(food, g) {
  const stored = foodsAll().find(x => x.id === food.id);
  const e = addEntry({ name: food.brand && !food.custom ? `${food.name} (${food.brand})` : food.name, amount_g: r1(g), ...(isMl(food) ? { amount_ml: toMl(food, g) } : {}),
    ...(isDrink(food) ? { drink_ml: isMl(food) ? toMl(food, g) : Math.round(g) } : {}), ...portion(food, g),
    source: (stored || food).favorite ? "favorite" : food.barcode ? `off:${food.barcode}` : "manual" });
  addOp(FOODS_PATH, "use", { ...strip(stored || food), last_used: new Date().toISOString(), last_g: r1(g), meal: SH.meal });
  return e;
}
function quickAdded(e) {
  if (window.GarvisActions) window.GarvisActions.undo(`${e.name} · ${e.amount_ml ? nf(e.amount_ml) + " ml" : nf(e.amount_g) + " g"} eingetragen`, () => addOp(dayPath(ST.day), "del", e.id));
}
async function lookupCode(code) {
  code = String(code || "").replace(/\D/g, "");
  SH.code = code;
  if (!/^\d{8,14}$/.test(code)) { SH.err = "Bitte die 8–14 Ziffern unter dem Strichcode eingeben."; return renderSheet(); }
  const known = foodsAll().find(f => f.barcode === code);
  if (known) { SH.food = known; SH.amount = null; return renderSheet(); }
  SH.busy = true; SH.err = ""; renderSheet();
  const r = await offProduct(code);
  SH.busy = false;
  const f = r.status === 200 && r.body && (r.body.status === 1 || r.body.product) ? offFood(r.body.product) : null;
  if (f) { SH.food = f; SH.amount = null; }
  else SH.err = r.status === 200 || r.status === 404 ? `Produkt ${code} nicht in Open Food Facts${gtinOk(code) ? "" : " (Prüfziffer passt nicht – Zahl prüfen)"}. Mit „Neu anlegen“ speicherst du es mit diesem Barcode – beim nächsten Scan kennt Garvis es.` : offErr(r.status);
  if (!f && (r.status === 200 || r.status === 404)) SH.unknownCode = code;
  if (SH.open) renderSheet();
}
function sheetClick(e) {
  const b = e.target.closest("[data-sh]"); if (!b) return;
  const a = b.dataset.sh;
  if (a === "close") return closeSheet();
  if (a === "tab") { SH.tab = b.dataset.v; SH.err = ""; if (SH.tab === "barcode") warmScanner(); SH.wantFocus = SH.tab === "search"; return renderSheet(); }
  if (a === "meal") {
    SH.meal = b.dataset.v;
    b.parentNode.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    return;
  }
  if (a === "back") { SH.food = null; SH.newFood = false; SH.saveMeal = null; SH.err = ""; if (cam && SH.tab === "barcode") { cam.hold = false; SH.unknownCode = null; } return renderSheet(); }
  if (a === "pick") {
    if (document.activeElement) document.activeElement.blur();
    const id = b.dataset.id;
    SH.food = (SH.results || []).find(f => f.id === id) || foodsAll().find(f => f.id === id) || genericById(id);
    SH.amount = SH.tab === "search" && SH.short && SH.food ? amountFor(SH.food, SH.short) : null; SH.fromList = null;
    return renderSheet();
  }
  if (a === "amt") { const inp = $("nuShBody").querySelector('input[name="amount"]'); inp.value = b.dataset.v; sheetInput({ target: inp }); return; }
  if (a === "fav") {
    const f = SH.food, stored = foodsAll().find(x => x.id === f.id), on = !(stored ? stored.favorite : f.favorite);
    addOp(FOODS_PATH, "food", { ...strip(stored || f), favorite: on });
    SH.food = { ...f, favorite: on };
    return renderSheet();
  }
  if (a === "newfood") { SH.newFood = true; SH.err = ""; return renderSheet(); }
  if (a === "del") {
    // sofort löschen, 5 s „Rückgängig“ (Toast aus actions.js) legt den Eintrag unverändert wieder an
    const old = { ...SH.edit }, path = dayPath(ST.day);
    addOp(path, "del", old.id);
    closeSheet();
    if (window.GarvisActions) window.GarvisActions.undo(`„${old.name || "Eintrag"}“ gelöscht`, () => addOp(path, "put", old));
    return;
  }
  if (a === "cam") return startCam();
  if (a === "torch" && cam && cam.track) { cam.torch = !cam.torch; cam.track.applyConstraints({ advanced: [{ torch: cam.torch }] }).catch(() => {}); b.setAttribute("aria-pressed", String(cam.torch)); return; }
  if (a === "newcode") { SH.newFood = true; SH.err = ""; return renderSheet(); }
  if (a === "quicktab") { SH.tab = "quick"; SH.err = ""; SH.unknownCode = null; return renderSheet(); }
  if (a === "unmeal") { const f = SH.food; addOp(FOODS_PATH, "unfood", f.id); SH.food = null; if (window.GarvisActions) window.GarvisActions.undo(`„${f.name}“ gelöscht`, () => addOp(FOODS_PATH, "food", f)); return renderSheet(); }
  if (a === "qadd") {
    const f = foodsAll().find(x => x.id === b.dataset.id) || (SH.results || []).find(x => x.id === b.dataset.id) || genericById(b.dataset.id); if (!f) return;
    const e = f.type === "meal" ? logMeal(f, 1) : logFood(f, usualG(f)); renderSheet();
    if (window.GarvisActions) window.GarvisActions.undo(`${e.name} eingetragen`, () => addOp(dayPath(ST.day), "del", e.id));
    return;
  }
}
function sheetInput(e) {
  const inp = e.target;
  if (inp.name === "amount" && SH.food) {
    const raw = num(inp.value), g = raw != null && isMl(SH.food) ? raw * SH.food.density : raw;
    SH.amount = g;
    const per = SH.food.type === "meal" ? mealTotals(SH.food) : null;
    const prev = $("nuPrev"); if (prev) prev.innerHTML = previewHtml(per ? Object.fromEntries(KEYS.map(k => [k, per[k] == null ? null : r1(per[k] * (g || 0))])) : portion(SH.food, g || 0));
  }
  if (SH.edit && inp.name === "amount_g" && SH.edit.amount_g > 0) {
    const g = num(inp.value); if (g == null) return;
    const f = g / SH.edit.amount_g, form = inp.form;
    KEYS.forEach(k => { if (SH.edit[k] != null) form.elements[k].value = k === "kcal" ? Math.round(SH.edit[k] * f) : nf(r1(SH.edit[k] * f), 1).replace(/\./g, ""); });
  }
  if (inp.name === "q") {  // Trefferliste erst nach kurzer Tipp-Pause filtern (nicht bei jedem Buchstaben die ganze Liste)
    SH.q = inp.value; clearTimeout(SH.qt);
    SH.qt = setTimeout(() => { const g = $("nuGen"); if (g) g.innerHTML = genHtml(); }, 120);
  }
}
const strip = f => ({ id: f.id, name: f.name, brand: f.brand || "", barcode: f.barcode || "", quantity: f.quantity || "", per100: f.per100, serving_g: f.serving_g || null, favorite: !!f.favorite, custom: !!f.custom, last_used: f.last_used || null, last_g: f.last_g || null,
  ...(f.generic ? { generic: true, portions: (f.portions || []).slice(0, 5), src: f.src, src_id: f.src_id } : {}),
  ...(isMl(f) ? { unit: "ml", density: f.density, density_src: f.density_src, group: f.group } : {}),
  ...(isDrink(f) ? { drink: true } : {}), ...(f.dish ? { dish: true } : {}) });
// „150 skyr“, „150g Skyr“, „2x Banane“, „2 Banane“ → { g | n, q }
function parseShort(q) {
  const m = String(q).trim().match(/^(\d+(?:[.,]\d+)?)\s*(ml|g|gr|x|×|stk|stück)?\.?\s+(.{2,})$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", ".")), unit = (m[2] || "").toLowerCase();
  return unit === "g" || unit === "gr" || unit === "ml" || (!unit && n >= 10) ? { g: n, q: m[3] } : { n, q: m[3] };
}
const amountFor = (food, sh) => food.type === "meal" ? (sh.n || 1) : sh.g ? (isMl(food) ? sh.g * food.density : sh.g) : (sh.n || 1) * (food.serving_g || food.last_g || 100);   // „250 Milch“ = 250 ml
async function sheetSubmit(e) {
  const f = e.target.closest("form[data-shf]"); if (!f) return;
  e.preventDefault();
  const kind = f.dataset.shf, v = n => f.elements[n] ? num(f.elements[n].value) : null;
  if (kind === "search") {
    if (document.activeElement) document.activeElement.blur();   // Tastatur zu → Treffer sichtbar
    let q = f.elements.q.value.trim(); SH.q = q;
    if (/^\d{8,14}$/.test(q)) { SH.tab = "barcode"; return lookupCode(q); }
    const sh = parseShort(q); SH.short = sh;
    if (sh) {
      q = sh.q;
      const ql = q.toLowerCase(), own = mineList(foodsAll(), SH.meal).concat(foodsAll().filter(x => x.custom)).find(x => x.name.toLowerCase().includes(ql)) || genericSearch(q, 1)[0];
      if (own) { SH.food = own; SH.amount = amountFor(own, sh); return renderSheet(); }
    }
    if (q.length < 2) return;
    SH.busy = true; SH.err = ""; SH.results = null; renderSheet();
    const r = await offSearch(q);
    SH.busy = false;
    if (r.status === 200 && r.body) {
      SH.results = (r.body.products || []).map(offFood).filter(x => x && (x.per100.kcal != null || x.per100.carbs_g != null));
      // eigene Lebensmittel mit passendem Namen zuerst
      const own = foodsAll().filter(x => x.name.toLowerCase().includes(q.toLowerCase()) && !SH.results.some(y => y.id === x.id));
      SH.results = own.concat(SH.results);
    } else SH.err = offErr(r.status);
    if (SH.open) renderSheet();
    return;
  }
  if (kind === "barcode") return lookupCode(f.elements.code.value);
  if (kind === "savemeal") {
    const name = f.elements.name.value.trim(), sv = v("servings") || 1, eaten = v("eaten") ?? 1;
    if (!name) { SH.err = "Bitte einen Namen eingeben."; return renderSheet(); }
    if (!(sv > 0) || sv > 20 || !(eaten >= 0) || eaten > sv) { SH.err = "Portionen bitte prüfen (gegessen höchstens so viel, wie das Rezept ergibt)."; return renderSheet(); }
    const path = dayPath(ST.day), es = view(path).entries.filter(e => SH.saveMeal.ids.includes(e.id));
    const items = es.map(e => ({ name: e.name, amount_g: e.amount_g ?? null, ...Object.fromEntries(KEYS.map(k => [k, e[k] ?? null])) }));
    const food = { id: "meal:" + uid(), type: "meal", name, items, servings: r1(sv), favorite: true, custom: true, last_used: new Date().toISOString(), per100: null };
    addOp(FOODS_PATH, "food", food);
    if (sv !== eaten || sv !== 1) {   // Rezept: Zutaten durch die gegessenen Portionen ersetzen
      es.forEach(e => addOp(path, "del", e.id));
      SH.meal = SH.saveMeal.meal;
      if (eaten > 0) { const time = es[0] && es[0].time; const e = logMeal(food, eaten); if (time) addOp(path, "put", { ...e, time }); }
    }
    SH.saveMeal = null; closeSheet();
    A.toast(`„${name}“ gemerkt – unter „Meine“ mit einem Tipp eintragen`);
    return;
  }
  if (kind === "mealportion") {
    const n = v("amount");
    if (!(n > 0)) { f.elements.amount.setAttribute("aria-invalid", "true"); return; }
    const en = logMeal(SH.food, n);
    return backToList(en);
  }
  if (kind === "portion") {
    const g = isMl(SH.food) ? (v("amount") || 0) * SH.food.density : v("amount");
    if (!(g > 0)) { f.elements.amount.setAttribute("aria-invalid", "true"); return; }
    const en = logFood(SH.food, g);
    return backToList(en);
  }
  if (kind === "quick") {
    const vals = { kcal: v("kcal"), carbs_g: v("carbs_g"), protein_g: v("protein_g"), fat_g: v("fat_g") };
    const dml = v("drink_ml");
    if (Object.values(vals).every(x => x == null) && !(dml > 0)) { SH.err = "Mindestens einen Wert eintragen (z. B. kcal oder Getränk ml)."; return renderSheet(); }
    let kcal = vals.kcal;
    if (kcal == null) kcal = Math.round(4 * (vals.carbs_g || 0) + 4 * (vals.protein_g || 0) + 9 * (vals.fat_g || 0));
    const en = addEntry({ name: f.elements.name.value.trim() || (dml > 0 ? "Getränk" : "Schnell-Eintrag"), kcal: Math.round(kcal), carbs_g: r1(vals.carbs_g), protein_g: r1(vals.protein_g), fat_g: r1(vals.fat_g),
      ...(dml > 0 ? { drink_ml: Math.round(dml), amount_ml: Math.round(dml) } : {}), source: "manual" });
    f.reset();
    return backToList(en);
  }
  if (kind === "newfood") {
    const name = f.elements.name.value.trim();
    if (!name) { SH.err = "Bitte einen Namen eingeben."; return renderSheet(); }
    const per100 = { kcal: v("kcal") != null ? Math.round(v("kcal")) : null, carbs_g: r1(v("carbs_g")), protein_g: r1(v("protein_g")), fat_g: r1(v("fat_g")), fiber_g: r1(v("fiber_g")) };
    if (per100.kcal == null) per100.kcal = Math.round(4 * (per100.carbs_g || 0) + 4 * (per100.protein_g || 0) + 9 * (per100.fat_g || 0));
    const food = { id: "own:" + uid(), name, brand: "", barcode: SH.unknownCode || "", quantity: "", per100, serving_g: v("serving_g") || null, favorite: false, custom: true, last_used: null };
    SH.unknownCode = null;
    addOp(FOODS_PATH, "food", food);
    SH.newFood = false; SH.food = food; SH.amount = null;
    return renderSheet();
  }
  if (kind === "edit") {
    const e0 = SH.edit, out = { ...e0, meal: SH.meal || e0.meal, name: f.elements.name.value.trim() || e0.name, time: f.elements.time.value || e0.time, amount_g: r1(v("amount_g")) };
    KEYS.forEach(k => { const x = v(k); out[k] = k === "kcal" ? (x == null ? null : Math.round(x)) : r1(x); });
    addOp(dayPath(ST.day), "put", out);
    return closeSheet();
  }
}
// Barcode-Scan: eingebauter BarcodeDetector, sonst (iPhone) der mitgelieferte Scanner (barcode-detector/zxing-wasm, lokal)
let cam = null, bdReady = null;
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
function loadDetector() {
  if ("BarcodeDetector" in window) return Promise.resolve();
  return bdReady || (bdReady = new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = "barcode-polyfill.js";
    s.onload = () => {
      try { window.BarcodeDetectionAPI.prepareZXingModule({ overrides: { locateFile: (p, pre) => p.endsWith(".wasm") ? "zxing_reader.wasm" : pre + p }, fireImmediately: true }); } catch (e) { /* lädt beim ersten detect */ }
      "BarcodeDetector" in window ? ok() : fail(new Error("kein Scanner"));
    };
    s.onerror = () => { bdReady = null; fail(new Error("Scanner nicht geladen")); };
    document.head.appendChild(s);
  }));
}
// Foto: ganzes Bild, Mitte vergrößert und um 90° gedreht probieren (senkrechte Codes)
async function decodePhoto(file) {
  SH.busy = true; SH.err = ""; renderSheet();
  try {
    await loadDetector();
    const bmp = await createImageBitmap(file), det = new window.BarcodeDetector({ formats: FORMATS });
    const tries = [bmp, crop(bmp, 0.15, 0.25, 0.7, 0.5, 1600), crop(bmp, 0.15, 0.25, 0.7, 0.5, 1600, true), crop(bmp, 0, 0, 1, 1, 1600, true)];
    let code = null;
    for (const src of tries) {
      const r = await det.detect(src).catch(() => []);
      const hit = (r || []).find(x => x.rawValue && gtinOk(x.rawValue));
      if (hit) { code = hit.rawValue; break; }
    }
    SH.busy = false;
    if (code) { okFeedback(); return lookupCode(code); }
    SH.err = "Kein Strichcode erkannt – Code füllt am besten die halbe Bildbreite, gerade halten, gutes Licht. Oder die Zahl eintippen.";
  } catch (e) { SH.busy = false; SH.err = "Foto ließ sich nicht auswerten – bitte die Zahl eintippen."; }
  if (SH.open) renderSheet();
}
// Ausschnitt (relativ) auf eine Leinwand, max. Breite mw, optional 90° gedreht
function crop(src, x, y, w, h, mw, rot = false) {
  const W = src.videoWidth || src.width, H = src.videoHeight || src.height;
  const sx = W * x, sy = H * y, sw = W * w, sh = H * h, k = Math.min(1, mw / sw);
  const c = document.createElement("canvas");
  c.width = Math.round((rot ? sh : sw) * k); c.height = Math.round((rot ? sw : sh) * k);
  const g = c.getContext("2d", { willReadFrequently: true });
  if (rot) { g.translate(c.width, 0); g.rotate(Math.PI / 2); }
  g.drawImage(src, sx, sy, sw, sh, 0, 0, Math.round(sw * k), Math.round(sh * k));
  return c;
}
// Rückmeldung: kurzer Ton (Web Audio – iOS hat kein vibrate), Rahmen kurz grün
let actx = null;
function okFeedback() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 1320; g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.12); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.13);
  } catch (e) { /* ohne Ton */ }
  if (navigator.vibrate) navigator.vibrate(30);
  if (cam && cam.wrap) { cam.wrap.classList.add("ok"); setTimeout(() => cam && cam.wrap && cam.wrap.classList.remove("ok"), 600); }
}
// Scanner vorwärmen (Skript + WASM laden), damit der erste Scan sofort klappt
let warm = null;
function warmScanner() {
  if (warm) return warm;
  warm = loadDetector().then(() => { const c = document.createElement("canvas"); c.width = c.height = 8; return new window.BarcodeDetector({ formats: FORMATS }).detect(c).catch(() => []); }).catch(() => { warm = null; });
  return warm;
}
// Kamera: höhere Auflösung, Dauerfokus, leichter Zoom; der Strom bleibt beim Weiter-Scannen offen (kein erneutes Nachfragen)
let camStarting = false;
const CAM_OK = "garvis.nutri.camOk";
async function startCam() {
  if (camStarting) return;
  if (cam) { cam.hold = false; cam.scan = true; cam.since = Date.now(); SH.err = ""; SH.unknownCode = null; renderSheet(); return; }
  const host = $("nuCam"); if (!host) return;
  camStarting = true;
  host.innerHTML = `<p class="note">Kamera startet …</p>`;
  try {
    await warmScanner();
    const det = new window.BarcodeDetector({ formats: FORMATS });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
    localStorage.setItem(CAM_OK, "1");
    const track = stream.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {};
    const adv = [];
    if ((caps.focusMode || []).includes("continuous")) adv.push({ focusMode: "continuous" });
    if (caps.zoom && caps.zoom.max >= 1.6) adv.push({ zoom: Math.min(2, caps.zoom.max) });   // Abstand halten = schärfer
    if (adv.length) track.applyConstraints({ advanced: adv }).catch(() => {});
    const wrap = document.createElement("div"); wrap.className = "nu-camwrap";
    wrap.innerHTML = `<video class="nu-video" playsinline muted autoplay></video><div class="nu-aim" aria-hidden="true"><i></i></div>
      <div class="nu-camtip" aria-live="polite">Strichcode in den Rahmen halten</div>
      ${caps.torch ? `<button type="button" class="nu-torch" data-sh="torch" aria-pressed="false" aria-label="Licht">💡</button>` : ""}`;
    const vid = wrap.querySelector("video"); vid.srcObject = stream;
    cam = { stream, track, wrap, vid, det, scan: true, last: null, since: Date.now(), idle: null, torch: false };
    camAttach();
    await vid.play().catch(() => {});
    scanLoop();
  } catch (e) {
    stopCam();
    const h = $("nuCam"); if (h) h.innerHTML = `<p class="note">${e && e.name === "NotAllowedError" ? "Kamera nicht erlaubt – in den iPhone-Einstellungen erlauben oder „Foto vom Strichcode“ nutzen." : "Kamera nicht verfügbar – „Foto vom Strichcode“ nutzen oder die Zahl eintippen."}</p>`;
  } finally { camStarting = false; }
}
// ca. 8 Bilder pro Sekunde, nur der Bereich um den Rahmen; EAN-13 mit gültiger Prüfziffer reicht einmal, kürzere Codes zweimal
function scanLoop() {
  if (!cam) return;
  let busy = false;
  const tick = async () => {
    if (!cam) return;
    if (cam.scan && !busy && cam.vid.readyState >= 2 && cam.wrap.isConnected) {
      busy = true;
      try {
        const R = roi(), r = await cam.det.detect(crop(cam.vid, R.x, R.y, R.w, R.h, 1280));
        const hit = (r || []).find(x => x.rawValue && gtinOk(x.rawValue));
        if (hit) {
          const c = hit.rawValue, strong = c.length === 13;
          if (strong || (cam.last && cam.last.c === c && Date.now() - cam.last.t < 1500)) { cam.scan = false; cam.hold = true; cam.last = null; okFeedback(); SH.unknownCode = null; lookupCode(c); }
          else cam.last = { c, t: Date.now() };
        }
        const tip = cam.wrap.querySelector(".nu-camtip");
        if (tip && cam.scan) tip.textContent = Date.now() - cam.since > 7000 ? "Etwas weiter weg halten, gerade ausrichten, mehr Licht" : "Strichcode in den Rahmen halten";
      } catch (e) { /* nächstes Bild */ }
      busy = false;
    }
    cam && (cam.raf = setTimeout(tick, 120));
  };
  tick();
}
// Bildausschnitt des Rahmens im Originalbild: das Video ist mit object-fit: cover beschnitten → sichtbaren Bereich umrechnen,
// Rahmen (8–92 % Breite, 20–80 % Höhe) plus etwas Rand
function roi() {
  const v = cam.vid, vw = v.videoWidth || 1, vh = v.videoHeight || 1, cw = v.clientWidth || vw, ch = v.clientHeight || vh;
  const k = Math.max(cw / vw, ch / vh), visW = cw / k, visH = ch / k, ox = (vw - visW) / 2, oy = (vh - visH) / 2;
  const fx = a => (ox + a * visW) / vw, fy = a => (oy + a * visH) / vh;
  const x = Math.max(0, fx(0.04)), y = Math.max(0, fy(0.14)), x2 = Math.min(1, fx(0.96)), y2 = Math.min(1, fy(0.86));
  return { x, y, w: x2 - x, h: y2 - y };
}
// nach jedem Neuzeichnen des Blatts: Kamera im Scannen-Tab wieder einhängen, sonst pausieren (nach 45 s ohne Nutzung aus)
function camAttach() {
  if (!cam) {
    if (SH.open && SH.tab === "barcode" && !SH.food && !SH.edit && localStorage.getItem(CAM_OK) && $("nuCam") && !camStarting) startCam();
    return;
  }
  const host = $("nuCam"), show = SH.open && SH.tab === "barcode" && !SH.food && !SH.edit && host;
  clearTimeout(cam.idle);
  if (show) {
    if (cam.wrap.parentNode !== host) { host.innerHTML = ""; host.appendChild(cam.wrap); cam.vid.play().catch(() => {}); }
    if (!SH.busy && !cam.hold) { cam.scan = true; cam.since = Date.now(); }
  } else { cam.scan = false; cam.idle = setTimeout(stopCam, 45000); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopCam(); });
function stopCam() { if (!cam) return; clearTimeout(cam.raf); clearTimeout(cam.idle); cam.stream.getTracks().forEach(t_ => t_.stop()); if (cam.wrap) cam.wrap.remove(); cam = null; }

// ---------- Mehr › Ernährung (Einstellungen) ----------
const DET = { id: "ernaehrungsprogramm", name: "Ernährung", sub: "", icon: NI.apple, noRange: true, group: "settings", render: renderSettings };
const SF = { dirty: false };
function menuSub() { const P = program(); return P === "off" ? "Programm wählen: Ampel, Schnell-Check oder Tracking" : `${PROG[P].n}${P === "L" && paused() ? " · pausiert" : ""}`; }
function renderSettings() {
  const sec = $(DET.id); if (!sec) return;
  refreshSettings();
  const s = settingsNutri() || {}, P = program(), dis = !canSave();
  const GP = (window.GARMIN && window.GARMIN.profile) || {}, wPh = GP.weight, hPh = GP.height, B = (N() && N().body) || null;
  if (SF.dirty && sec.querySelector("form")) return;  // Eingaben nicht überschreiben
  sec.innerHTML = `<h2>Ernährung</h2><p class="sub">Wie viel Garvis dich beim Essen und Trinken unterstützt</p>
    <form class="card goalform" id="nuSetForm" novalidate><fieldset${dis ? " disabled" : ""}>
      <legend class="kicker">Programm</legend>
      <div class="opts nu-opts">${PROGS.map(p => `<label class="opt"><input type="radio" name="program" value="${p.k}"${p.k === P ? " checked" : ""}><b>${p.n}</b><small>${esc(p.d)}</small></label>`).join("")}</div>
      <div class="frow">
        <label class="field"><span class="kicker">Gewicht (kg) <i>optional</i></span><input name="weight_kg" inputmode="decimal" autocomplete="off" value="${s.weight_kg != null ? nf(s.weight_kg, s.weight_kg % 1 ? 1 : 0) : ""}" placeholder="${wPh ? `Garmin: ${nf(wPh, 1)}` : "z. B. 71"}"></label>
        <label class="field"><span class="kicker">Größe (cm) <i>optional</i></span><input name="height_cm" inputmode="numeric" autocomplete="off" value="${s.height_cm ?? ""}" placeholder="${hPh ? `Garmin: ${nf(hPh)}` : "z. B. 181"}"></label>
      </div>
      <div class="frow">
        <label class="field"><span class="kicker">Körperfett (%) <i>optional</i></span><input name="body_fat_pct" inputmode="decimal" autocomplete="off" value="${s.body_fat_pct != null ? nf(s.body_fat_pct, 1) : ""}" placeholder="sonst geschätzt"></label>
        <label class="field"><span class="kicker">Schweißrate (ml/h) <i>optional</i></span><input name="sweat_rate_ml_h" inputmode="numeric" autocomplete="off" value="${s.sweat_rate_ml_h ?? ""}" placeholder="aus vor/nach-Wiegen"></label>
      </div>
      ${B ? `<p class="note" style="font-size:13px">Garvis rechnet aktuell mit <b style="color:var(--text-primary)">${nf(B.weight_kg, 1)} kg</b> (${esc(B.weight_source)})${B.height_cm ? `, ${nf(B.height_cm)} cm (${esc(B.height_source)})` : ""}. Daraus: Grundumsatz ≈ ${nf(B.bmr_kcal)} kcal, fettfreie Masse ≈ ${nf(B.ffm_kg, 1)} kg (${esc(B.ffm_source)}). Alle Gerichte, Eiweiß- und Kohlenhydratmengen sind darauf umgerechnet.</p>` : ""}
      <div class="field"><span class="kicker">Ernährungsform <i>optional</i></span><div class="chipsel">${DIETS.map(d => `<label><input type="radio" name="diet" value="${d.k}"${s.diet === d.k ? " checked" : ""}>${d.n}</label>`).join("")}
        <label><input type="radio" name="diet" value=""${!s.diet ? " checked" : ""}>Keine Angabe</label></div></div>
      <div class="field"><span class="kicker">Vertrage ich nicht / esse ich nicht <i>optional</i></span><div class="chipsel nu-avoid">${AVOID.map(([k, l]) => `<label><input type="checkbox" name="avoid" value="${k}"${(s.avoid || []).includes(k) ? " checked" : ""}>${l}</label>`).join("")}</div></div>
      ${(s.dislikes || []).length ? `<p class="note" style="font-size:13px">${(s.dislikes || []).length} Gericht${(s.dislikes || []).length === 1 ? "" : "e"} mit 👎 ausgeblendet. <button type="button" class="txtbtn" id="nuUndislike">Alle wieder zeigen</button></p>` : ""}
      ${P === "L" || s.paused ? `<div class="setrow nu-pauserow"><span class="mi">${NI.pause}</span><span><b>Tracking pausieren</b><small>Nur Ampel und Fueling zeigen, nichts erfassen</small></span>
        <button type="button" class="switch" role="switch" id="nuPauseSw" aria-checked="${!!s.paused}" aria-label="Tracking pausieren"${dis ? " disabled" : ""}></button></div>` : ""}
    </fieldset>
    <div class="hint" id="nuSetMsg" role="status"${dis ? "" : " hidden"}>${dis ? `${IC.info}<span>Lokal geöffnet (Datei) – speichern nur in der Garvis-App auf dem iPhone bzw. im Browser.</span>` : ""}</div>
    <div class="formfoot"><button type="submit" class="btn" id="nuSetSave"${dis ? " disabled" : ""}>Speichern</button><span class="muted">${s.updated ? `Zuletzt gespeichert: ${esc(new Date(s.updated).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))} Uhr` : NS.loading ? "Lade aktuellen Stand …" : ""}</span></div>
    <p class="note nu-disc">Gewicht, Größe, Alter und Geschlecht (aus Garmin) nutzt Garvis für Portionen, Protein-, Kohlenhydrat-, Trink- und Natrium-Richtwerte; ohne Körperfett schätzt Garvis die fettfreie Masse (Boer-Formel). ${esc(DISCLAIMER)}</p></form>`;
  const f = $("nuSetForm");
  f.addEventListener("input", () => { SF.dirty = true; });
  f.addEventListener("change", () => { SF.dirty = true; });
  const ud = $("nuUndislike");
  if (ud) ud.addEventListener("click", async () => { const r = await saveNutri({ dislikes: [] }); if (r.ok) { SF.dirty = false; renderSettings(); } });
  const sw = $("nuPauseSw");
  if (sw) sw.addEventListener("click", () => sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")));
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!canSave() || NS.saving) return;
    const msg = $("nuSetMsg"), btn = $("nuSetSave");
    const show = (kind, html) => { msg.hidden = false; msg.className = `hint ${kind}`; msg.innerHTML = `${kind === "ok" ? IC.check : IC.warning}<span>${html}</span>`; };
    const w = num(f.elements.weight_kg.value), sr = num(f.elements.sweat_rate_ml_h.value), hc = num(f.elements.height_cm.value), bf = num(f.elements.body_fat_pct.value);
    if (hc != null && (hc < 120 || hc > 230)) { f.elements.height_cm.setAttribute("aria-invalid", "true"); return show("bad", "Größe bitte in cm (120–230)."); }
    if (bf != null && (bf < 3 || bf > 50)) { f.elements.body_fat_pct.setAttribute("aria-invalid", "true"); return show("bad", "Körperfett bitte in % (3–50)."); }
    if (w != null && (w < 30 || w > 250)) { f.elements.weight_kg.setAttribute("aria-invalid", "true"); return show("bad", "Gewicht bitte in kg (30–250)."); }
    if (sr != null && (sr < 100 || sr > 4000)) { f.elements.sweat_rate_ml_h.setAttribute("aria-invalid", "true"); return show("bad", "Schweißrate bitte in ml pro Stunde (100–4000)."); }
    f.querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
    const patch = { program: (f.querySelector('input[name="program"]:checked') || {}).value || "off", weight_kg: w != null ? r1(w) : null,
      diet: (f.querySelector('input[name="diet"]:checked') || {}).value || null, sweat_rate_ml_h: sr != null ? Math.round(sr) : null,
      height_cm: hc != null ? Math.round(hc) : null, body_fat_pct: bf != null ? r1(bf) : null };
    if (sw) patch.paused = sw.getAttribute("aria-checked") === "true";
    patch.avoid = [...f.querySelectorAll('input[name="avoid"]:checked')].map(x => x.value);
    NS.saving = true; btn.disabled = true; btn.textContent = "Speichere …";
    const r = await saveNutri(patch);
    NS.saving = false; btn.disabled = false; btn.textContent = "Speichern";
    if (r.ok) { SF.dirty = false; show("ok", r.queued ? "<b>Offline gespeichert.</b> Garvis sendet es automatisch, sobald du wieder Netz hast." : "<b>Gespeichert.</b> Die Empfehlung passt sich beim nächsten Planungslauf an (spätestens morgen früh)."); DET.sub = menuSub(); A.refreshMenu(); }
    else show("bad", saveErr(r));
  });
}

// ---------- Heute: kleine Kachel ----------
function renderTodayTile() {
  const P = program(), n = N(), ready = $("hReady");
  let card = $("hNutri");
  if (P === "off" || !ready) { if (card) card.hidden = true; return; }
  if (!card) { card = document.createElement("a"); card.id = "hNutri"; card.className = "card nu-tile"; card.href = "#ernaehrung"; ready.after(card); }
  card.hidden = false;
  if (!hasRec(n)) { card.innerHTML = `<div class="kicker">Ernährung</div><div class="nu-tt">Empfehlung folgt beim nächsten Planungslauf</div>`; return; }
  const c = CLASS[n.day_class] || CLASS.mittel, S = n.session;
  const p = dayPath(nutriToday()), track = (P === "M" || P === "L") && !(P === "L" && paused());
  const water = track && (cacheOf(p) || queue().some(o => o.path === p)) ? view(p).water_ml : track && n.tracking && n.tracking.today ? +n.tracking.today.water_ml || 0 : null;
  card.innerHTML = `<div class="nu-th"><span class="kicker">Ernährung heute</span><svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></div>
    <div class="nu-tt">${esc(c.w)}</div>${gauge(n.day_class)}
    ${S ? `<div class="zw">${IC.bolt}<span><span class="zl">Für die Einheit</span> ${sessionLine(S)}</span></div>` : ""}
    ${nextDish(n)}
    ${water != null && n.targets && n.targets.water_ml != null ? `<div class="zw">${NI.drop}<span><span class="zl">Getrunken</span> <b>${liters(water)} l</b> von ${litersR(n.targets.water_ml)} l</span></div>` : ""}`;
}

// nächstes anstehendes Gericht (Heute-Kachel, Tagesansicht)
function nextDish(n) {
  const now = nowHM(), tl = (n && n.timeline) || [], d = window.TODAY && window.TODAY.date;
  const i = tl.findIndex(x => (x.meals || []).length && (d !== localIso() || String(x.time || "") >= now.slice(0, 2) + ":00"));
  if (i < 0) return "";
  const x = tl[i], ms = x.meals.filter(okMeal); if (!ms.length) return "";
  const m = ms[pickOf(d, i) % ms.length];
  return `<div class="zw">${NI.bowl}<span><span class="zl">${esc(x.label)}${x.time ? ` · ${esc(x.time)}` : ""}</span> ${esc(m.name)}</span></div>`;
}

// ---------- Woche › Tagesansicht (nur heute): Fueling-Kurzinfo ----------
function renderDayCard(host, w, ctx) {
  const slot = host.querySelector('[data-slot="nutrition"]'), n = N();
  if (!slot || !ctx || !ctx.today || program() === "off" || !hasRec(n) || n.date && n.date !== w.date && !(w.date === nutriToday() && n.date < w.date)) return;   // Plan vom Vortag: für heute weiter zeigen
  const c = CLASS[n.day_class] || CLASS.mittel, S = n.session;
  slot.hidden = false;
  slot.innerHTML = `<h3 class="chead">${NI.drop || IC.bolt}Ernährung heute</h3>
    <div class="nu-tt" style="margin:10px 0 8px">${esc(c.w)}</div>${gauge(n.day_class)}
    ${S ? `<div class="zw">${IC.bolt}<span><span class="zl">Für die Einheit</span> ${sessionLine(S)}</span></div>` : ""}
    ${program() === "L" && n.targets ? targetStats(n.targets, true) : nextDish(n)}
    <a class="linkrow" href="#ernaehrung" style="margin-top:12px">Zur Ernährung ${IC.chev}</a>`;
}

// ---------- Anmelden bei app.js ----------
function rerender() {
  if (A.invalidate) A.invalidate();  // app.js cacht Tabs: andere Ansichten (z. B. Woche/Tagesansicht) beim nächsten Wechsel neu zeichnen
  if (location.hash.startsWith("#ernaehrung") && !$("v-ernaehrung").hidden) renderView();
  if (!$("v-heute").hidden) renderTodayTile();
  const sec = $(DET.id); if (sec && !sec.hidden && !SF.dirty && !NS.saving) renderSettings();
  if (SH.open && !SH.edit && !SH.food && !SH.newFood && ["mine", "own"].includes(SH.tab)) renderSheet();
  renderSync();
  if (DET.sub !== menuSub()) { DET.sub = menuSub(); A.refreshMenu(); }
}
function init() {
  const sec = document.createElement("section"); sec.id = DET.id; sec.hidden = true;
  $("mDetail").appendChild(sec);
  DET.sub = menuSub();
  A.register({ id: "nutrition", views: { ernaehrung: renderView }, details: { [DET.id]: DET }, hooks: { today: renderTodayTile, day: renderDayCard } });
  if (queue().length) flush();
}
// eigenes Stylesheet laden, dann anmelden (sonst kurz ungestylt)
// schon per index.html geladen → sofort anmelden (kein Warten auf onload, keine späte Verschiebung auf „Heute“)
let started = false; const go = () => { if (!started) { started = true; init(); } };
const have = document.querySelector('link[rel="stylesheet"][href="nutrition.css"]');
if (have && have.sheet) go();
else {
  const css = have || document.createElement("link"); css.rel = "stylesheet"; css.href = "nutrition.css";
  css.addEventListener("load", go); css.addEventListener("error", go); setTimeout(go, 1500);
  if (!have) document.head.appendChild(css);
}
})();
