/* Garvis – Krafttraining (Zusatzmodul, geladen von app.js per <script src>):
   - Heute: Übungsliste aus TODAY.recommendation.strength, Sätze abhaken + tatsächliche Werte eintragen, Pausen-Timer
   - Speichern nach garvis-data/logs/strength/YYYY-MM.json (GitHub Contents API, sha, bei 409 neu laden); offline gepuffert
   - Mehr › Krafttraining: Verlauf je Übung (geschätztes 1RM) + Bestandsaufnahme (logs/strength/baseline.json)
   - Mehr › Einstellungen › Orte & Ausstattung: settings.json › "locations" und "gear" (andere Schlüssel bleiben unverändert)
   - Mehr: Übersichtskarte „Ausrüstung“ (Verschleiß aus TODAY.gear)
   Alle Felder sind optional – ohne TODAY…strength bleibt der Tagesplan wie gehabt. */
(() => {
const A = window.GarvisApp;
if (!A) return;
const { IC, esc, nf, t, WD, wdi, fmtDate, lineChart, gh, API, DATA_REPO, utf8b64, b64utf8, readLocal, writeLocal, errText, WRITE_HELP, SET_KEY } = A.api;
const $ = id => document.getElementById(id);
const web = () => !!(window.GARVIS && window.GARVIS.web);
const TD = () => window.TODAY || null;

if (!document.querySelector('link[rel="stylesheet"][href="strength.css"]')) {  // index.html bindet es schon im <head> ein
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "strength.css";
  document.head.appendChild(css);
}

const svgI = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICX = {
  minus: svgI('<path d="M5 12h14"/>'), plus: svgI('<path d="M12 5v14M5 12h14"/>'), check: IC.check,
  pin: IC.pin, gym: IC.gym, target: IC.target, timer: IC.timer, warning: IC.warning, info: IC.info, key: IC.key, clock: IC.clock,
  locate: svgI('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  trash: svgI('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  swap: svgI('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  note: svgI('<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>'),
};

// ---------- Formatierung ----------
const KGF = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });  // einmal anlegen statt bei jedem Aufruf
const kg = v => v == null || isNaN(v) ? "–" : KGF.format(+v);
const pad = n => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dShort = iso => { const x = t(iso), d = new Date(x); return `${WD[wdi(x)]}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`; };
const nums = s => (String(s ?? "").match(/\d+(?:[.,]\d+)?/g) || []).map(x => +x.replace(",", "."));
const topOf = s => { if (typeof s === "number") return s; const n = nums(s); return n.length ? Math.max(...n) : null; };
const timed = reps => /\d\s*(s|sek|sec|min)\b/i.test(String(reps || ""));
const pretty = id => String(id).replace(/[_-]+/g, " ").replace(/^\w/, c => c.toUpperCase());
const fmtRest = s => !s ? "" : s >= 60 ? `${Math.floor(s / 60)}:${pad(s % 60)} min` : `${s} s`;
const clockS = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const wStep = w => w >= 100 ? 5 : w >= 20 ? 2.5 : w >= 8 ? 1 : 0.5;  // Langhantel 2,5 kg · Kurzhantel 1 kg · klein 0,5 kg
const parseNum = s => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isNaN(v) ? null : v; };
const round = (v, d = 2) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const setsTxt = sets => {  // [{reps, weight_kg}] → „8/8/7 × 40 kg“ bzw. „8 × 40 · 6 × 45 kg“
  const s = (sets || []).filter(x => x && x.reps != null);
  if (!s.length) return "";
  const ws = [...new Set(s.map(x => x.weight_kg ?? null))];
  if (ws.length === 1) return `${s.map(x => kg(x.reps)).join("/")}${ws[0] != null ? ` × ${kg(ws[0])} kg` : " Wdh."}`;
  return s.map(x => `${kg(x.reps)} × ${x.weight_kg != null ? kg(x.weight_kg) : "KG"}`).join(" · ") + " kg";
};
const maxRpe = sets => { const r = (sets || []).map(x => x && x.rpe).filter(x => x != null); return r.length ? Math.max(...r) : null; };
// Anstrengung (RPE) im Klartext: 3 → „Anstrengung 3/10 (leicht)“, „7–8“ → „Anstrengung 7–8/10 (hart)“
const rpeWord = v => v == null ? "" : v <= 2 ? "sehr leicht" : v <= 4 ? "leicht" : v <= 6 ? "mittel" : v <= 8 ? "hart" : v < 10 ? "sehr hart" : "maximal";
const rpeTxt = v => { const n = nums(v); if (!n.length) return `Anstrengung ${v}`; const lo = Math.min(...n), hi = Math.max(...n), wl = rpeWord(lo), wh = rpeWord(hi);
  return `Anstrengung ${lo === hi ? kg(lo) : `${kg(lo)}–${kg(hi)}`}/10 (${wl === wh ? wl : `${wl} bis ${wh}`})`; };
const addDay = (iso, n) => new Date(t(iso) + n * 86400000).toISOString().slice(0, 10);
const weekMon = () => addDay(todayIso(), -wdi(t(todayIso())));
// Toast mit „Rückgängig“ aus actions.js (fehlt das Modul, passiert die Aktion trotzdem)
const toastS = (msg, undo) => { const X = window.GarvisActions; if (X) undo ? X.undo(msg, undo) : X.toast(msg); };
// Geschätztes 1RM (Epley), nur aus Sätzen mit 1–12 Wiederholungen
const e1rm = s => !s || !s.weight_kg || !s.reps || s.reps > 12 ? null : s.reps === 1 ? s.weight_kg : s.weight_kg * (1 + s.reps / 30);

// ---------- Übungsnamen (nur die, die in TODAY vorkommen; lokal gemerkt für den Verlauf) ----------
const NAMES_KEY = "garvis.strength.names";
const plans = T => {
  const out = [];
  if (T && T.recommendation && T.recommendation.strength) out.push({ date: T.date, S: T.recommendation.strength });
  ((T && T.week) || []).forEach(w => { if (w && w.strength && w.date !== (T && T.date)) out.push({ date: w.date, S: w.strength }); });
  return out;
};
const NAMES = Object.assign({}, readLocal(NAMES_KEY) || {});
plans(TD()).forEach(({ S }) => (S.exercises || []).forEach(e => { if (e && e.id && e.name) NAMES[e.id] = e.name; }));
writeLocal(NAMES_KEY, NAMES);
const nameOf = id => NAMES[id] || pretty(id);
const todayS = () => { const T = TD(), R = T && T.recommendation; return R && R.strength && (R.strength.exercises || []).length ? R.strength : null; };

// ---------- GitHub Contents API (garvis-data) ----------
const fileUrl = path => `${API}/repos/${DATA_REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
async function getJson(path) {
  const r = await gh(fileUrl(path));
  if (r.status === 200 && r.body && r.body.content != null) {
    try { return { ok: true, data: JSON.parse(b64utf8(r.body.content)), sha: r.body.sha }; }
    catch (e) { return { ok: true, data: null, sha: r.body.sha, broken: true }; }
  }
  if (r.status === 404) return { ok: true, data: null, sha: null };
  return { ok: false, r };
}
// Lesen → ändern → mit sha zurückschreiben; bei 409/422 (inzwischen geändert) frisch laden und erneut zusammenführen
async function updateJson(path, mutate, message) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    const cur = await getJson(path);
    if (!cur.ok) return { ok: false, r: cur.r };
    const next = mutate(cur.data);
    const r = await gh(fileUrl(path), { method: "PUT", body: JSON.stringify({ message, content: utf8b64(JSON.stringify(next, null, 2) + "\n"), ...(cur.sha ? { sha: cur.sha } : {}) }) });
    if (r.status === 200 || r.status === 201) return { ok: true, data: next };
    if (r.status !== 409 && r.status !== 422) return { ok: false, r };
    last = r;
  }
  return { ok: false, r: last };
}
let chain = Promise.resolve();
const serial = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };  // nie zwei Schreibvorgänge gleichzeitig

const mergeLog = entries => data => {
  const d = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
  d.entries = Array.isArray(d.entries) ? d.entries.slice() : [];
  entries.forEach(e => {
    const i = d.entries.findIndex(x => x && x.date === e.date && x.exercise_id === e.exercise_id);
    if (i >= 0) d.entries[i] = e; else d.entries.push(e);
  });
  d.entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return d;
};
const mergeBase = upd => data => ({ ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}), ...upd });

const CACHE_KEY = "garvis.strength.cache";  // zuletzt geladener Verlauf: { months: {"2026-11": [entries]}, baseline, at }
let C = readLocal(CACHE_KEY) || { months: {}, baseline: null, at: null };
const saveCache = () => writeLocal(CACHE_KEY, C);

async function sendLog(entries) {
  const by = {};
  entries.forEach(e => (by[e.date.slice(0, 7)] ||= []).push(e));
  for (const m of Object.keys(by)) {
    const names = [...new Set(by[m].map(e => nameOf(e.exercise_id)))].join(", ");
    const res = await updateJson(`logs/strength/${m}.json`, mergeLog(by[m]), `Garvis: Krafttraining ${by[m][0].date} (${names})`.slice(0, 120));
    if (!res.ok) return res;
    C.months[m] = res.data.entries; saveCache();
  }
  return { ok: true };
}
async function sendBase(upd) {
  const res = await updateJson("logs/strength/baseline.json", mergeBase(upd), "Garvis: Bestandsaufnahme Kraft");
  if (res.ok) { C.baseline = res.data; saveCache(); }
  return res;
}

// ---------- Puffer: nicht gesendete Speichervorgänge bleiben auf dem Gerät und werden später gesendet ----------
// Netz weg (0), GitHub überlastet/Limit (429, 5xx, 403 mit Limit) und Schlüsselprobleme (-1, 401, 403, 404) → puffern.
// Nur echte Inhaltsfehler (z. B. 400/422) sind „dauerhaft“ – auch dann bleiben die Daten erhalten (Entwurf bzw. Puffer).
const failKind = r => {
  const s = r ? r.status : 0;
  if (s === 0) return "net";
  if (s === -1 || s === 401 || s === 404 || (s === 403 && !r.rl)) return "key";
  if (r.rl || s === 403 || s === 408 || s === 429 || s >= 500) return "busy";
  return null;
};
const QUEUED = {
  net: { pill: "wartet auf Verbindung", label: "Wartet auf Verbindung", html: "<b>Offline – auf dem Gerät gepuffert.</b> Garvis sendet die Einträge automatisch, sobald du wieder online bist." },
  busy: { pill: "wird erneut gesendet", label: "Wird erneut gesendet", html: "<b>GitHub gerade nicht erreichbar – auf dem Gerät gepuffert.</b> Garvis versucht es automatisch erneut." },
  key: { pill: "nicht gesendet – Schlüssel prüfen", label: "Nicht gesendet – Schlüssel prüfen", html: "" },
  bad: { pill: "nicht gesendet", label: "Nicht gesendet", html: "" },
};
const qOf = k => QUEUED[k] || QUEUED.net;
const RETRY_BTN = `<button type="button" class="txtbtn sxretry" data-sxretry>Jetzt erneut senden</button>`;
const queuedHtml = (k, r) => k === "key"
  ? `<b>Nicht gesendet – Schlüssel prüfen.</b> Die Einträge bleiben auf dem Gerät und werden automatisch gesendet, sobald der Schlüssel passt. ${esc(r && (r.status === -1 || r.status === 401) ? errText(r, "Speichern") : WRITE_HELP)}<br>${RETRY_BTN}`
  : qOf(k).html + (k === "busy" ? `<br>${RETRY_BTN}` : "");
const queuedToast = k => k === "key" ? "Nicht gesendet – Schlüssel prüfen. Bleibt auf dem Gerät gespeichert." : k === "busy" ? "GitHub gerade nicht erreichbar – wird automatisch erneut gesendet" : "Offline – wird gesendet, sobald du online bist";
// Mehr › Krafttraining: Stand des Puffers (Grund des letzten Versuchs, Knopf zum sofortigen Senden)
function outHint() {
  const o = outbox(), n = o.length, ws = new Set(o.map(x => x.why || "net"));
  const what = `${n} ${n === 1 ? "Eintrag" : "Einträge"}`;
  if (ws.has("key")) return hint("bad", ICX.key, `<b>${what} nicht gesendet – Schlüssel prüfen.</b> Bleibt auf dem Gerät gespeichert. ${esc(WRITE_HELP)}<br>${RETRY_BTN}`);
  if (ws.has("bad")) { const st = (o.find(x => x.why === "bad") || {}).status; return hint("bad", ICX.warning, `<b>${what} auf dem Gerät gespeichert, aber nicht gesendet</b>${st ? ` (GitHub-Fehler ${esc(String(st))})` : ""} – Garvis versucht es bei jedem Öffnen erneut.<br>${RETRY_BTN}`); }
  if (ws.has("busy")) return hint("", ICX.clock, `<b>${what} ${n === 1 ? "wartet" : "warten"} – GitHub gerade nicht erreichbar.</b> Wird automatisch erneut gesendet.<br>${RETRY_BTN}`);
  return hint("", ICX.clock, `<b>${what} ${n === 1 ? "wartet" : "warten"} auf Verbindung</b> – wird automatisch gesendet.`);
}
const OUT_KEY = "garvis.strength.outbox";  // [{ id, kind: "log"|"baseline", entries|data, at, why, status }]
const outbox = () => {
  const o = readLocal(OUT_KEY);
  if (!Array.isArray(o)) return [];
  if (o.some(x => !x.id)) { o.forEach((x, i) => { x.id ||= `o${Date.now().toString(36)}${i}`; }); writeLocal(OUT_KEY, o); }
  return o;
};
const enqueue = (item, why = "net", status = null) => { const o = outbox(); o.push({ ...item, id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), why, status }); writeLocal(OUT_KEY, o); };
const setOut = (id, upd) => writeLocal(OUT_KEY, outbox().map(o => o.id === id ? { ...o, ...upd } : o));
// Status der heutigen Übungen an den Puffer angleichen (gesendet → nicht mehr „wartet“; Grund aktualisieren)
function syncQueued() {
  if (!D || !D.ex) return;
  const q = new Map();
  outbox().filter(o => o.kind === "log").forEach(o => (o.entries || []).forEach(e => q.set(e.date + "|" + e.exercise_id, o.why || "net")));
  Object.entries(D.ex).forEach(([id, s]) => { if (!s || !s.queued) return; const w = q.get(D.date + "|" + id); if (w) s.qwhy = w; else s.queued = false; });
  saveDraft();
}
let flushing = false, retryT = null;
async function flush() {
  if (!web() || flushing || !outbox().length) return;
  flushing = true; clearTimeout(retryT);
  let sent = 0, stop = null, stopR = null, changed = false;
  try {
    for (const id of outbox().map(o => o.id)) {
      const it = outbox().find(o => o.id === id);
      if (!it) continue;
      const res = await serial(() => it.kind === "baseline" ? sendBase(it.data) : sendLog(it.entries || []));
      if (res.ok) { writeLocal(OUT_KEY, outbox().filter(o => o.id !== id)); sent++; continue; }
      const k = failKind(res.r);
      if (it.why !== (k || "bad")) changed = true;
      setOut(id, { why: k || "bad", status: res.r ? res.r.status : null });
      if (k) { stop = k; stopR = res.r; break; }  // Netz/Limit/Schlüssel: Reihenfolge bleibt, später erneut
      // dauerhafter Fehler (z. B. 422): Eintrag bleibt im Puffer, die übrigen trotzdem senden
    }
  } finally { flushing = false; }
  if (stop === "busy") retryT = setTimeout(flush, 60000);  // Limit/Serverfehler: in einer Minute erneut
  syncQueued();
  if (MSG.kind === "queued" && (sent || changed)) {
    const left = D && D.ex && Object.values(D.ex).some(s => s && s.queued);
    MSG = left ? { kind: "queued", icon: stop === "key" ? ICX.key : ICX.clock, html: queuedHtml(stop || "net", stopR) }
      : { kind: "ok", html: "<b>Gespeichert</b> – fließt in die nächste Empfehlung ein. (Gepufferte Einträge nachgesendet.)" };
  }
  if (sent || changed) A.rerender();  // nicht bei jedem erfolglosen Versuch neu zeichnen (Eingaben bleiben stehen)
}
addEventListener("online", () => flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });
document.addEventListener("click", e => { const b = e.target.closest("[data-sxretry]"); if (b && !b.disabled) { b.disabled = true; b.textContent = "Sende …"; flush().finally(() => A.rerender()); } });

const saveFailHtml = r => (r.status === 403 && !r.rl) || r.status === 404 ? esc(WRITE_HELP) : esc(errText(r, "Speichern"));
const failIcon = r => (r.status === 403 && !r.rl) || r.status === 404 ? ICX.key : ICX.warning;
const LOCAL_HINT = "Lokal geöffnet (Datei) – Anzeigen und Ausprobieren geht, gespeichert wird nur in der Garvis-App (iPhone bzw. Browser).";
const hint = (kind, icon, html) => html ? `<div class="hint ${kind || ""}" role="status">${icon}<span>${html}</span></div>` : "";

// =============================================================================================
// Heute: Übungsliste + Eintragen
// =============================================================================================
const DRAFT_KEY = "garvis.strength.draft";  // { date, ex: { id: { sets: [{reps, weight_kg, rpe, done}], note, dirty, saved, queued, qwhy } }, open: {ex, set},
                                            //   swap: { planId: altId }, extra: [{ id, name, sets, reps, rest_s }], free: bool }
let D = readLocal(DRAFT_KEY);
const saveDraft = () => writeLocal(DRAFT_KEY, D);
// Neuer Tag: ungespeicherte Sätze des alten Entwurfs nicht verwerfen, sondern als „Einheit von gestern speichern?“ anbieten
const PREV_KEY = "garvis.strength.prevdraft";  // { date, ex } – wie DRAFT_KEY, nur für einen früheren Tag
const unsavedEx = d => !!d && d.ex && typeof d.ex === "object" ? Object.entries(d.ex).filter(([, s]) => s && Array.isArray(s.sets) && s.sets.some(x => x.done) && (s.dirty || !s.saved) && !s.queued) : [];
function ensureDraft() {
  const d = todayIso();
  if (!D || D.date !== d || typeof D.ex !== "object") {
    if (D && D.date && D.date < d && unsavedEx(D).length) {
      const old = readLocal(PREV_KEY);
      writeLocal(PREV_KEY, old && old.date === D.date ? { date: D.date, ex: { ...old.ex, ...D.ex } } : { date: D.date, ex: D.ex });
    }
    D = { date: d, ex: {}, open: null, swap: {}, extra: [], free: false }; saveDraft();
  }
  if (!D.swap || typeof D.swap !== "object") D.swap = {};
  if (!Array.isArray(D.extra)) D.extra = [];
  return D;
}
// Satz geändert → wieder „ungespeichert“ (wartet eine ältere Fassung im Puffer, ersetzt die neue sie beim Senden)
const touch = s => { s.dirty = true; s.saved = false; s.queued = false; };
const planN = e => Math.max(1, Math.round(e.sets || 1));
function exState(e) {
  ensureDraft();
  let s = D.ex[e.id];
  const n = planN(e), min = e.extra ? 1 : n;  // geplante Sätze bleiben; selbst hinzugefügte Übungen ab 1 Satz
  if (!s) {
    const lastW = e.last && (e.last.sets || []).map(x => x.weight_kg).filter(x => x != null);
    const w = e.weight_kg != null ? e.weight_kg : lastW && lastW.length ? Math.max(...lastW) : null;
    s = D.ex[e.id] = { sets: [], note: "", dirty: false, saved: false, queued: false };
    const ps = Array.isArray(e.per_set) ? e.per_set : [];  // Gewicht je Satz (z. B. Rampe 27,5/35/35 kg)
    for (let i = 0; i < n; i++) s.sets.push({ reps: topOf(e.reps), weight_kg: ps[i] != null ? ps[i] : w, rpe: topOf(e.rpe_target), done: false });
  }
  while (s.sets.length < min) s.sets.push(s.sets.length ? { ...s.sets[s.sets.length - 1], done: false } : { reps: topOf(e.reps), weight_kg: null, rpe: null, done: false });
  return s;
}
// Letzte Einheit einer Übung aus dem Verlauf (für Alternativen und selbst hinzugefügte Übungen – der Plan bringt „last“ selbst mit)
const lastOf = id => { const d = todayIso(), L = allEntries().filter(x => x.exercise_id === id && x.date < d).at(-1); return L ? { date: L.date, sets: L.sets || [] } : null; };
// Alternativen aus dem Plan: Kennung (id) oder Name als Text, oder Objekt { id, name, … }
const altList = e => (e.alt || []).map(a => {
  const o = a && typeof a === "object" ? a : null, str = typeof a === "string" ? a.trim() : "";
  if (!o && !str) return null;
  const id = o ? (o.id || (o.name ? idFor(o.name) : "")) : NAMES[str] ? str : idFor(str);
  if (!id) return null;
  return { id, name: (o && o.name) || NAMES[id] || (str && str !== id ? str : pretty(id)), o };
}).filter(Boolean);
// Plan-Übung mit gewählter Alternative: Sätze/Wdh./Pause aus dem Plan, Gewicht aus dem eigenen Verlauf
function swapped(e) {
  const to = D.swap && D.swap[e.id];
  if (!to) return e;
  const all = altList(e), a = all.find(x => x.id === to);
  if (!a) return e;
  const o = a.o || {};
  return { id: a.id, name: a.name, sets: o.sets ?? e.sets, reps: o.reps ?? e.reps, rest_s: o.rest_s ?? e.rest_s, rpe_target: o.rpe_target ?? e.rpe_target,
    weight_kg: o.weight_kg ?? null, weight_type: o.weight_type, note: o.note || "", weight_note: o.weight_note || null, last: lastOf(a.id),
    alt: [{ id: e.id, name: e.name || nameOf(e.id) }, ...all.filter(x => x.id !== a.id).map(x => ({ id: x.id, name: x.name }))],
    orig: e.id, origName: e.name || nameOf(e.id) };
}
// Einheit heute: Plan (mit getauschten Übungen) + selbst hinzugefügte Übungen; ohne Kraftplan nur nach „Freies Krafttraining heute“
function liveS() {
  ensureDraft();
  const P = todayS();
  if (!P && !D.free) return null;
  const plan = P ? P.exercises.filter(e => e && e.id).map(swapped) : [], ids = new Set(plan.map(e => e.id));
  const extra = D.extra.filter(x => x && x.id && !ids.has(x.id)).map(x => ({ ...x, extra: true, last: lastOf(x.id) }));
  return { ...(P || { title: "Freies Krafttraining", focus: "" }), exercises: [...plan, ...extra], free: !P };
}
let MSG = { kind: "", html: "" };
let saving = false;

function stepper(label, f, value, unit, extra = "") {
  return `<div class="sxst"><span class="l">${label}${extra}</span>
    <button type="button" class="sxpm" data-act="dec" data-f="${f}" aria-label="${label}: weniger">${ICX.minus}</button>
    <label class="sxv"><input data-f="${f}" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${value == null ? "" : esc(kg(value))}" placeholder="–" aria-label="${label}"><small>${unit}</small></label>
    <button type="button" class="sxpm" data-act="inc" data-f="${f}" aria-label="${label}: mehr">${ICX.plus}</button></div>`;
}
function editorHtml(e, s, k) {
  const st = s.sets[k], last = k === s.sets.length - 1, rm = !st.done && s.sets.length > (e.extra ? 1 : planN(e));
  return `<div class="sxed" data-set="${k}">
    <div class="sxedh"><b>Satz ${k + 1} von ${s.sets.length}</b><button type="button" class="sxx" data-act="close">Schließen</button></div>
    ${stepper(timed(e.reps) ? "Sekunden" : "Wiederholungen", "reps", st.reps, timed(e.reps) ? "s" : "Wdh.")}
    ${stepper("Gewicht", "w", st.weight_kg, "kg", e.weight_note ? `<small>${esc(e.weight_note)}</small>` : st.weight_kg == null ? "<small>leer = Körpergewicht</small>" : "")}
    ${stepper("Anstrengung", "rpe", st.rpe, "/10", e.rpe_target != null ? `<small>Ziel ${esc(String(e.rpe_target))} (${esc(rpeWord(topOf(e.rpe_target)))})</small>` : "")}
    <button type="button" class="btn sxdone" data-act="done">${ICX.check}${st.done ? "Änderung übernehmen" : `Satz ${k + 1} abhaken`}${!st.done && !last && e.rest_s ? `<small>dann ${fmtRest(e.rest_s)} Pause</small>` : ""}</button>
    ${st.done ? `<button type="button" class="sxlink" data-act="undo">Haken entfernen</button>` : rm ? `<button type="button" class="sxlink" data-act="rmset">Satz ${k + 1} entfernen</button>` : ""}
  </div>`;
}
// Kopf einer Übung (Vorgabe, Pause, RPE, Technik, Letztes Mal, Alternativen) – Heute und Tagesansicht der Woche
// live = { swap: Alternative wählbar, ids: Übungen der Einheit } → Alternativen als Knöpfe, sonst nur als Text
function exInfoHtml(e, i, needs, status = "", live = null) {
  const ps = Array.isArray(e.per_set) && e.per_set.some(x => x != null) ? e.per_set : null;
  const wTxt = ps && new Set(ps).size > 1 ? ps.map(x => x == null ? "–" : kg(x)).join("/") : e.weight_kg != null ? kg(e.weight_kg) : ps ? kg(ps.find(x => x != null)) : null;
  const rx = `${nf(e.sets)} × ${esc(e.reps ?? "–")}${wTxt != null ? ` @ ${wTxt} kg` : ((needs || []).includes(e.id) && e.weight_type !== "bodyweight" ? " @ ? kg" : "")}`;
  const meta = [e.rest_s ? `Pause ${fmtRest(e.rest_s)}` : "", e.rpe_target != null ? `Ziel: ${esc(rpeTxt(e.rpe_target))}` : ""].filter(Boolean);
  const L = e.last && (e.last.sets || []).length ? e.last : null;
  const alts = altList(e).filter(a => !live || a.id === e.orig || !live.ids.has(a.id));
  const instead = e.orig ? `Statt <b>${esc(e.origName)}</b> · ` : "";
  const altH = !alts.length ? "" : live && live.swap
    ? `<div class="sxalt sxaltl">${ICX.swap}<div><span>${instead}Alternative nehmen:</span><div class="sxaltb">${alts.map(a => `<button type="button" class="sxchip" data-act="alt" data-alt="${esc(a.id)}" aria-label="Alternative nehmen: ${esc(a.name)}${a.id === e.orig ? " (laut Plan)" : ""}">${esc(a.name)}${a.id === e.orig ? " · Plan" : ""}</button>`).join("")}</div></div></div>`
    : `<div class="sxalt">${ICX.swap}<span>${instead}${e.orig ? "Weitere Alternativen" : "Alternativen"}: ${alts.map(a => esc(a.name)).join(", ")}</span></div>`;
  return `<div class="sxh"><span class="sxn">${i + 1}</span><div class="sxt"><b>${esc(e.name || nameOf(e.id))}</b><div class="sxrx num">${rx}</div></div>${status}</div>
    ${meta.length ? `<div class="sxmeta">${meta.join(" · ")}</div>` : ""}
    ${e.note ? `<p class="sxnote">${esc(e.note)}</p>` : ""}
    ${e.weight_note ? `<p class="sxwn">${esc(e.weight_note)}</p>` : ""}
    ${L ? `<div class="sxlast">${ICX.clock}<span>Letztes Mal${L.date ? ` · ${esc(dShort(L.date))}` : ""}: <b>${esc(setsTxt(L.sets))}</b>${maxRpe(L.sets) != null ? ` · Anstrengung ${kg(maxRpe(L.sets))}/10` : ""}</span></div>` : ""}
    ${altH}`;
}
function exHtml(e, i, S) {
  const s = exState(e), done = s.sets.filter(x => x.done).length, all = done === s.sets.length;
  const open = D.open && D.open.ex === e.id ? D.open.set : null, nm = esc(e.name || nameOf(e.id));
  const warnQ = s.qwhy === "key" || s.qwhy === "bad";
  const status = s.queued ? `<span class="pill${warnQ ? " warn" : ""}">${warnQ ? ICX.key : ""}${qOf(s.qwhy).pill}</span>` : s.saved && !s.dirty ? `<span class="pill ok">${ICX.check}gespeichert</span>` : done ? `<span class="pill">${done}/${s.sets.length}</span>` : "";
  return `<li class="sxe${all ? " all" : ""}" data-ex="${esc(e.id)}">
    ${exInfoHtml(e, i, TD_NEEDS(), status, { swap: !done, ids: new Set(S.exercises.map(x => x.id)) })}
    <div class="sxsets" role="group" aria-label="Sätze ${nm}">${s.sets.map((x, k) => `<button type="button" class="sxset${x.done ? " done" : ""}${open === k ? " on" : ""}" data-act="open" data-set="${k}" aria-pressed="${open === k}" aria-label="Satz ${k + 1}${x.done ? ", erledigt" : ""}">
      <span class="k">${x.done ? ICX.check : k + 1}</span><span class="v num">${x.reps != null ? kg(x.reps) : "–"}${x.weight_kg != null ? `<small>×</small>${kg(x.weight_kg)}` : ""}</span></button>`).join("")}<button type="button" class="sxset sxplus" data-act="addset" aria-label="Satz hinzufügen: ${nm}">${ICX.plus}<span>Satz</span></button></div>
    ${open != null && s.sets[open] ? editorHtml(e, s, open) : ""}
    ${e.extra && !done ? `<button type="button" class="sxlink sxrmex" data-act="rmex">${ICX.trash}Übung entfernen</button>` : ""}
    <details class="sxnotebox"${s.note ? " open" : ""}><summary>${ICX.note}Notiz${s.note ? "" : " <span class=\"muted\">optional</span>"}</summary>
      <textarea data-f="note" rows="2" maxlength="300" placeholder="z. B. Knie leicht gezogen, nächstes Mal mehr Gewicht">${esc(s.note || "")}</textarea></details>
  </li>`;
}
let NEEDS = [];
const TD_NEEDS = () => NEEDS;
const pendOf = S => (S ? S.exercises : []).filter(e => { const s = D.ex[e.id]; return s && s.sets.some(x => x.done) && (s.dirty || !s.saved) && !s.queued; });
const canBeep = () => !!(window.AudioContext || window.webkitAudioContext), canSpeak = () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
function footHtml(S) {
  const ex = S ? S.exercises : [];
  const pend = pendOf(S);
  const any = ex.some(e => D.ex[e.id] && D.ex[e.id].sets.some(x => x.done));
  const msg = !web() ? hint("", ICX.info, LOCAL_HINT) : MSG.html ? hint(MSG.kind, MSG.kind === "ok" ? ICX.check : MSG.icon || (MSG.kind === "queued" ? ICX.clock : ICX.warning), MSG.html) : "";
  const qd = ex.map(e => D.ex[e.id]).filter(s => s && s.queued);
  const qwhy = ["key", "bad", "busy"].find(k => qd.some(s => s.qwhy === k)) || "net";
  const label = saving ? "Speichere …" : pend.length ? `Training speichern · ${pend.length} ${pend.length === 1 ? "Übung" : "Übungen"}` : qd.length ? qOf(qwhy).label : any ? "Alles gespeichert" : "Training speichern";
  const snd = canBeep() || canSpeak() ? `<div class="sxsnd" role="group" aria-label="Signal am Ende der Pause"><span class="muted">Signal am Pausenende</span>
      ${canBeep() ? `<button type="button" class="sxchip" data-act="snd" data-k="beep" aria-pressed="${!!SND.beep}">Ton</button>` : ""}
      ${canSpeak() ? `<button type="button" class="sxchip" data-act="snd" data-k="speak" aria-pressed="${!!SND.speak}">Ansage</button>` : ""}</div>` : "";
  return `<div class="sxfoot"><button type="button" class="btn" data-act="save"${!web() || saving || !pend.length ? " disabled" : ""}>${label}</button>
    <span class="muted">${any ? "" : "Sätze antippen, Werte prüfen, abhaken."}</span></div>${snd}${msg}`;
}
function addRowHtml(bid) {
  const names = [...new Set(Object.values(NAMES))].sort((a, b) => a.localeCompare(b, "de"));
  return `<div class="sxaddex"><input data-f="newex" list="${bid}Names" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" maxlength="60" placeholder="Übung, z. B. Kniebeuge" aria-label="Übung hinzufügen">
      <button type="button" class="txtbtn" data-act="addex">${ICX.plus}Hinzufügen</button></div>
    <datalist id="${bid}Names">${names.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
}
function sessionHtml(S, bid) {
  const done = S.exercises.filter(e => D.ex[e.id] && D.ex[e.id].sets.length && D.ex[e.id].sets.every(x => x.done)).length;
  const anyDone = S.exercises.some(e => D.ex[e.id] && D.ex[e.id].sets.some(x => x.done));
  const R = (TD() && TD().recommendation) || {}, sub = S.free ? "Heute nicht geplant – trag ein, was du machst. Zählt für Verlauf und Gewichtsvorschläge."
    : [S.title && S.title !== R.title ? S.title : "", S.focus].filter(Boolean).map(esc).join(" · ");
  const needs = NEEDS.length ? `<a class="sxneed" href="#mehr/kraftbasis">${ICX.target}<span><b>Bestandsaufnahme fehlt für ${NEEDS.length === 1 ? "1 Übung" : NEEDS.length + " Übungen"}</b>
      ${NEEDS.slice(0, 3).map(id => esc(nameOf(id))).join(", ")}${NEEDS.length > 3 ? " …" : ""} – sag Garvis kurz, was du schaffst (2 Minuten), dann passen die Gewichte.</span>${IC.chev}</a>` : "";
  return `<div class="sxhead"><h4 class="chead">${ICX.gym}${S.free ? "Freies Krafttraining" : "Übungen"}<span class="r muted num">${done}/${S.exercises.length} erledigt</span></h4>
      ${sub ? `<div class="sxsub">${sub}</div>` : ""}</div>
    ${needs}
    ${S.exercises.length ? `<ol class="sxlist">${S.exercises.map((e, i) => exHtml(e, i, S)).join("")}</ol>` : `<p class="note sxempty">Noch keine Übung – unten eintragen und hinzufügen.</p>`}
    ${addRowHtml(bid)}
    ${S.free && !anyDone ? `<button type="button" class="sxlink" data-act="freeoff">Freies Training abbrechen</button>` : ""}
    <div class="sxfootw">${footHtml(S)}</div>`;
}
const freeStartHtml = () => `<div class="sxfree"><button type="button" class="morebtn sxadd" data-act="freeon">${ICX.gym}Freies Krafttraining heute</button>
  <p class="muted">Heute steht kein Krafttraining im Plan – trotzdem im Studio? Übungen und Sätze direkt eintragen.</p></div>`;
const drawBox = box => { const S = liveS(); box.innerHTML = S ? sessionHtml(S, box.id) : freeStartHtml(); };
function planHook(host) {
  if (!todayS()) return;  // ohne Kraftplan: „Freies Krafttraining heute“ (todayHook)
  const S = liveS();
  NEEDS = (S.needs_baseline || []).filter(Boolean);
  const box = document.createElement("div");
  box.className = "sx"; box.id = "sxBox";
  host.insertBefore(box, host.querySelector(".wprof") || host.querySelector("details.more"));
  drawBox(box);
  bindSession(box);
}
function rerenderEx(box, id) {
  const S = liveS();
  if (!S) return drawBox(box);
  const i = S.exercises.findIndex(e => e.id === id), li = box.querySelector(`.sxe[data-ex="${CSS.escape(id)}"]`);
  if (i < 0 || !li) return;
  li.outerHTML = exHtml(S.exercises[i], i, S);
  const head = box.querySelector(".sxhead .r");
  if (head) head.textContent = `${S.exercises.filter(e => D.ex[e.id] && D.ex[e.id].sets.every(x => x.done)).length}/${S.exercises.length} erledigt`;
  refreshFoot(box, S);
}
const refreshFoot = (box, S = liveS()) => { const f = box.querySelector(".sxfootw"); if (f && S) f.innerHTML = footHtml(S); };
const readEditor = (ed, st) => {
  ed.querySelectorAll("input[data-f]").forEach(inp => {
    const v = parseNum(inp.value), f = inp.dataset.f;
    if (f === "reps") st.reps = v == null ? null : Math.max(0, Math.round(v));
    else if (f === "w") st.weight_kg = v == null || v <= 0 ? null : round(v);
    else if (f === "rpe") st.rpe = v == null ? null : Math.max(1, Math.min(10, Math.round(v * 2) / 2));
  });
};
const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
// Element sichtbar machen (über der Tab-Leiste/dem Timer); „Bewegung reduzieren“ → ohne Animation
const reveal = el_ => { if (!el_ || !el_.scrollIntoView) return; const r = el_.getBoundingClientRect(); if (r.bottom > innerHeight - 90 || r.top < 60) el_.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" }); };
const focusSel = (box, sel) => { const n = box.querySelector(sel); if (n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } } return n; };
function addEx(box) {
  const inp = box.querySelector('[data-f="newex"]'), name = inp ? inp.value.trim() : "";
  if (!name) { if (inp) inp.focus(); return; }
  const id = idFor(name), S = liveS();
  if (S && S.exercises.some(e => e.id === id)) { inp.value = ""; toastS(`„${nameOf(id)}“ ist schon in der Liste`); return reveal(box.querySelector(`.sxe[data-ex="${CSS.escape(id)}"]`)); }
  NAMES[id] = NAMES[id] || name; writeLocal(NAMES_KEY, NAMES);
  const L = lastOf(id), top = L && L.sets.length ? sessionStat({ sets: L.sets }).top : null;
  D.extra.push({ id, name: NAMES[id], sets: L && L.sets.length ? Math.min(6, L.sets.length) : 3, reps: top && top.reps ? top.reps : 10, rest_s: 90 });
  D.open = { ex: id, set: 0 }; saveDraft(); wakeOn();
  drawBox(box);
  const li = box.querySelector(`.sxe[data-ex="${CSS.escape(id)}"]`);
  reveal(li && li.querySelector(".sxed"));
  focusSel(box, `.sxe[data-ex="${CSS.escape(id)}"] .sxset`);
}
function bindSession(box) {
  const exOf = el_ => { const li = el_.closest(".sxe"), S = li && liveS(); return S && S.exercises.find(e => e.id === li.dataset.ex); };
  box.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.f === "newex") { e.preventDefault(); addEx(box); } });
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b || !box.contains(b) || b.disabled) return;
    const act = b.dataset.act;
    primeAudio();  // Nutzer-Geste: Ton/Ansage für das Pausenende freischalten (iOS)
    if (act === "freeon") { ensureDraft(); D.free = true; saveDraft(); drawBox(box); return focusSel(box, '[data-f="newex"]'); }
    if (act === "freeoff") {
      D.free = false; D.extra = D.extra.filter(x => D.ex[x.id] && D.ex[x.id].sets.some(y => y.done)); D.open = null; saveDraft(); wakeOff();
      if (box.id === "sxBox") { box.remove(); return; }   // Startseite: nach dem Abbrechen nichts mehr zeigen
      drawBox(box); return focusSel(box, '[data-act="freeon"]');
    }
    if (act === "snd") {
      const k = b.dataset.k; SND[k] = !SND[k]; writeLocal(SND_KEY, SND);
      if (SND[k]) { primeAudio(); if (k === "beep") beep(); else say("Ansage an"); }
      refreshFoot(box); return focusSel(box, `[data-act="snd"][data-k="${k}"]`);
    }
    if (act === "save") return saveSession(box);
    if (act === "addex") return addEx(box);
    const ex = exOf(b);
    if (!ex) return;
    wakeOn();  // Training läuft → Bildschirm bleibt an
    const s = exState(ex), ed = b.closest(".sxed") || box.querySelector(`.sxe[data-ex="${CSS.escape(ex.id)}"] .sxed`);
    const sel = `.sxe[data-ex="${CSS.escape(ex.id)}"]`;
    const openSet = k => {  // Editor für Satz k öffnen (ein anderer offener Editor wird geschlossen)
      D.open = k == null ? null : { ex: ex.id, set: k };
      const prev = box.querySelector(".sxed"), prevId = prev && prev.closest(".sxe").dataset.ex;
      saveDraft();
      if (prevId && prevId !== ex.id) rerenderEx(box, prevId);
      rerenderEx(box, ex.id);
      reveal(box.querySelector(`${sel} .sxed`));
    };
    if (act === "open") { const k = +b.dataset.set; openSet(D.open && D.open.ex === ex.id && D.open.set === k ? null : k); return focusSel(box, `${sel} .sxset[data-set="${k}"]`); }
    if (act === "close") { D.open = null; saveDraft(); rerenderEx(box, ex.id); return focusSel(box, `${sel} .sxset`); }
    if (act === "addset") {
      const p = s.sets[s.sets.length - 1] || { reps: topOf(ex.reps), weight_kg: null, rpe: null };
      s.sets.push({ reps: p.reps, weight_kg: p.weight_kg, rpe: p.rpe, done: false });
      openSet(s.sets.length - 1);
      return focusSel(box, `${sel} .sxed .sxdone`);
    }
    if (act === "alt") {  // Alternative aus dem Plan nehmen (nur solange für diese Übung noch kein Satz abgehakt ist)
      if (s.sets.some(x => x.done)) return;
      const orig = ex.orig || ex.id, to = b.dataset.alt, a = altList(ex).find(x => x.id === to);
      if (!to || !a) return;
      if (to === orig) delete D.swap[orig]; else { D.swap[orig] = to; NAMES[to] = NAMES[to] || a.name; writeLocal(NAMES_KEY, NAMES); }
      delete D.ex[ex.id]; D.open = null; saveDraft();
      drawBox(box);
      toastS(to === orig ? `Zurück zu ${a.name}` : `${a.name} statt ${ex.orig ? ex.origName : ex.name || nameOf(ex.id)}`);
      return focusSel(box, `.sxe[data-ex="${CSS.escape(to)}"] .sxset`);
    }
    if (act === "rmex") {
      if (s.sets.some(x => x.done)) return;
      const item = D.extra.find(x => x.id === ex.id), st = D.ex[ex.id];
      D.extra = D.extra.filter(x => x.id !== ex.id); delete D.ex[ex.id]; D.open = null; saveDraft();
      drawBox(box);
      if (item) toastS(`„${item.name}“ entfernt`, () => { ensureDraft(); D.extra.push(item); if (st) D.ex[item.id] = st; saveDraft(); A.rerender(); });
      return focusSel(box, '[data-f="newex"]');
    }
    if (act === "inc" || act === "dec") {
      const inp = b.parentElement.querySelector("input"), f = b.dataset.f, up = act === "inc";
      let v = parseNum(inp.value);
      if (f === "reps") v = Math.max(0, (v ?? 0) + (up ? 1 : -1));
      else if (f === "rpe") v = v == null ? (up ? 7 : null) : Math.max(1, Math.min(10, v + (up ? 0.5 : -0.5)));
      else {  // Gewicht: sinnvolle Schritte je nach Größe; unter 0 = Körpergewicht (leer)
        if (v == null) v = up ? wStep(0) * 2 : null;
        else { const st = up ? wStep(v) : wStep(v - 0.001); v = round(Math.round((v + (up ? st : -st)) / st) * st); if (v <= 0) v = null; }
      }
      inp.value = v == null ? "" : kg(v);
      const k = +ed.dataset.set;
      readEditor(ed, s.sets[k]);
      if (s.sets[k].done) { touch(s); refreshFoot(box); }
      saveDraft();
      return;
    }
    if (act === "done") {
      const k = +ed.dataset.set, st = s.sets[k], was = st.done;
      readEditor(ed, st);
      st.done = true; touch(s); MSG = { kind: "", html: "" };
      const next = s.sets.findIndex((x, j) => j > k && !x.done);
      if (!was && next >= 0) Object.assign(s.sets[next], { reps: st.reps, weight_kg: st.weight_kg, rpe: s.sets[next].rpe ?? st.rpe });
      D.open = !was && next >= 0 ? { ex: ex.id, set: next } : null;
      saveDraft();
      rerenderEx(box, ex.id);
      if (!was) {
        const S = liveS(), lastOverall = next < 0 && S.exercises.every(x => x.id === ex.id || (D.ex[x.id] && D.ex[x.id].sets.every(y => y.done)));
        if (ex.rest_s && !lastOverall) startTimer(ex.rest_s, next >= 0 ? `${ex.name || nameOf(ex.id)} · Satz ${next + 1}` : "Nächste Übung");
      }
      return focusSel(box, D.open ? `${sel} .sxed .sxdone` : `${sel} .sxset`);
    }
    if (act === "undo") {
      const k = +ed.dataset.set;
      s.sets[k].done = false; touch(s);
      saveDraft(); rerenderEx(box, ex.id);
      return;
    }
    if (act === "rmset") {
      const k = +ed.dataset.set;
      if (!s.sets[k] || s.sets[k].done || s.sets.length <= (ex.extra ? 1 : planN(ex))) return;
      s.sets.splice(k, 1); D.open = null; saveDraft(); rerenderEx(box, ex.id);
      return focusSel(box, `${sel} .sxplus`);
    }
  });
  box.addEventListener("input", e => {
    const inp = e.target;
    if (inp.dataset.f === "newex") return;
    const ex = exOf(inp);
    if (!ex) return;
    const s = exState(ex);
    if (inp.dataset.f === "note") { s.note = inp.value; if (s.sets.some(x => x.done)) touch(s); saveDraft(); refreshFoot(box); return; }
    const ed = inp.closest(".sxed");
    if (ed) {
      const st = s.sets[+ed.dataset.set]; readEditor(ed, st);
      if (st.done) { touch(s); refreshFoot(box); }
      saveDraft();
    }
  });
}
async function saveSession(box) {
  if (saving || !web()) return;
  const date = ensureDraft().date, S = liveS();
  const list = pendOf(S);
  if (!list.length) return;
  const entries = list.map(e => {
    const s = D.ex[e.id];
    return { date, exercise_id: e.id, sets: s.sets.filter(x => x.done).map(x => ({ reps: x.reps, weight_kg: x.weight_kg, rpe: x.rpe })), note: (s.note || "").trim() || null };
  });
  saving = true; MSG = { kind: "", html: "" }; refreshFoot(box, S);
  const res = await serial(() => sendLog(entries));
  saving = false;
  const k = res.ok ? null : failKind(res.r);
  if (res.ok) {
    list.forEach(e => Object.assign(D.ex[e.id], { saved: true, dirty: false, queued: false }));
    MSG = { kind: "ok", html: "<b>Gespeichert</b> – fließt in die nächste Empfehlung ein." };
  } else if (k) {  // nie verwerfen: im Puffer ablegen, später automatisch senden
    enqueue({ kind: "log", entries }, k, res.r ? res.r.status : null);
    list.forEach(e => Object.assign(D.ex[e.id], { saved: true, dirty: false, queued: true, qwhy: k }));
    MSG = { kind: "queued", icon: k === "key" ? ICX.key : ICX.clock, html: queuedHtml(k, res.r) };
    if (k === "busy") { clearTimeout(retryT); retryT = setTimeout(flush, 60000); }
  } else MSG = { kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) + " Deine Sätze bleiben auf dem Gerät – später erneut speichern." };
  saveDraft();
  if (!pendOf(liveS()).length) wakeOff();  // Einheit gesichert → Bildschirm darf wieder ausgehen
  drawBox(box);
}

// ---------- Bildschirm an lassen (Screen Wake Lock) während des Trainings ----------
// Ab dem ersten Antippen in der Übungsliste bis zum Speichern; das System gibt die Sperre beim Verlassen der App frei →
// beim Zurückkommen neu anfordern. Sicherheitsnetz: nach 20 min ohne Eingabe wieder freigeben (Akku).
const WL = { want: false, lock: null, req: false, idle: null };
async function acquireWake() {
  if (!WL.want || WL.lock || WL.req || !navigator.wakeLock || document.visibilityState !== "visible") return;
  WL.req = true;
  try {
    const l = await navigator.wakeLock.request("screen");
    if (!WL.want) { l.release().catch(() => {}); return; }
    WL.lock = l; l.addEventListener("release", () => { if (WL.lock === l) WL.lock = null; });
  } catch (e) { /* nicht erlaubt (z. B. Stromsparmodus) – Timer funktioniert trotzdem */ } finally { WL.req = false; }
}
function wakeOn() { WL.want = true; clearTimeout(WL.idle); WL.idle = setTimeout(wakeOff, 20 * 60000); acquireWake(); }
function wakeOff() { WL.want = false; clearTimeout(WL.idle); const l = WL.lock; WL.lock = null; if (l) l.release().catch(() => {}); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") acquireWake(); });

// ---------- Signal am Pausenende: kurzer Ton (Web Audio) und optional Ansage („Pause vorbei“) ----------
// iOS hat kein navigator.vibrate; Audio muss in einer Nutzer-Geste freigegeben werden (primeAudio beim Antippen).
// Hinweis: Mit dem Stummschalter des iPhones bleibt der Ton aus – die Anzeige und die Bildschirmleser-Meldung kommen trotzdem.
const SND_KEY = "garvis.strength.sound";
const SND = Object.assign({ beep: true, speak: false }, readLocal(SND_KEY) || {});
let AC = null, spoken = false;
function primeAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (SND.beep && Ctx) { if (!AC) AC = new Ctx(); if (AC.state !== "running") AC.resume().catch(() => {}); }
    if (SND.speak && canSpeak() && !spoken) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); spoken = true; }
  } catch (e) { /* kein Audio */ }
}
function beep() {
  if (!AC || !SND.beep) return;
  try {
    if (AC.state !== "running") AC.resume().catch(() => {});
    const t0 = AC.currentTime + 0.03;
    [0, 0.3].forEach((d, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
      o.connect(g); g.connect(AC.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.25);
    });
  } catch (e) { /* kein Audio */ }
}
function say(txt) {
  if (!SND.speak || !canSpeak()) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = "de-DE"; u.rate = 1.05; speechSynthesis.speak(u); spoken = true; } catch (e) { /* keine Sprachausgabe */ }
}

// Pausen-Timer (eine schwebende Leiste über der Tab-Leiste; rechnet mit Endzeit → stimmt auch nach dem Sperren)
let TM = null;
function timerEl() {
  let n = $("sxTimer");
  if (n) return n;
  n = document.createElement("div");
  n.id = "sxTimer"; n.className = "sxtimer"; n.hidden = true;
  // role="timer" bleibt still (sonst jede Sekunde eine Ansage); die Meldung am Ende kommt über die eigene Live-Region (sayEl)
  n.innerHTML = `<div class="sxtm"><span class="ic0">${ICX.timer}</span><div class="sxtl"><span class="k">Pause</span><span class="lab"></span></div>
    <b class="tv num" role="timer" aria-live="off" aria-label="Restliche Pause"></b><button type="button" data-t="add" aria-label="30 Sekunden länger">+30 s</button><button type="button" data-t="stop">Fertig</button></div>
    <div class="sxtbar"><div></div></div>`;
  document.body.appendChild(n);
  n.addEventListener("click", e => {
    const b = e.target.closest("[data-t]");
    if (!b || !TM) return;
    primeAudio();
    if (b.dataset.t === "add") { clearTimeout(TM.hide); TM.end = Math.max(TM.end, Date.now()) + 30000; TM.total += 30; TM.over = false; n.classList.remove("over"); tick(); }
    else stopTimer();
  });
  return n;
}
// Live-Region außerhalb der Leiste: bleibt im DOM, auch wenn die Leiste ausgeblendet wird
function sayEl() {
  let n = $("sxTimerSay");
  if (!n) { n = document.createElement("div"); n.id = "sxTimerSay"; n.className = "vh"; n.setAttribute("aria-live", "polite"); n.setAttribute("aria-atomic", "true"); document.body.appendChild(n); }
  return n;
}
function startTimer(sec, label) {
  stopTimer();
  TM = { end: Date.now() + sec * 1000, total: sec, label, over: false };
  const n = timerEl();
  sayEl().textContent = "";
  n.querySelector(".lab").textContent = label;
  n.hidden = false; n.classList.remove("over");
  wakeOn();
  tick();
  TM.iv = setInterval(tick, 250);
}
function stopTimer() {
  if (TM) { clearInterval(TM.iv); clearTimeout(TM.hide); }
  TM = null;
  const n = $("sxTimer");
  if (n) n.hidden = true;
}
function tick() {
  if (!TM) return;
  const n = timerEl(), left = Math.max(0, Math.ceil((TM.end - Date.now()) / 1000));
  n.querySelector(".tv").textContent = clockS(left);
  n.querySelector(".sxtbar > div").style.width = `${Math.max(0, Math.min(100, left / TM.total * 100))}%`;
  if (left === 0 && !TM.over) {
    TM.over = true;
    n.classList.add("over");
    n.querySelector(".k").textContent = "Pause vorbei";
    n.querySelector(".tv").textContent = "Los";
    sayEl().textContent = `Pause vorbei. Weiter: ${TM.label}`;
    // Ton/Ansage nur, wenn das Ende gerade erst erreicht wurde (nicht verspätet beim Zurückkehren in die App)
    if (Date.now() - TM.end < 3000 && document.visibilityState === "visible") { beep(); say("Pause vorbei"); }
    TM.hide = setTimeout(stopTimer, 8000);
  } else if (!TM.over) n.querySelector(".k").textContent = "Pause";
}

// Woche › Tagesansicht: heute dieselbe Übungsliste mit Eintragen wie auf „Heute“, andere Tage nur Vorschau
// (Einträge gehen in den Entwurf des aktuellen Tages; vergangene Tage der Woche: Nachtragen-Formular, siehe backfillCard)
function dayHook(host, w, ctx) {
  const slot = host.querySelector('[data-slot="strength"]');
  const S = w && w.strength, ex = S && S.exercises || [];
  const past = !!w && /^\d{4}-\d{2}-\d{2}$/.test(w.date || "") && w.date < todayIso();
  if (past) {  // vergangener Tag: ungespeicherter Entwurf dieses Tages bzw. Nachtragen (nur laufende Woche)
    const p = prevDraft();
    if (p && p.date === w.date) prevCard(host.querySelector(".ds-head") ? host.querySelector(".ds-head").nextElementSibling || null : null, "sxPrevD");
    if (slot && ex.length) { slot.hidden = false; slot.innerHTML = `<div class="sx"><div class="sxhead"><h3 class="chead">${ICX.gym}Geplante Übungen<span class="r muted num">${ex.length}</span></h3></div>
      <ol class="sxlist">${ex.map((e, i) => `<li class="sxe">${exInfoHtml(e, i, [])}</li>`).join("")}</ol></div>`; }
    if (w.date >= weekMon()) backfillCard(host, w.date, S);
    return;
  }
  if (!slot) return;
  const live = ctx && ctx.today ? liveS() : null;  // heute: Plan bzw. bereits begonnenes freies Krafttraining
  if (live) {
    slot.hidden = false;
    NEEDS = (live.needs_baseline || []).filter(Boolean);
    const box = document.createElement("div");
    box.className = "sx"; box.id = "sxDay";
    slot.innerHTML = ""; slot.appendChild(box);
    drawBox(box);
    bindSession(box);
    return;
  }
  if (!ex.length) return;   // freies Krafttraining startet unter Mehr › Krafttraining
  slot.hidden = false;
  const needs = (S.needs_baseline || []).filter(Boolean);
  const sub = [S.title && S.title !== w.title ? S.title : "", S.focus].filter(Boolean).map(esc).join(" · ");
  slot.innerHTML = `<div class="sx"><div class="sxhead"><h3 class="chead">${ICX.gym}Übungen<span class="r muted num">${ex.length} Übungen${S.duration ? ` · ${nf(S.duration)} min` : ""}</span></h3>
      ${sub ? `<div class="sxsub">${sub}</div>` : ""}</div>
    ${needs.length ? hint("", ICX.target, `<b>Bestandsaufnahme fehlt für ${needs.length === 1 ? "1 Übung" : needs.length + " Übungen"}</b> – <a href="#mehr/kraftbasis">jetzt nachholen</a>, dann passen die Gewichte.`) : ""}
    <ol class="sxlist">${ex.map((e, i) => `<li class="sxe">${exInfoHtml(e, i, needs)}</li>`).join("")}</ol>
    ${hint("", ICX.info, "Eintragen geht am Trainingstag – auf „Heute“ oder hier in der Tagesansicht. Vergessen? Vergangene Tage dieser Woche lassen sich nachtragen (Woche › „Diese Woche bisher“).")}</div>`;
}

// =============================================================================================
// Einheit eines früheren Tages: ungespeicherter Entwurf („Einheit von gestern speichern?“) und Nachtragen
// =============================================================================================
const prevDraft = () => { const p = readLocal(PREV_KEY); return p && p.date && p.date < todayIso() && unsavedEx(p).length ? p : null; };
const prevEntries = p => unsavedEx(p).map(([id, s]) => ({ date: p.date, exercise_id: id, sets: s.sets.filter(x => x.done).map(x => ({ reps: x.reps, weight_kg: x.weight_kg, rpe: x.rpe })), note: (s.note || "").trim() || null }));
const PV = { msg: null, saving: false };
const whenTxt = d => d === addDay(todayIso(), -1) ? "von gestern" : `vom ${dShort(d)}`;
function prevHtml(p) {
  const E = prevEntries(p), n = E.reduce((a, e) => a + e.sets.length, 0);
  return `<h3 class="chead">${ICX.gym}Einheit ${esc(whenTxt(p.date))} speichern?</h3>
    <p class="desc" style="margin-bottom:0">${E.length === 1 ? "1 Übung" : E.length + " Übungen"} mit ${n} ${n === 1 ? "Satz" : "Sätzen"} abgehakt, aber noch nicht gespeichert: ${E.map(e => esc(nameOf(e.exercise_id))).join(", ")}.</p>
    <div class="formfoot" style="margin-top:12px"><button type="button" class="btn" data-pv="save"${!web() || PV.saving ? " disabled" : ""}>${PV.saving ? "Speichere …" : "Speichern"}</button>
      <button type="button" class="txtbtn" data-pv="drop"${PV.saving ? " disabled" : ""}>Verwerfen</button></div>
    ${!web() ? hint("", ICX.info, LOCAL_HINT) : PV.msg ? hint(PV.msg.kind, PV.msg.icon, PV.msg.html) : ""}`;
}
function prevCard(beforeEl, id = "sxPrev") {
  const old = $(id); if (old) old.remove();
  const p = prevDraft();
  if (!p || !beforeEl) return;
  const c = document.createElement("article");
  c.className = "card sxprev"; c.id = id; c.innerHTML = prevHtml(p);
  beforeEl.before(c);
}
async function savePrev() {
  const p = prevDraft();
  if (!p || PV.saving || !web()) return;
  const E = prevEntries(p);
  PV.saving = true; PV.msg = null; A.rerender();
  const res = await serial(() => sendLog(E));
  PV.saving = false;
  const k = res.ok ? null : failKind(res.r);
  if (res.ok) { localStorage.removeItem(PREV_KEY); toastS(`Einheit ${whenTxt(p.date)} gespeichert`); }
  else if (k) { enqueue({ kind: "log", entries: E }, k, res.r && res.r.status); localStorage.removeItem(PREV_KEY); toastS(queuedToast(k)); }  // Daten liegen jetzt im Puffer
  else PV.msg = { kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) };
  A.rerender();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-pv]");
  if (!b || b.disabled) return;
  if (b.dataset.pv === "save") return savePrev();
  const p = readLocal(PREV_KEY);
  localStorage.removeItem(PREV_KEY); PV.msg = null; A.rerender();
  if (p) toastS(`Einheit ${whenTxt(p.date)} verworfen`, () => { writeLocal(PREV_KEY, p); A.rerender(); });
});
function todayHook() {
  ensureDraft(); prevCard($("hPlan"));
  // Startseite zeigt nur das Tagestraining – freies Krafttraining liegt unter Mehr › Krafttraining
}

// Nachtragen für vergangene Tage der laufenden Woche (Tagesansicht): Übung, Sätze, Wiederholungen, Gewicht
const BF = {};  // je Datum: { rows: [{name, sets, reps, w, rpe}], msg, saving }
const idFor = name => { const n = String(name || "").trim().toLowerCase(); const hit = Object.entries(NAMES).find(([, v]) => String(v).trim().toLowerCase() === n); return hit ? hit[0] : slug(name).replace(/^ort$/, "uebung"); };
function bfState(date, S) {
  if (BF[date]) return BF[date];
  const ex = S && S.exercises || [];
  const rows = ex.length ? ex.map(e => ({ name: e.name || nameOf(e.id), sets: Math.max(1, Math.round(e.sets || 1)), reps: topOf(e.reps), w: e.weight_kg ?? null, rpe: null }))
    : [{ name: "", sets: 3, reps: null, w: null, rpe: null }];
  return (BF[date] = { rows, msg: null, saving: false });
}
function bfHtml(date, st) {
  const done = allEntries().filter(e => e.date === date);
  const dis = !web() || st.saving ? " disabled" : "";
  const num = (i, f, v, lbl, unit) => `<label class="sxbfv"><span>${lbl}</span><input data-bf="${f}" data-i="${i}" inputmode="decimal" autocomplete="off" value="${v == null ? "" : esc(kg(v))}" placeholder="–" aria-label="${lbl} (Übung ${i + 1})">${unit ? `<small>${unit}</small>` : ""}</label>`;
  return `<h3 class="chead">${ICX.gym}Krafttraining nachtragen</h3>
    <p class="desc">Vergessen einzutragen? Übungen mit Sätzen, Wiederholungen und Gewicht ergänzen – zählt für Verlauf und Gewichtsvorschläge.</p>
    ${done.length ? `<div class="sxbfdone"><div class="kicker">Schon eingetragen</div><ul>${done.map(e => `<li><b>${esc(nameOf(e.exercise_id))}</b> <span class="num">${esc(setsTxt(e.sets))}</span>${e.pending ? ` <span class="pill">wartet auf Verbindung</span>` : ""}</li>`).join("")}</ul></div>` : ""}
    <div class="sxbfrows">${st.rows.map((r, i) => `<div class="sxbfr">
      <div class="sxbfh"><label class="field"><span class="kicker">Übung ${i + 1}</span><input data-bf="name" data-i="${i}" list="sxBfNames" autocomplete="off" value="${esc(r.name)}" placeholder="z. B. Kniebeuge"></label>
        ${st.rows.length > 1 ? `<button type="button" class="iconbtn" data-bfa="del" data-i="${i}" aria-label="Übung ${i + 1} entfernen">${ICX.trash}</button>` : ""}</div>
      <div class="sxbfn">${num(i, "sets", r.sets, "Sätze", "")}${num(i, "reps", r.reps, "Wdh.", "")}${num(i, "w", r.w, "Gewicht", "kg")}${num(i, "rpe", r.rpe, "Anstr.", "/10")}</div></div>`).join("")}</div>
    <datalist id="sxBfNames">${[...new Set(Object.values(NAMES))].sort((a, b) => a.localeCompare(b, "de")).map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
    <button type="button" class="morebtn sxadd" data-bfa="add">${ICX.plus}Übung hinzufügen</button>
    <div class="formfoot" style="margin-top:12px"><button type="button" class="btn" data-bfa="save"${dis}>${st.saving ? "Speichere …" : "Einträge speichern"}</button></div>
    ${!web() ? hint("", ICX.info, LOCAL_HINT) : st.msg ? hint(st.msg.kind, st.msg.icon, st.msg.html) : ""}`;
}
async function bfSave(card, date) {
  const st = BF[date];
  if (!st || st.saving || !web()) return;
  const rows = st.rows.filter(r => String(r.name || "").trim() && r.sets > 0 && r.reps != null);
  if (!rows.length) { st.msg = { kind: "bad", icon: ICX.warning, html: "Mindestens eine Übung mit Namen, Sätzen und Wiederholungen eintragen." }; card.innerHTML = bfHtml(date, st); return; }
  const entries = rows.map(r => { const id = idFor(r.name); NAMES[id] = NAMES[id] || r.name.trim();
    return { date, exercise_id: id, sets: Array.from({ length: Math.min(20, Math.round(r.sets)) }, () => ({ reps: Math.round(r.reps), weight_kg: r.w, rpe: r.rpe })), note: null }; });
  writeLocal(NAMES_KEY, NAMES);
  st.saving = true; st.msg = null; card.innerHTML = bfHtml(date, st);
  const res = await serial(() => sendLog(entries));
  st.saving = false;
  const k = res.ok ? null : failKind(res.r);
  if (res.ok || k) {
    if (!res.ok) enqueue({ kind: "log", entries }, k, res.r && res.r.status);
    delete BF[date];
    toastS(res.ok ? `Nachgetragen für ${dShort(date)}` : queuedToast(k));
    return A.rerender();
  }
  st.msg = { kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) };
  card.innerHTML = bfHtml(date, st);
}
function backfillCard(host, date, S) {
  const st = bfState(date, S);
  const c = document.createElement("article");
  c.className = "card sxbf"; c.dataset.noswipe = "";
  c.innerHTML = bfHtml(date, st);
  const slot = host.querySelector('[data-slot="strength"]:not([hidden])') || host.querySelector(".acfbc") || host.querySelector(".ds-head") || host.firstElementChild;
  if (slot) slot.after(c); else host.appendChild(c);
  c.addEventListener("input", e => {
    const inp = e.target, i = +inp.dataset.i, r = st.rows[i], f = inp.dataset.bf;
    if (!r || !f) return;
    if (f === "name") r.name = inp.value;
    else { const v = parseNum(inp.value); r[f] = v == null ? null : f === "rpe" ? Math.max(1, Math.min(10, v)) : f === "w" ? (v > 0 ? round(v) : null) : Math.max(0, v); }
  });
  c.addEventListener("click", e => {
    const b = e.target.closest("[data-bfa]");
    if (!b || b.disabled) return;
    const a = b.dataset.bfa;
    if (a === "add") { st.rows.push({ name: "", sets: 3, reps: null, w: null, rpe: null }); c.innerHTML = bfHtml(date, st); const n = c.querySelectorAll('input[data-bf="name"]'); n[n.length - 1].focus(); return; }
    if (a === "del") { st.rows.splice(+b.dataset.i, 1); c.innerHTML = bfHtml(date, st); return; }
    if (a === "save") bfSave(c, date);
  });
  if (web() && !LS.loaded && !LS.loading) loadAll().then(() => { if (c.isConnected && !c.contains(document.activeElement)) c.innerHTML = bfHtml(date, st); });
}

// Woche: kurze Übungszeile in der Tageskarte
function weekHook(list, W) {
  const rows = list.querySelectorAll(".drow");
  (W || []).forEach((w, i) => {
    const S = w && w.strength, ex = S && S.exercises || [];
    if (!ex.length || !rows[i]) return;
    const card = rows[i].querySelector(".day");
    if (!card) return;
    const div = document.createElement("div");
    div.className = "sxwk";
    div.innerHTML = `${ICX.gym}<span><b>${ex.length} Übungen</b><br>${ex.slice(0, 4).map(e => esc(e.name || nameOf(e.id))).join(", ")}${ex.length > 4 ? " …" : ""}</span>`;
    card.insertBefore(div, card.querySelector(".badge"));
  });
}

// =============================================================================================
// Mehr › Krafttraining: Verlauf
// =============================================================================================
const LS = { loading: false, loaded: false, err: null };
async function loadAll() {
  if (!web() || LS.loading) return;
  LS.loading = true;
  const dir = await gh(fileUrl("logs/strength"));
  if (dir.status === 200 && Array.isArray(dir.body)) {
    const files = dir.body.map(f => f && f.name).filter(Boolean);
    const months = files.filter(n => /^\d{4}-\d\d\.json$/.test(n)).sort().slice(-24);
    const res = await Promise.all(months.map(n => getJson("logs/strength/" + n)));
    const next = {};
    months.forEach((n, i) => { const m = n.slice(0, 7); next[m] = res[i].ok ? (res[i].data && res[i].data.entries) || [] : C.months[m] || []; });
    C.months = next;
    if (files.includes("baseline.json")) { const b = await getJson("logs/strength/baseline.json"); if (b.ok) C.baseline = b.data || {}; }
    else C.baseline = {};
    C.at = Date.now(); saveCache(); LS.err = null;
  } else if (dir.status === 404) { C = { months: {}, baseline: {}, at: Date.now() }; saveCache(); LS.err = null; }
  else LS.err = errText(dir, "Laden des Verlaufs");
  LS.loading = false; LS.loaded = true;
}
// Alle bekannten Einträge: geladener Verlauf + noch nicht gesendete (Puffer); je Datum+Übung der neueste
function allEntries() {
  const map = new Map();
  Object.values(C.months || {}).flat().forEach(e => { if (e && e.date && e.exercise_id) map.set(e.date + "|" + e.exercise_id, { ...e }); });
  outbox().filter(o => o.kind === "log").flatMap(o => o.entries || []).forEach(e => map.set(e.date + "|" + e.exercise_id, { ...e, pending: true }));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function allBaseline() {
  const b = { ...(C.baseline || {}) };
  outbox().filter(o => o.kind === "baseline").forEach(o => Object.assign(b, o.data));
  return b;
}
let SEL = null;
function sessionStat(e) {
  const sets = (e.sets || []).filter(s => s && s.reps != null);
  const est = sets.map(s => ({ s, v: e1rm(s) })).filter(x => x.v != null).sort((a, b) => b.v - a.v)[0];
  const top = sets.slice().sort((a, b) => (b.weight_kg || 0) - (a.weight_kg || 0) || b.reps - a.reps)[0];
  return { est: est ? est.v : null, estSet: est ? est.s : null, top, maxReps: sets.length ? Math.max(...sets.map(s => s.reps)) : null, sets };
}
const KRAFT_HTML = `<h2>Krafttraining</h2><p class="sub">Freies Training, Verlauf je Übung und Bestandsaufnahme</p>
  <div class="card" id="sxFreeCard" style="margin-bottom:14px"></div>
  <div class="card menu-card" style="margin-bottom:14px"><div class="setrow" id="sxBaseRow"></div></div>
  <div id="sxStatus"></div>
  <div class="toolbar" id="sxPickBar"><div class="seg" id="sxPick" role="group" aria-label="Übung"></div></div>
  <div class="card" id="sxHist" style="margin-bottom:14px"></div>
  <div class="card" id="sxRecent"></div>`;
function renderKraft() {
  const sec = $("kraft");
  if (!sec.dataset.built) { sec.innerHTML = KRAFT_HTML; sec.dataset.built = "1"; bindKraft(); }
  drawKraft();
  drawFreeCard();
  if (web() && !LS.loaded && !LS.loading) loadAll().then(() => { if (!$("kraft").hidden) drawKraft(); });
  flush();
}
// Mehr › Krafttraining: hier (und nur hier) startet ein freies Krafttraining an Tagen ohne Kraftplan
function drawFreeCard() {
  const card = $("sxFreeCard"); if (!card) return;
  if (todayS()) {   // heute steht Krafttraining im Plan → wird auf „Heute“ eingetragen
    card.innerHTML = `<div class="setrow"><span class="mi">${ICX.gym}</span><span><b>Heute steht Krafttraining im Plan</b><small>Sätze direkt auf „Heute“ eintragen</small></span><a class="txtbtn" href="#heute">Zu Heute</a></div>`;
    return;
  }
  let box = $("sxFree");
  if (!box) { card.innerHTML = ""; box = document.createElement("div"); box.className = "sx"; box.id = "sxFree"; card.appendChild(box); bindSession(box); }
  NEEDS = [];
  drawBox(box);
}
function bindKraft() {
  $("sxPick").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SEL = b.dataset.id; drawKraft(); });
}
function drawKraft() {
  const ent = allEntries(), base = allBaseline(), S = todayS();
  const planIds = plans(TD()).flatMap(p => (p.S.exercises || []).map(e => e.id));
  const ids = [...new Set([...planIds, ...Object.keys(base)])];
  const nBase = ids.filter(id => base[id]).length, needs = S ? (S.needs_baseline || []) : [];
  $("sxBaseRow").innerHTML = `<span class="mi">${ICX.target}</span><span><b>Bestandsaufnahme</b><small>${needs.length ? `Fehlt noch für ${needs.length} ${needs.length === 1 ? "Übung" : "Übungen"} · ` : ""}${nBase ? `${nBase} ${nBase === 1 ? "Übung" : "Übungen"} erfasst` : "Startgewichte für die Empfehlung"}</small></span>
    <a class="txtbtn" href="#mehr/kraftbasis">${nBase ? "Bearbeiten" : "Starten"}</a>`;
  const pend = outbox().length;
  $("sxStatus").innerHTML = [
    !web() ? hint("", ICX.info, "Lokal geöffnet (Datei) – der Verlauf aus garvis-data lässt sich nur in der Garvis-App laden." + (C.at ? " Angezeigt wird der zuletzt in diesem Browser geladene Stand." : "")) : "",
    LS.loading && !C.at ? hint("", ICX.clock, "Lade Verlauf …") : "",
    LS.err ? hint("bad", ICX.warning, esc(LS.err) + (C.at ? " Angezeigt wird der zuletzt geladene Stand." : "")) : "",
    pend ? outHint() : "",
  ].join("");
  // Übungen mit Verlauf: zuletzt trainierte zuerst
  const byEx = {};
  ent.forEach(e => (byEx[e.exercise_id] ||= []).push(e));
  const ord = id => { const i = planIds.indexOf(id); return i < 0 ? 999 : i; };
  const exIds = Object.keys(byEx).sort((a, b) => byEx[b].at(-1).date.localeCompare(byEx[a].at(-1).date) || ord(a) - ord(b) || nameOf(a).localeCompare(nameOf(b)));
  Object.keys(base).forEach(id => { if (!byEx[id]) exIds.push(id); });
  if (!exIds.includes(SEL)) SEL = exIds[0] || null;
  $("sxPickBar").hidden = exIds.length < 2;
  $("sxPick").innerHTML = exIds.map(id => `<button data-id="${esc(id)}" aria-pressed="${id === SEL}">${esc(nameOf(id))}</button>`).join("");
  drawHist(SEL, byEx[SEL] || [], base[SEL]);
  drawRecent(ent);
}
function drawHist(id, list, b) {
  const host = $("sxHist");
  if (!id) {
    host.innerHTML = `<h3>Verlauf je Übung</h3><div class="empty">Noch keine Einträge – trage deine Sätze auf „Heute“ ein, dann entsteht hier der Verlauf.</div>`;
    return;
  }
  const stats = list.map(e => ({ e, ...sessionStat(e) }));
  const weighted = stats.some(s => s.est != null) || (b && b.weight_kg);
  const val = s => weighted ? s.est : s.maxReps;
  const unit = weighted ? "kg" : "Wdh.";
  const fmtV = v => v == null ? "–" : weighted ? `${kg(round(v, 1))} kg` : `${kg(v)} Wdh.`;
  const pts = stats.filter(s => val(s) != null).map(s => ({ x: t(s.e.date), y: round(val(s), 1),
    extra: [{ k: "Sätze", v: setsTxt(s.sets) }, ...(maxRpe(s.sets) != null ? [{ k: "RPE max.", v: kg(maxRpe(s.sets)) }] : []), ...(s.e.pending ? [{ k: "Status", v: "noch nicht gesendet" }] : [])] }));
  const bv = b && b.reps ? (weighted ? e1rm({ weight_kg: b.weight_kg, reps: b.reps }) : b.reps) : null;
  if (bv != null && b.date && !pts.some(p => p.x === t(b.date))) pts.push({ x: t(b.date), y: round(bv, 1), extra: [{ k: "Bestandsaufnahme", v: `${kg(b.reps)} × ${b.weight_kg != null ? kg(b.weight_kg) + " kg" : "KG"}` }] });
  pts.sort((a, c) => a.x - c.x);
  const cur = pts.at(-1), first = pts[0];
  const d = cur && first && cur !== first ? cur.y - first.y : null;
  const top = stats.length ? stats.at(-1).top : null;
  host.innerHTML = `<h3>${esc(nameOf(id))}</h3>
    <p class="desc">${weighted ? "Geschätztes Maximalgewicht (1RM) aus dem besten Satz je Einheit · Epley-Formel, nur Sätze bis 12 Wdh." : "Meiste Wiederholungen je Einheit"}</p>
    <div class="sxtiles">
      <div class="rstat"><div class="fl">${weighted ? "1RM geschätzt" : "Bester Satz"}</div><div class="v">${cur ? `${kg(cur.y)}<small>${unit}</small>` : "–"}</div><div class="foot">${cur ? esc(fmtDate(cur.x)) : ""}</div></div>
      <div class="rstat"><div class="fl">Veränderung</div><div class="v">${d == null ? "–" : `<span class="${d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${kg(Math.abs(round(d, 1)))}</span><small>${unit}</small>`}</div><div class="foot">${d == null ? "ab 2 Einheiten" : `seit ${esc(fmtDate(first.x))}`}</div></div>
      <div class="rstat"><div class="fl">Letzter Top-Satz</div><div class="v">${top ? `${kg(top.reps)}<small>×</small>${top.weight_kg != null ? `${kg(top.weight_kg)}<small>kg</small>` : "<small>KG</small>"}` : "–"}</div><div class="foot">${stats.length ? esc(fmtDate(t(stats.at(-1).e.date))) : ""}</div></div>
      <div class="rstat"><div class="fl">Einheiten</div><div class="v">${nf(stats.length)}</div><div class="foot">${b ? "plus Bestandsaufnahme" : ""}</div></div>
    </div>
    <div id="sxChart" style="margin-top:8px"></div>
    <details class="more"${stats.length && stats.length <= 6 ? " open" : ""}><summary>Alle Einheiten <span class="n">· ${stats.length}</span></summary>
      ${stats.length ? `<div class="tscroll" style="max-height:340px;margin-top:8px"><table class="sxtab"><thead><tr><th>Datum</th><th>Sätze</th><th class="n">RPE</th><th class="n">${weighted ? "1RM ≈" : "Max."}</th></tr></thead><tbody>
        ${stats.slice().reverse().map(s => `<tr><td>${esc(dShort(s.e.date))}${s.e.pending ? ' <span class="pill">offen</span>' : ""}</td><td>${esc(setsTxt(s.sets))}${s.e.note ? `<div class="sxtn">${esc(s.e.note)}</div>` : ""}</td><td class="n">${maxRpe(s.sets) != null ? kg(maxRpe(s.sets)) : "–"}</td><td class="n">${fmtV(val(s))}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="note">Bisher nur die Bestandsaufnahme.</p>`}
    </details>`;
  const ch = $("sxChart");
  if (pts.length) lineChart(ch, { series: [{ name: weighted ? "1RM geschätzt" : "Wiederholungen", color: "var(--s1)", pts }], height: 190, connect: true,
    yFmt: v => kg(v), tipFmt: v => fmtV(v), endFmt: v => fmtV(v), noLegend: true });
  else ch.innerHTML = `<div class="empty">Noch keine auswertbaren Sätze</div>`;
}
function drawRecent(ent) {
  const host = $("sxRecent");
  const days = {};
  ent.forEach(e => (days[e.date] ||= []).push(e));
  const ds = Object.keys(days).sort().reverse().slice(0, 8);
  host.innerHTML = `<h3>Letzte Einheiten</h3><p class="desc">${ds.length ? "Neueste zuerst" : ""}</p>
    ${ds.length ? `<ul class="rlist sxrl">${ds.map(d => `<li><div><b>${esc(dShort(d))}</b><span class="meta"> · ${days[d].length} ${days[d].length === 1 ? "Übung" : "Übungen"}</span>
      <ul>${days[d].map(e => `<li><span>${esc(nameOf(e.exercise_id))}</span><span class="num">${esc(setsTxt(e.sets))}${e.pending ? ' <span class="pill">offen</span>' : ""}</span></li>`).join("")}</ul></div></li>`).join("")}</ul>`
      : `<div class="empty">Noch keine Einheiten erfasst</div>`}`;
}

// =============================================================================================
// Mehr › Krafttraining › Bestandsaufnahme (logs/strength/baseline.json)
// =============================================================================================
const BS = { msg: null, saving: false, vals: {} };
function baseIds() {
  const S = todayS(), needs = S ? (S.needs_baseline || []) : [];
  const ids = [...needs, ...plans(TD()).flatMap(p => (p.S.exercises || []).map(e => e.id)), ...Object.keys(allBaseline())];
  return { ids: [...new Set(ids.filter(Boolean))], needs };
}
function renderBase() {
  const sec = $("kraftbasis");
  if (!sec.dataset.built) { buildBase(sec); sec.dataset.built = "1"; }
  drawBase();
  if (web() && !LS.loaded && !LS.loading) loadAll().then(() => { if (!$("kraftbasis").hidden) drawBase(); });
}
function buildBase(sec) {
  sec.innerHTML = `<h2>Bestandsaufnahme</h2>
    <p class="sub">Mit welchem Gewicht schaffst du wie viele saubere Wiederholungen?</p>
    <form class="card" id="sxBaseForm" novalidate>
      <p class="note" style="margin:0 0 6px">Ein Satz mit sauberer Technik, ohne Schwung – nicht bis zum Muskelversagen. Unbekannte Übungen einfach leer lassen. Garvis leitet daraus deine Startgewichte ab.</p>
      <div id="sxBaseList"></div>
      <div id="sxBaseMsg"></div>
      <div class="formfoot"><button type="submit" class="btn" id="sxBaseSave">Speichern</button><span class="muted" id="sxBaseState"></span></div>
    </form>`;
  const f = $("sxBaseForm");
  f.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const inp = b.parentElement.querySelector("input"), f_ = b.dataset.f, up = b.dataset.act === "inc";
    let v = parseNum(inp.value);
    if (f_ === "reps") v = Math.max(1, (v ?? 0) + (up ? 1 : -1));
    else { if (v == null) v = up ? 20 : null; else { const st = up ? wStep(v) : wStep(v - 0.001); v = round(Math.round((v + (up ? st : -st)) / st) * st); if (v <= 0) v = null; } }
    inp.value = v == null ? "" : kg(v);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  f.addEventListener("input", e => {
    const row = e.target.closest("[data-ex]");
    if (!row) return;
    const id = row.dataset.ex;
    BS.vals[id] = { w: row.querySelector('input[data-f="w"]').value, reps: row.querySelector('input[data-f="reps"]').value };
  });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (BS.saving || !web()) return;
    const upd = {}, bad = [], base = allBaseline(), date = todayIso();
    Object.entries(BS.vals).forEach(([id, v]) => {
      const w = parseNum(v.w), r = parseNum(v.reps);
      if (r == null && w == null) return;
      if (r == null || r < 1 || r > 50 || (w != null && (w < 0 || w > 500))) { bad.push(nameOf(id)); return; }
      const cur = { weight_kg: w ? round(w) : null, reps: Math.round(r) };
      const old = base[id];
      if (old && old.weight_kg === cur.weight_kg && old.reps === cur.reps) return;
      upd[id] = { ...cur, date };
    });
    if (bad.length) { BS.msg = { kind: "bad", icon: ICX.warning, html: `Bitte Wiederholungen (1–50) und ggf. Gewicht prüfen: ${bad.map(esc).join(", ")}` }; return drawBase(); }
    if (!Object.keys(upd).length) { BS.msg = { kind: "", icon: ICX.info, html: "Nichts geändert." }; return drawBase(); }
    BS.saving = true; BS.msg = null; drawBase();
    const res = await serial(() => sendBase(upd));
    BS.saving = false;
    if (res.ok) { BS.vals = {}; BS.msg = { kind: "ok", icon: ICX.check, html: "<b>Gespeichert</b> – fließt in die nächste Empfehlung ein." }; }
    else if (failKind(res.r)) { const k = failKind(res.r); enqueue({ kind: "baseline", data: upd }, k, res.r && res.r.status); BS.vals = {}; BS.msg = { kind: "queued", icon: k === "key" ? ICX.key : ICX.clock, html: queuedHtml(k, res.r) }; }
    else BS.msg = { kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) };
    drawBase();
  });
}
function drawBase() {
  const { ids, needs } = baseIds(), base = allBaseline();
  const exById = Object.fromEntries(plans(TD()).flatMap(p => p.S.exercises || []).map(e => [e.id, e]));
  const list = $("sxBaseList");
  list.innerHTML = ids.length ? ids.map(id => {
    const b = base[id], v = BS.vals[id], e = exById[id];
    const w = v ? v.w : b && b.weight_kg != null ? kg(b.weight_kg) : "", r = v ? v.reps : b && b.reps != null ? String(b.reps) : "";
    return `<div class="sxbrow" data-ex="${esc(id)}">
      <div class="sxbh"><b>${esc(nameOf(id))}</b>${needs.includes(id) && !b ? `<span class="pill warn">fehlt</span>` : b ? `<span class="pill ok">${ICX.check}${esc(dShort(b.date || todayIso()))}</span>` : ""}</div>
      ${e && (e.weight_note || e.note) ? `<p class="sxnote">${esc(e.weight_note || e.note)}</p>` : ""}
      <div class="sxbin">
        <div class="sxst"><span class="l">Gewicht</span><button type="button" class="sxpm" data-act="dec" data-f="w" aria-label="Gewicht weniger">${ICX.minus}</button>
          <label class="sxv"><input data-f="w" inputmode="decimal" autocomplete="off" value="${esc(w)}" placeholder="–" aria-label="Gewicht ${esc(nameOf(id))} in kg"><small>kg</small></label>
          <button type="button" class="sxpm" data-act="inc" data-f="w" aria-label="Gewicht mehr">${ICX.plus}</button></div>
        <div class="sxst"><span class="l">Wiederholungen</span><button type="button" class="sxpm" data-act="dec" data-f="reps" aria-label="Wiederholungen weniger">${ICX.minus}</button>
          <label class="sxv"><input data-f="reps" inputmode="numeric" autocomplete="off" value="${esc(r)}" placeholder="–" aria-label="Wiederholungen ${esc(nameOf(id))}"><small>Wdh.</small></label>
          <button type="button" class="sxpm" data-act="inc" data-f="reps" aria-label="Wiederholungen mehr">${ICX.plus}</button></div>
      </div></div>`;
  }).join("") : `<div class="empty">Noch keine Übungen bekannt – sobald Garvis eine Krafteinheit plant, erscheinen die Übungen hier.</div>`;
  $("sxBaseMsg").innerHTML = !web() ? hint("", ICX.info, LOCAL_HINT) : BS.msg ? hint(BS.msg.kind, BS.msg.icon, BS.msg.html) : "";
  $("sxBaseSave").disabled = !web() || BS.saving || !ids.length;
  $("sxBaseSave").textContent = BS.saving ? "Speichere …" : "Speichern";
  $("sxBaseState").textContent = LS.loading ? "Lade aktuellen Stand …" : "Leer = Körpergewicht";
}

// =============================================================================================
// Mehr › Einstellungen › Orte & Ausstattung (settings.json › locations)
// =============================================================================================
const EQUIP = [
  ["road_bike", "Rennrad draußen"], ["zwift", "Rolle/Zwift"], ["gym", "Fitnessstudio"], ["treadmill", "Laufband"],
  ["pool_indoor", "Hallenbad"], ["pool_outdoor", "Freibad"], ["open_water", "Meer/See"], ["run", "Laufen draußen"],
  ["dumbbells", "Kurzhanteln"], ["kettlebell", "Kettlebell"], ["bands", "Widerstandsbänder"], ["pullup_bar", "Klimmzugstange"],
];
const EQUIP_KEYS = EQUIP.map(e => e[0]);
// TODAY.location.equipment enthält die Kurznamen aus recommend.py (EQUIP_DE) → Schlüssel
const EQUIP_FROM_DE = { "Rad": "road_bike", "Rolle": "zwift", "Gym": "gym", "Laufband": "treadmill", "Hallenbad": "pool_indoor", "Freibad": "pool_outdoor", "Meer/See": "open_water", "Laufen": "run" };
const DEFAULT_EQUIP = ["road_bike", "zwift", "gym", "treadmill", "pool_indoor", "pool_outdoor", "run"];
function defaultLocations() {
  const L = TD() && TD().location;
  let eq = L && !L.travel && (L.equipment || []).length ? L.equipment.map(x => EQUIP_KEYS.includes(x) ? x : EQUIP_FROM_DE[x]).filter(Boolean) : null;
  if (!eq || !eq.length) eq = DEFAULT_EQUIP.slice();
  return [{ id: "muenchen", name: "München", lat: 48.137, lon: 11.575, radius_km: 25, home: true, equipment: EQUIP_KEYS.filter(k => eq.includes(k)) }];
}
const slug = s => String(s || "ort").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "ort";
const OS = { list: null, loaded: false, loading: false, dirty: false, saving: false, msg: null, geo: {}, updated: null };
const normLoc = l => ({ id: l.id || (l.name ? slug(l.name) : ""), name: String(l.name || ""), lat: l.lat ?? null, lon: l.lon ?? null, radius_km: l.radius_km ?? 25, home: !!l.home,
  equipment: Array.isArray(l.equipment) ? l.equipment.slice() : [] });
function renderOrte() {
  const sec = $("orte");
  if (!sec.dataset.built) { buildOrte(sec); sec.dataset.built = "1"; }
  if (!OS.list) { const loc = (readLocal(SET_KEY) || {}).locations; OS.list = (Array.isArray(loc) && loc.length ? loc : defaultLocations()).map(normLoc); }
  drawOrte(); drawGear();
  if (GE.scroll) { GE.scroll = false; setTimeout(() => $("sxGear").scrollIntoView({ block: "start" }), 80); }  // aus der Übersichtskarte „Ausrüstung“
  if (web() && !OS.loaded && !OS.loading) {
    OS.loading = true; drawOrteState();
    getJson("settings.json").then(r => {
      OS.loading = false;
      if (r.ok) {
        OS.loaded = true;
        const GA = window.GarvisActions, V = r.data && GA && GA.pendingSettings ? GA.pendingSettings(r.data) : r.data;   // inkl. offline gepufferter Änderungen
        const loc = V && V.locations;
        if (V) writeLocal(SET_KEY, V);
        if (GE.edit == null) GE.list = gearLocal();
        if (!OS.dirty) OS.list = (Array.isArray(loc) && loc.length ? loc : defaultLocations()).map(normLoc);
        OS.saved = Array.isArray(loc) && loc.length > 0;
        if (r.broken) OS.msg = { kind: "bad", icon: ICX.warning, html: "settings.json im Repo ist kein gültiges JSON – Speichern legt die Datei neu an." };
      } else OS.msg = { kind: "bad", icon: ICX.warning, html: esc(errText(r.r, "Laden des aktuellen Stands")) + " Du kannst trotzdem speichern." };
      if (!$("orte").hidden) { drawOrte(); drawGear(); }
      updateMenuSub(); drawGearOverview();
    });
  }
}
function buildOrte(sec) {
  sec.innerHTML = `<h2>Orte &amp; Ausstattung</h2>
    <p class="sub">Was Garvis an welchem Ort einplanen kann</p>
    <div class="hint" style="margin:0 0 14px">${ICX.info}<span>Reiseorte erkennt Garvis über Kalendertermine (z. B. „Urlaub Mallorca“) oder deinen Standort. Ist der Ort hier gespeichert, gilt seine Ausstattung automatisch.</span></div>
    <form id="sxLocForm" novalidate>
      <div class="sxlocs" id="sxLocs"></div>
      <button type="button" class="morebtn sxadd" data-act="add">${ICX.plus}Ort hinzufügen</button>
      <div class="card" style="margin-top:14px"><div id="sxLocMsg"></div>
        <div class="formfoot" style="margin-top:0"><button type="submit" class="btn" id="sxLocSave">Speichern</button><span class="muted" id="sxLocState"></span></div></div>
    </form>`;
  buildGear(sec);
  const f = $("sxLocForm");
  const idx = el_ => { const c = el_.closest("[data-i]"); return c ? +c.dataset.i : -1; };
  f.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, i = idx(b);
    if (act === "add") {
      OS.list.push(normLoc({ id: "", name: "", radius_km: 25, home: !OS.list.some(l => l.home), equipment: ["run"] }));
      OS.dirty = true; drawOrte();
      const inps = f.querySelectorAll(".sxloc input[data-f='name']"); inps[inps.length - 1].focus();
      return;
    }
    if (act === "del") {
      const l = OS.list[i], homes = OS.list.map(x => x.home);
      OS.list.splice(i, 1);
      if (OS.list.length && !OS.list.some(x => x.home)) OS.list[0].home = true;
      OS.dirty = true; drawOrte();
      if (l.name) toastS(`„${l.name}“ entfernt – mit „Speichern“ übernehmen`, () => { OS.list.splice(Math.min(i, OS.list.length), 0, l); OS.list.forEach((x, j) => { x.home = homes[j] ?? false; }); OS.dirty = true; drawOrte(); });
      return;
    }
    if (act === "geo") return locate(i);
  });
  f.addEventListener("input", e => {
    const inp = e.target, i = idx(inp), l = OS.list[i];
    if (!l) return;
    const fld = inp.dataset.f;
    OS.dirty = true; OS.msg = null; $("sxLocMsg").innerHTML = "";
    if (fld === "name") l.name = inp.value;
    else if (fld === "lat" || fld === "lon") l[fld] = parseNum(inp.value);
    else if (fld === "radius") l.radius_km = parseNum(inp.value);
    inp.removeAttribute("aria-invalid");
  });
  f.addEventListener("change", e => {
    const inp = e.target, i = idx(inp), l = OS.list[i];
    if (!l) return;
    if (inp.name === "home") { OS.list.forEach((x, j) => { x.home = j === i; }); OS.dirty = true; drawOrte(); }
    else if (inp.dataset.eq) {
      const k = inp.dataset.eq;
      l.equipment = EQUIP_KEYS.filter(x => x === k ? inp.checked : l.equipment.includes(x));
      OS.dirty = true;
    }
  });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (OS.saving || !web()) return;
    const err = validateLocs();
    if (err) { OS.msg = { kind: "bad", icon: ICX.warning, html: esc(err) }; return drawOrteState(); }
    const ids = new Set();
    const locs = OS.list.map(l => {
      let id = l.id || slug(l.name), n = 2;
      while (ids.has(id)) id = `${l.id || slug(l.name)}_${n++}`;
      ids.add(id); l.id = id;
      return { id, name: l.name.trim(), lat: l.lat == null ? null : round(l.lat, 5), lon: l.lon == null ? null : round(l.lon, 5),
        radius_km: l.radius_km == null ? 25 : round(l.radius_km, 1), home: !!l.home, equipment: EQUIP_KEYS.filter(k => l.equipment.includes(k)).concat(l.equipment.filter(k => !EQUIP_KEYS.includes(k))) };
    });
    OS.saving = true; OS.msg = null; drawOrteState();
    // Nur "locations" ersetzen – Ziel & Fokus und alle anderen Schlüssel bleiben unverändert
    const GA = window.GarvisActions;
    if (GA && GA.saveSettings) {   // Offline-Puffer: ohne Netz auf dem Gerät gespeichert, später automatisch gesendet
      const q = await GA.saveSettings({ kind: "set", key: "locations", value: locs });
      OS.saving = false; OS.dirty = false; OS.saved = true;
      OS.msg = q === "ok" ? { kind: "ok", icon: ICX.check, html: "<b>Gespeichert.</b> Gilt ab dem nächsten Planungslauf (spätestens morgen früh)." }
        : q === "queued" ? { kind: "", icon: ICX.check, html: "<b>Offline gespeichert.</b> Wird gesendet, sobald du wieder Netz hast." }
        : { kind: "bad", icon: failIcon((q && q.r) || { status: 0 }), html: "<b>Auf dem Gerät gespeichert, aber nicht gesendet.</b> " + saveFailHtml((q && q.r) || { status: 0 }) };
      updateMenuSub(); drawOrte(); return;
    }
    const res = await serial(() => updateJson("settings.json", data => ({ ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}), locations: locs }), "Garvis: Orte & Ausstattung"));
    OS.saving = false;
    if (res.ok) {
      writeLocal(SET_KEY, res.data); OS.dirty = false; OS.saved = true;
      OS.msg = { kind: "ok", icon: ICX.check, html: "<b>Gespeichert.</b> Gilt ab dem nächsten Planungslauf (spätestens morgen früh)." };
      updateMenuSub();
    } else OS.msg = { kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) };
    drawOrte();
  });
}
function validateLocs() {
  const f = $("sxLocForm");
  if (!OS.list.length) return "Mindestens einen Ort (Zuhause) anlegen.";
  for (let i = 0; i < OS.list.length; i++) {
    const l = OS.list[i], card = f.querySelector(`[data-i="${i}"]`), mark = fld => { const n = card && card.querySelector(`[data-f="${fld}"]`); if (n) n.setAttribute("aria-invalid", "true"); };
    if (!l.name.trim()) { mark("name"); return `Ort ${i + 1}: Bitte einen Namen eingeben.`; }
    if ((l.lat == null) !== (l.lon == null)) { mark(l.lat == null ? "lat" : "lon"); return `${l.name}: Breite und Länge bitte beide angeben – oder beide leer lassen.`; }
    if (l.lat != null && (l.lat < -90 || l.lat > 90)) { mark("lat"); return `${l.name}: Breitengrad muss zwischen −90 und 90 liegen.`; }
    if (l.lon != null && (l.lon < -180 || l.lon > 180)) { mark("lon"); return `${l.name}: Längengrad muss zwischen −180 und 180 liegen.`; }
    if (l.radius_km != null && (l.radius_km <= 0 || l.radius_km > 500)) { mark("radius"); return `${l.name}: Radius bitte zwischen 1 und 500 km.`; }
  }
  if (OS.list.filter(l => l.home).length !== 1) return "Bitte genau einen Ort als Zuhause markieren.";
  return null;
}
function locate(i) {
  const l = OS.list[i];
  if (!navigator.geolocation) { OS.geo[i] = "Standort wird von diesem Browser nicht unterstützt."; return drawOrte(); }
  OS.geo[i] = "Standort wird ermittelt …"; drawOrte();
  navigator.geolocation.getCurrentPosition(p => {
    l.lat = round(p.coords.latitude, 4); l.lon = round(p.coords.longitude, 4);
    OS.geo[i] = `Übernommen (Genauigkeit ca. ${nf(Math.max(1, p.coords.accuracy))} m) – noch speichern.`; OS.dirty = true; drawOrte();
  }, err => {
    OS.geo[i] = err && err.code === 1 ? "Standortzugriff abgelehnt – in den iPhone-Einstellungen › Datenschutz › Ortungsdienste erlauben oder Koordinaten eintippen."
      : "Standort nicht verfügbar – später erneut versuchen oder Koordinaten eintippen.";
    drawOrte();
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
}
function drawOrte() {
  const host = $("sxLocs");
  host.innerHTML = OS.list.map((l, i) => `<div class="card sxloc" data-i="${i}">
    <div class="sxloch"><span class="mi">${l.home ? IC.home : ICX.pin}</span>
      <label class="field" style="flex:1"><span class="kicker">Name</span><input data-f="name" value="${esc(l.name)}" maxlength="60" autocomplete="off" placeholder="z. B. Mallorca, Hotel" aria-label="Name des Orts"></label>
      <button type="button" class="sxico" data-act="del" aria-label="Ort entfernen" title="Ort entfernen">${ICX.trash}</button></div>
    <label class="sxhome"><input type="radio" name="home"${l.home ? " checked" : ""}><span><b>Zuhause</b><small>Gilt, wenn kein Reiseort erkannt wird</small></span></label>
    <div class="sxgeo">
      <div class="frow sxll">
        <label class="field"><span class="kicker">Breite <i>optional</i></span><input data-f="lat" inputmode="decimal" autocomplete="off" value="${l.lat == null ? "" : esc(String(l.lat))}" placeholder="48.137"></label>
        <label class="field"><span class="kicker">Länge <i>optional</i></span><input data-f="lon" inputmode="decimal" autocomplete="off" value="${l.lon == null ? "" : esc(String(l.lon))}" placeholder="11.575"></label>
        <label class="field"><span class="kicker">Radius</span><span class="sxunit"><input data-f="radius" inputmode="decimal" autocomplete="off" value="${l.radius_km == null ? "" : esc(kg(l.radius_km))}" placeholder="25"><small>km</small></span></label>
      </div>
      <button type="button" class="txtbtn sxloc-btn" data-act="geo">${ICX.locate}Aktuellen Standort verwenden</button>
      ${OS.geo[i] ? `<div class="sxgeomsg muted" role="status">${esc(OS.geo[i])}</div>` : ""}
    </div>
    <div class="field"><span class="kicker">Ausstattung</span>
      <div class="chipsel sxeq">${EQUIP.map(([k, n]) => `<label><input type="checkbox" data-eq="${k}"${l.equipment.includes(k) ? " checked" : ""}>${esc(n)}</label>`).join("")}</div></div>
  </div>`).join("");
  drawOrteState();
}
function drawOrteState() {
  $("sxLocMsg").innerHTML = !web() ? hint("", ICX.info, "Lokal geöffnet (Datei) – Orte lassen sich nur in der Garvis-App speichern.") : OS.msg ? hint(OS.msg.kind, OS.msg.icon, OS.msg.html) : "";
  const s = $("sxLocSave");
  s.disabled = !web() || OS.saving; s.textContent = OS.saving ? "Speichere …" : "Speichern";
  $("sxLocState").textContent = OS.loading ? "Lade aktuellen Stand …" : OS.loaded && !OS.saved ? "Noch nicht gespeichert – Vorschlag aus deinem Profil" : "";
}
function updateMenuSub() {
  const loc = ((readLocal(SET_KEY) || {}).locations) || (OS.list && OS.list.length ? OS.list : null) || defaultLocations();
  const home = loc.find(l => l.home);
  DETAILS.orte.sub = `${loc.length} ${loc.length === 1 ? "Ort" : "Orte"}${home ? ` · Zuhause: ${home.name}` : ""}`;
  A.refreshMenu();
}

// =============================================================================================
// Mehr › Einstellungen › Orte & Ausstattung › Meine Ausrüstung (settings.json › "gear") + Übersichtskarte unter Mehr
// Verschleiß kommt vom Backend als TODAY.gear (optional). Speichern ändert nur "gear" (Eintrag per id zusammengeführt).
// =============================================================================================
const GEAR_TYPES = [
  { k: "shoes", n: "Laufschuh", sport: "run", km: 700 }, { k: "bike", n: "Rad", sport: "bike" },
  { k: "chain", n: "Kette", sport: "bike", km: 3000 }, { k: "tires", n: "Reifen", sport: "bike", km: 4000 },
  { k: "cassette", n: "Kassette", sport: "bike", km: 10000 }, { k: "wetsuit", n: "Neoprenanzug", sport: "swim", h: 150 },
  { k: "other", n: "Sonstiges", sport: "any" },
];
const GT = Object.fromEntries(GEAR_TYPES.map(g => [g.k, g]));
const GEAR_SPORTS = [["run", "Laufen"], ["bike", "Rad"], ["swim", "Schwimmen"], ["any", "Alle"]];
const GSP = Object.fromEntries(GEAR_SPORTS);
const GEAR_IC = { shoes: IC.run, bike: IC.bike, chain: IC.bike, tires: IC.bike, cassette: IC.bike, wetsuit: IC.swim, other: IC.gym };
// Status-Farbe nur zusammen mit Symbol + Text
const GEAR_ST = { ok: { n: "In Ordnung", c: "var(--good)", ic: IC.check }, bald: { n: "Bald ersetzen", c: "var(--warning)", ic: IC.clock }, ersetzen: { n: "Ersetzen", c: "var(--critical)", ic: IC.warning } };
const GE = { list: null, edit: null, d: null, saving: false, msg: null, scroll: false };
const numIn = v => String(v).replace(".", ",");  // ohne Tausenderpunkt (parseNum liest „10.000“ sonst als 10)
const plainObj = d => d && typeof d === "object" && !Array.isArray(d) ? d : {};
const normGear = g => ({ id: String(g.id || ""), name: String(g.name || ""), type: GT[g.type] ? g.type : "other", sport: GSP[g.sport] ? g.sport : (GT[g.type] || GT.other).sport,
  start_date: g.start_date || null, start_km: g.start_km ?? 0, max_km: g.max_km ?? null, max_hours: g.max_hours ?? null, active: g.active !== false, default: !!g.default,
  garmin_uuid: g.garmin_uuid || null, note: String(g.note || "") });
const gearLocal = () => { const g = (readLocal(SET_KEY) || {}).gear; return Array.isArray(g) ? g.filter(x => x && typeof x === "object").map(normGear) : []; };
const wearAll = () => ((TD() && TD().gear) || []).filter(w => w && typeof w === "object");
const wearOf = id => wearAll().find(w => w.id === id) || null;
const garminGear = () => {
  const G = A.api.G || {}, L = Array.isArray(G.gear_garmin) && G.gear_garmin.length ? G.gear_garmin : Array.isArray(G.gear) ? G.gear : [];
  return L.map(g => ({ uuid: g.uuid || g.garmin_uuid || g.gearUuid || g.uuid_garmin || null, name: g.name || g.displayName || g.customMakeModel || "Garmin-Ausrüstung",
    type: g.type || g.gearTypeName || "", active: !g.status || g.status === "active" })).filter(g => g.uuid);
};
const gearMeta = g => [(GT[g.type] || GT.other).n, GSP[g.sport] || "", g.default && g.active ? "Standard" : ""].filter(Boolean).join(" · ");
const wearPct = w => w.pct != null ? +w.pct : (w.max_km && w.km != null ? 100 * w.km / w.max_km : w.max_hours && w.hours != null ? 100 * w.hours / w.max_hours : null);
const stBadge = w => { const s = GEAR_ST[w && w.status]; return s ? `<span class="gx-st"><i style="background:${s.c}"></i>${s.ic}${s.n}</span>` : ""; };
function wearHtml(w, compact) {
  const hrs = !!w.max_hours && !w.max_km, used = hrs ? w.hours : w.km, max = hrs ? w.max_hours : w.max_km, unit = hrs ? "h" : "km", pct = wearPct(w);
  const rem = hrs ? (max != null && used != null ? max - used : null) : (w.remaining_km ?? (max != null && used != null ? max - used : null));
  const foot = [pct != null && !compact ? `${nf(pct)} % der Grenze` : "", rem != null ? (rem >= 0 ? `noch ca. ${nf(rem)} ${unit}` : `${nf(-rem)} ${unit} über der Grenze`) : "",
    w.since && !compact ? `seit ${fmtDate(t(w.since))}` : ""].filter(Boolean).join(" · ");
  return `<div class="gx-wear"><div class="gx-wl"><span class="num">${nf(used ?? 0)}<small>${unit}</small></span>${max ? `<span class="muted">von ${nf(max)} ${unit}</span>` : ""}${stBadge(w)}</div>
    ${pct != null ? `<div class="meter" role="img" aria-label="${nf(pct)} Prozent der Grenze"><div style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>` : ""}
    ${foot ? `<div class="gx-wf muted">${foot}</div>` : ""}${w.note && !compact ? `<div class="gx-wf muted">${esc(w.note)}</div>` : ""}</div>`;
}
function gearCard(g) {
  const w = wearOf(g.id);
  if (GE.edit === g.id) return gearForm(GE.d, false);
  return `<div class="card gxi${g.active ? "" : " gx-off"}" data-gid="${esc(g.id)}">
    <div class="gxh"><span class="mi">${GEAR_IC[g.type] || IC.gym}</span><span class="gxn"><b>${esc(g.name)}</b><small>${esc(gearMeta(g))}${g.active ? "" : " · ausgemustert"}</small></span>
      <button type="button" class="txtbtn" data-gx="edit" aria-label="${esc(g.name)} bearbeiten">Bearbeiten</button></div>
    ${w ? wearHtml(w) : g.active ? `<div class="gx-wf muted">${g.max_km || g.max_hours ? `Grenze ${g.max_hours && !g.max_km ? nf(g.max_hours) + " h" : nf(g.max_km) + " km"} · ` : ""}Verschleiß erscheint nach dem nächsten Garmin-Abgleich.</div>` : ""}
    ${g.note && !(w && w.note === g.note) ? `<div class="gx-wf muted">${esc(g.note)}</div>` : ""}</div>`;
}
function gearForm(d, isNew) {
  const ty = GT[d.type] || GT.other, gg = garminGear();
  const radios = (name, opts, val) => opts.map(([k, n]) => `<label><input type="radio" name="${name}" value="${k}"${k === val ? " checked" : ""}>${esc(n)}</label>`).join("");
  return `<form class="card gxi gxf" data-gid="${esc(d.id)}" novalidate>
    <div class="kicker">${isNew ? "Neue Ausrüstung" : "Ausrüstung bearbeiten"}</div>
    <label class="field"><span class="kicker">Name</span><input data-g="name" value="${esc(d.name)}" maxlength="60" autocomplete="off" placeholder="z. B. ASICS Novablast 4"></label>
    <div class="field"><span class="kicker">Typ</span><div class="chipsel">${radios("gxtype", GEAR_TYPES.map(g => [g.k, g.n]), d.type)}</div></div>
    <div class="field"><span class="kicker">Sportart</span><div class="chipsel">${radios("gxsport", GEAR_SPORTS, d.sport)}</div></div>
    <div class="frow gx2">
      <label class="field"><span class="kicker">Startdatum</span><input data-g="start_date" type="date" value="${esc(d.start_date || "")}"></label>
      <label class="field"><span class="kicker">Start-km <i>bereits gelaufen</i></span><span class="sxunit"><input data-g="start_km" inputmode="decimal" autocomplete="off" value="${d.start_km ? numIn(d.start_km) : ""}" placeholder="0"><small>km</small></span></label>
    </div>
    <div class="field"><span class="kicker">Grenze <i>${ty.km ? `Vorschlag ${nf(ty.km)} km` : ty.h ? `Vorschlag ${nf(ty.h)} h` : "optional"}</i></span>
      <div class="gxlim"><span class="sxunit"><input data-g="limit" inputmode="decimal" autocomplete="off" value="${d.limit == null ? "" : numIn(d.limit)}" placeholder="${ty.km || ty.h || ""}" aria-label="Grenze"><small>${d.unit}</small></span>
        <div class="chipsel">${radios("gxunit", [["km", "km"], ["h", "Stunden"]], d.unit)}</div></div></div>
    <label class="sxhome"><input type="checkbox" data-g="default"${d.default ? " checked" : ""}><span><b>Standard für diese Sportart</b><small>Neue Aktivitäten ohne Garmin-Zuordnung zählen hierauf</small></span></label>
    ${gg.length ? `<label class="field"><span class="kicker">Garmin-Ausrüstung <i>optional</i></span><select data-g="garmin_uuid" class="gxsel"><option value="">Nicht verknüpft</option>${gg.map(x => `<option value="${esc(x.uuid)}"${x.uuid === d.garmin_uuid ? " selected" : ""}>${esc(x.name)}${x.active ? "" : " (ausgemustert)"}</option>`).join("")}</select></label>`
      : `<p class="gx-wf muted" style="margin:0">Verknüpfung mit Garmin-Ausrüstung: erscheint hier, sobald Garvis deine Garmin-Ausrüstung mit Kennung lädt.</p>`}
    <div class="field sxnotebox"><span class="kicker">Notiz <i>optional</i></span><textarea data-g="note" rows="2" maxlength="300" placeholder="z. B. nur für Wettkämpfe">${esc(d.note || "")}</textarea></div>
    <div id="gxFormMsg">${GE.msg && GE.msg.form ? hint(GE.msg.kind, GE.msg.icon, GE.msg.html) : ""}</div>
    <div class="formfoot gxfoot"><button type="submit" class="btn" data-gx="save"${!web() || GE.saving ? " disabled" : ""}>${GE.saving ? "Speichere …" : "Speichern"}</button>
      <button type="button" class="txtbtn" data-gx="cancel">Abbrechen</button>
      ${isNew ? "" : d.active ? `<button type="button" class="txtbtn gx-ret" data-gx="retire">Ausmustern</button>` : `<button type="button" class="txtbtn" data-gx="revive">Wieder aktivieren</button><button type="button" class="sxico" data-gx="delete" aria-label="Endgültig löschen" title="Endgültig löschen">${ICX.trash}</button>`}</div>
    ${!web() ? hint("", ICX.info, "Lokal geöffnet (Datei) – Ausrüstung lässt sich nur in der Garvis-App speichern.") : ""}
  </form>`;
}
const toDraft = g => ({ ...g, unit: g.max_hours && !g.max_km ? "h" : g.type === "wetsuit" && !g.max_km ? "h" : "km", limit: g.max_hours && !g.max_km ? g.max_hours : g.max_km });
function buildGear(sec) {
  const box = document.createElement("div");
  box.id = "sxGear"; box.className = "gx";
  box.innerHTML = `<h2>Meine Ausrüstung</h2>
    <p class="sub">Schuhe, Rad und Verschleißteile – Garvis zählt die Kilometer bzw. Stunden aus deinen Aktivitäten mit.</p>
    <div id="gxMsg"></div><div class="gxlist" id="gxList"></div>
    <button type="button" class="morebtn sxadd" data-gx="add">${ICX.plus}Ausrüstung hinzufügen</button>
    <details class="more" id="gxOff" hidden><summary>Ausgemustert <span class="n" id="gxOffN"></span></summary><div class="gxlist" id="gxOffList" style="padding-top:10px"></div></details>`;
  sec.appendChild(box);
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-gx]");
    if (!b) return;
    const act = b.dataset.gx, card = b.closest("[data-gid]"), id = card ? card.dataset.gid : null, g = GE.list.find(x => x.id === id);
    if (act === "add") {
      GE.edit = ""; GE.msg = null; GE.d = toDraft(normGear({ type: "shoes", sport: "run", max_km: 700, start_date: todayIso(), default: !GE.list.some(x => x.active && x.sport === "run" && x.default) }));
      drawGear(); const n = box.querySelector(".gxf input[data-g='name']"); if (n) n.focus(); return;
    }
    if (act === "edit" && g) { GE.edit = id; GE.msg = null; GE.d = toDraft(g); drawGear(); const n = box.querySelector(".gxf input[data-g='name']"); if (n) n.focus(); return; }
    if (act === "cancel") { GE.edit = null; GE.d = null; GE.msg = null; return drawGear(); }
    if (act === "retire" && g) { const old = { ...g }; toastS(`„${g.name}“ ausgemustert`, () => gearUndo(old, "Wieder aktiv.")); return saveGear({ ...g, active: false, default: false }, "Ausgemustert."); }
    if (act === "revive" && g) return saveGear({ ...g, active: true }, "Wieder aktiv.");
    if (act === "delete" && g) { const old = { ...g }; toastS(`„${g.name}“ gelöscht`, () => gearUndo(old, "Wiederhergestellt.")); return saveGear(g, "Gelöscht.", true); }
  });
  const sync = f => {  // Formular → Entwurf
    const d = GE.d; if (!d) return;
    const v = k => { const n = f.querySelector(`[data-g="${k}"]`); return n ? n.value : ""; };
    d.name = v("name"); d.start_date = v("start_date") || null; d.start_km = parseNum(v("start_km")); d.limit = parseNum(v("limit")); d.note = v("note");
    const gu = f.querySelector('[data-g="garmin_uuid"]'); if (gu) d.garmin_uuid = gu.value || null;
    d.default = !!(f.querySelector('[data-g="default"]') || {}).checked;
  };
  box.addEventListener("input", e => { const f = e.target.closest(".gxf"); if (f) { sync(f); e.target.removeAttribute("aria-invalid"); } });
  box.addEventListener("change", e => {
    const f = e.target.closest(".gxf"), d = GE.d;
    if (!f || !d) return;
    sync(f);
    if (e.target.name === "gxtype") {  // Vorschlag je Typ: Sportart, Grenze und Einheit (eigene Grenze bleibt)
      const old = GT[d.type] || GT.other, ty = GT[e.target.value] || GT.other, oldDef = old.km || old.h || null;
      d.type = ty.k; d.sport = ty.sport;
      if (d.limit == null || d.limit === oldDef) { d.limit = ty.km || ty.h || null; d.unit = ty.h ? "h" : "km"; }
      drawGear(); return;
    }
    if (e.target.name === "gxsport") d.sport = e.target.value;
    if (e.target.name === "gxunit") { d.unit = e.target.value; const u = f.querySelector(".gxlim .sxunit small"); if (u) u.textContent = d.unit; }
  });
  box.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target.closest(".gxf"), d = GE.d;
    if (!f || !d || GE.saving || !web()) return;
    sync(f);
    const bad = (k, msg) => { const n = f.querySelector(`[data-g="${k}"]`); if (n) { n.setAttribute("aria-invalid", "true"); n.focus(); } GE.msg = { form: true, kind: "bad", icon: ICX.warning, html: esc(msg) }; $("gxFormMsg").innerHTML = hint("bad", ICX.warning, esc(msg)); };
    if (!d.name.trim()) return bad("name", "Bitte einen Namen eingeben.");
    if (d.start_km != null && (d.start_km < 0 || d.start_km > 200000)) return bad("start_km", "Start-km bitte zwischen 0 und 200 000.");
    if (d.limit != null && (d.limit <= 0 || d.limit > 200000)) return bad("limit", "Grenze bitte größer als 0 – oder leer lassen.");
    let id = d.id;
    if (!id) { const base = "g_" + slug(d.name); id = base; let n = 2; while (GE.list.some(x => x.id === id)) id = `${base}_${n++}`; }
    const item = { id, name: d.name.trim(), type: d.type, sport: d.sport, start_date: d.start_date, start_km: d.start_km == null ? 0 : round(d.start_km, 1),
      max_km: d.unit === "km" && d.limit != null ? round(d.limit, 1) : null, max_hours: d.unit === "h" && d.limit != null ? round(d.limit, 1) : null,
      active: d.active !== false, default: !!d.default && d.active !== false, garmin_uuid: d.garmin_uuid || null, note: d.note.trim() };
    saveGear(item, "Gespeichert.");
  });
}
// Rückgängig: wartet, bis der laufende Speichervorgang fertig ist, und schreibt den alten Stand zurück
function gearUndo(item, okText) { if (GE.saving) return setTimeout(() => gearUndo(item, okText), 300); saveGear(item, okText); }
// Ein Eintrag wird per id in den aktuellen Stand von settings.json eingefügt (bzw. entfernt); nur "gear" ändert sich.
async function saveGear(item, okText, remove = false) {
  if (GE.saving || !web()) return;
  GE.saving = true; GE.msg = null; drawGear();
  const merge = data => {
    const d = { ...plainObj(data) };
    let L = Array.isArray(d.gear) ? d.gear.filter(x => x && typeof x === "object") : [];
    const i = L.findIndex(x => x.id === item.id);
    if (remove) L = L.filter(x => x.id !== item.id);
    else if (i >= 0) L[i] = { ...L[i], ...item }; else L.push(item);
    if (!remove && item.default) L = L.map(x => x.id !== item.id && x.sport === item.sport && x.default ? { ...x, default: false } : x);  // ein Standard je Sportart
    d.gear = L;
    return d;
  };
  const GA = window.GarvisActions;
  if (GA && GA.saveSettings) {   // Offline-Puffer wie bei Bewertungen/Status
    const q = await GA.saveSettings({ kind: "gear", item, remove });
    GE.saving = false; GE.list = gearLocal(); GE.edit = null; GE.d = null;
    GE.msg = q === "ok" ? { kind: "ok", icon: ICX.check, html: `<b>${esc(okText)}</b> Der Verschleiß wird beim nächsten Planungslauf neu berechnet.` }
      : q === "queued" ? { kind: "", icon: ICX.check, html: `<b>${esc(okText)}</b> Offline gespeichert – wird gesendet, sobald du wieder Netz hast.` }
      : { kind: "bad", icon: failIcon((q && q.r) || { status: 0 }), html: "<b>Auf dem Gerät gespeichert, aber nicht gesendet.</b> " + saveFailHtml((q && q.r) || { status: 0 }) };
    drawGear(); drawGearOverview(); return;
  }
  const res = await serial(() => updateJson("settings.json", merge, "Garvis: Ausrüstung"));
  GE.saving = false;
  if (res.ok) {
    writeLocal(SET_KEY, res.data); GE.list = gearLocal(); GE.edit = null; GE.d = null;
    GE.msg = { kind: "ok", icon: ICX.check, html: `<b>${esc(okText)}</b> Der Verschleiß wird beim nächsten Planungslauf neu berechnet.` };
  } else GE.msg = { form: GE.edit != null, kind: "bad", icon: failIcon(res.r), html: saveFailHtml(res.r) };
  drawGear(); drawGearOverview();
}
function drawGear() {
  if (!$("sxGear")) return;
  if (!GE.list) GE.list = gearLocal();
  const act = GE.list.filter(g => g.active), off = GE.list.filter(g => !g.active);
  const isNew = GE.edit === "";
  $("gxMsg").innerHTML = GE.msg && !GE.msg.form ? hint(GE.msg.kind, GE.msg.icon, GE.msg.html) : "";
  $("gxList").innerHTML = (isNew ? gearForm(GE.d, true) : "") + (act.length ? act.map(gearCard).join("") : isNew ? "" : `<div class="card gx-empty muted">Noch keine Ausrüstung erfasst.</div>`);
  $("gxOff").hidden = !off.length; $("gxOffN").textContent = `· ${off.length}`;
  $("gxOffList").innerHTML = off.map(gearCard).join("");
  if (off.some(g => g.id === GE.edit)) $("gxOff").open = true;
  document.querySelector('#sxGear [data-gx="add"]').hidden = GE.edit != null;
}
// Mehr: kleine Übersichtskarte (aktive Ausrüstung, kritischste zuerst)
function drawGearOverview() {
  const menu = $("menu"), anchor = menu && menu.closest(".card");
  if (!anchor) return;
  let c = $("gxOverview");
  if (!c) {
    c = document.createElement("div"); c.id = "gxOverview"; c.className = "card gxo"; c.style.marginTop = "14px"; anchor.after(c);
    c.addEventListener("click", e => { if (e.target.closest("a[href='#mehr/orte']")) GE.scroll = true; });
  }
  const own = (GE.list || gearLocal()).filter(g => g.active), W = wearAll();
  const rows = own.map(g => ({ g, w: W.find(w => w.id === g.id) || null }));
  W.forEach(w => { if (!own.some(g => g.id === w.id)) rows.push({ g: normGear(w), w }); });  // vom Backend erkannt, aber nicht in settings
  const rank = r => ({ ersetzen: 0, bald: 1, ok: 2 })[r.w && r.w.status] ?? 3;
  rows.sort((a, b) => rank(a) - rank(b) || (b.w ? wearPct(b.w) || 0 : -1) - (a.w ? wearPct(a.w) || 0 : -1));
  const top = rows.slice(0, 4);
  c.innerHTML = `<h3 class="chead">${IC.run}Ausrüstung<a class="r gxo-a" href="#mehr/orte">${rows.length ? "Verwalten" : "Erfassen"}</a></h3>
    ${top.length ? `<div class="gxo-l">${top.map(({ g, w }) => `<div class="gxo-r"><div class="gxo-n"><b>${esc(g.name)}</b><small>${esc((GT[g.type] || GT.other).n)}</small></div>
      ${w ? wearHtml(w, true) : `<div class="gx-wf muted">Noch kein Verschleißstand</div>`}</div>`).join("")}</div>${rows.length > 4 ? `<p class="gx-wf muted" style="margin:10px 0 0">+ ${rows.length - 4} weitere</p>` : ""}`
      : `<p class="desc" style="margin:6px 0 0">Laufschuhe, Kette, Reifen oder Neoprenanzug erfassen – Garvis zeigt, wann ein Wechsel fällig ist.</p>`}`;
}

// ---------- Registrierung ----------
const mk = id => { if ($(id)) return; const s = document.createElement("section"); s.id = id; s.hidden = true; $("mDetail").appendChild(s); };
["kraft", "kraftbasis", "orte"].forEach(mk);
const DETAILS = {
  kraft: { name: "Krafttraining", sub: "Freies Training, Verlauf, Bestandsaufnahme", icon: IC.gym, render: renderKraft, noRange: true },
  kraftbasis: { name: "Bestandsaufnahme", sub: "", icon: IC.target, render: renderBase, noRange: true, group: "hidden" },
  orte: { name: "Orte & Ausstattung", sub: "", icon: IC.pin, render: renderOrte, noRange: true, group: "settings" },
};
{
  const loc = (readLocal(SET_KEY) || {}).locations, l = Array.isArray(loc) && loc.length ? loc : defaultLocations(), home = l.find(x => x.home);
  DETAILS.orte.sub = `${l.length} ${l.length === 1 ? "Ort" : "Orte"}${home ? ` · Zuhause: ${home.name}` : ""}`;
}
A.register({ id: "strength", details: DETAILS, hooks: { plan: planHook, week: weekHook, day: dayHook, today: todayHook } });
drawGearOverview();
setTimeout(flush, 1500);
})();
