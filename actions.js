/* Garvis – Aktionen (Zusatzmodul, geladen von app.js per <script src>):
   - Bewerten: Anstrengung 1–10 + Gefühl (5 Stufen) + Notiz → garvis-data logs/feedback/YYYY-MM.json
   - Tagesansicht: Alternative nehmen / Verschieben / Tauschen / Ausfallen lassen → settings.json › "overrides"
   - Status: Krank bis …, Trainingspause bis …, Nachtdienst → settings.json › "status" (Mehr › Einstellungen › Status + Chips auf Heute)
   - Notiz zum Tag → logs/notes/YYYY-MM.json (eine Notiz je Tag)
   - Toast mit „Rückgängig“ (window.GarvisActions.undo) für alle Löschvorgänge
   - Glossar (ⓘ-Popover + Mehr › Glossar), Datenexport (Mehr › Meine Daten exportieren)
   Schreiben: Datei lesen → ändern → mit sha schreiben, bei 409/422 neu laden; ohne Verbindung im Gerät gepuffert.
   settings.json wird immer zusammengeführt – andere Schlüssel bleiben unverändert. Lokal (file://): nur Anzeige. */
(() => {
const A = window.GarvisApp;
if (!A || window.GarvisActions) return;
const U = A.api;
const { G, IC, esc, nf, t, DAY, WD, WDL, MONTHS, MONTHS_L, wdi, gh, API, DATA_REPO, utf8b64, b64utf8, readLocal, writeLocal, errText, WRITE_HELP, SET_KEY } = U;
const $ = id => document.getElementById(id);
const web = () => !!(window.GARVIS && window.GARVIS.web);
const TD = () => window.TODAY || null;

const css = document.createElement("link");
css.rel = "stylesheet"; css.href = "actions.css";
document.head.appendChild(css);

const svgI = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const AI = {
  note: svgI('<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>'),
  skip: svgI('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>'),
  move: svgI('<path d="M4 12h14M13 7l5 5-5 5"/>'),
  swap: svgI('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  alt: svgI('<path d="M6 4v8a4 4 0 0 0 4 4h8M14 12l4 4-4 4"/>'),
  undo: svgI('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/>'),
  info: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sick: svgI('<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>'),
  pause: svgI('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>'),
  night: svgI('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  late: svgI('<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 6v4M5.6 10.6 7 12M18.4 10.6 17 12M8 21h8"/>'),
  h24: svgI('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l3 2"/>'),
  oncall: svgI('<path d="M6 4h3.5l1.5 4.5-2.2 1.3a10 10 0 0 0 5.4 5.4l1.3-2.2L20 14.5V18a2 2 0 0 1-2 2A14 14 0 0 1 4 6a2 2 0 0 1 2-2z"/>'),
  short: svgI('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M10 2h4"/>'),
  x: svgI('<path d="M6 6l12 12M18 6L6 18"/>'),
  down: svgI('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  share: svgI('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"/>'),
  book: svgI('<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'),
  status: svgI('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
  check: IC.check, warning: IC.warning, key: IC.key, clock: IC.clock, chev: IC.chev,
};
// Gefühl: 5 Stufen (Gesichter: Mund von stark nach unten bis stark nach oben gebogen)
const face = m => svgI(`<circle cx="12" cy="12" r="9"/><path d="M9 9.5v.5M15 9.5v.5"/><path d="${m}"/>`);
const FEELS = [
  { k: "sehr schwach", ic: face("M8 17q4-4 8 0") },
  { k: "schwach", ic: face("M8.5 16.2q3.5-2 7 0") },
  { k: "normal", ic: face("M8.5 15.5h7") },
  { k: "stark", ic: face("M8.5 14.5q3.5 2.2 7 0") },
  { k: "sehr stark", ic: face("M8 13.8q4 4.6 8 0") },
];
const feelOf = k => FEELS.find(f => f.k === k) || null;

// ---------- Datum ----------
const pad = n => String(n).padStart(2, "0");
const localIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => localIso();
const addDays = (iso, n) => new Date(t(iso) + n * DAY).toISOString().slice(0, 10);
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const dShort = iso => { const d = new Date(t(iso)); return `${WD[wdi(t(iso))]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`; };
const dLong = iso => { const d = new Date(t(iso)); return `${WDL[wdi(t(iso))]}, ${d.getUTCDate()}. ${MONTHS_L[d.getUTCMonth()]}`; };
const dRel = iso => { const n = Math.round((t(iso) - t(todayIso())) / DAY); return n === 0 ? "heute" : n === 1 ? "morgen" : n === -1 ? "gestern" : dShort(iso); };
const dRelC = iso => { const s = dRel(iso); return s.charAt(0).toUpperCase() + s.slice(1); };
const weekMonday = () => addDays(todayIso(), -wdi(t(todayIso())));
const stamp = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " Uhr"; };
const plain = o => o && typeof o === "object" && !Array.isArray(o) ? o : {};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Anstrengung (RPE) als Klartext ----------
const RPE_WORD = v => v == null || isNaN(v) ? "" : v <= 2 ? "sehr leicht" : v <= 4 ? "leicht" : v <= 6 ? "mittel" : v <= 8 ? "hart" : v < 10 ? "sehr hart" : "maximal";
const RPE_DESC = {
  1: "Kaum Anstrengung – wie lockeres Gehen", 2: "Sehr locker, Atmung ruhig", 3: "Locker, Unterhaltung problemlos möglich", 4: "Leicht, noch entspannt sprechen",
  5: "Spürbar, Sprechen in ganzen Sätzen geht noch", 6: "Fordernd, Sprechen nur noch in kurzen Sätzen", 7: "Hart, nur noch wenige Worte", 8: "Sehr fordernd, Durchhalten kostet Willen",
  9: "Sehr hart, kaum noch durchzuhalten", 10: "Maximal – mehr ging nicht",
};
// „7“, 7.5, „7–8“, „RPE 7-8“ → „Anstrengung 7–8/10 (hart)“
function rpeText(v, prefix = "Anstrengung ") {
  const n = (String(v ?? "").match(/\d+(?:[.,]\d+)?/g) || []).map(x => +x.replace(",", ".")).filter(x => x >= 0 && x <= 10);
  if (!n.length) return "";
  const lo = Math.min(...n), hi = Math.max(...n), f = x => nf(x, x % 1 ? 1 : 0);
  const wl = RPE_WORD(lo), wh = RPE_WORD(hi);
  return `${prefix}${lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`}/10 (${wl === wh ? wl : `${wl} bis ${wh}`})`;
}
// Texte im DOM: „Ziel-RPE 3“ / „RPE 7–8“ → „Anstrengung 3/10 (leicht)“ (nur Anzeige)
const RPE_RX = /(Ziel-)?RPE\s*(\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?)(\s*\/\s*10)?/g;
function humanizeRpe(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => /RPE\s*\d/.test(n.nodeValue) && !n.parentElement.closest("input, textarea, .acgl, .ac-gl-skip") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  list.forEach(n => { n.nodeValue = n.nodeValue.replace(RPE_RX, (m, z, v) => rpeText(v, z ? "Ziel: Anstrengung " : "Anstrengung ")); });
}

// =============================================================================================
// Toast mit „Rückgängig“ (gemeinsam für alle Module: window.GarvisActions.undo(text, fn))
// =============================================================================================
const TS = { timer: null, undo: null };
function toastEl() {
  let n = $("acToast");
  if (n) return n;
  n = document.createElement("div"); n.id = "acToast"; n.className = "actoast"; n.hidden = true;
  n.innerHTML = `<div class="actoast-in"><span class="actoast-t" role="status" aria-live="polite"></span><button type="button" class="actoast-u" hidden>Rückgängig</button><button type="button" class="actoast-x" aria-label="Hinweis schließen">${AI.x}</button></div>`;
  document.body.appendChild(n);
  n.querySelector(".actoast-u").addEventListener("click", () => { const f = TS.undo; hideToast(); if (f) { try { f(); } catch (e) { console.error(e); } toast("Wiederhergestellt"); } });
  n.querySelector(".actoast-x").addEventListener("click", hideToast);
  return n;
}
function hideToast() { clearTimeout(TS.timer); TS.undo = null; const n = $("acToast"); if (n) n.hidden = true; }
function toast(text, { undo = null, ms = undo ? 5000 : 3500 } = {}) {
  const n = toastEl();
  clearTimeout(TS.timer);
  TS.undo = undo;
  n.querySelector(".actoast-t").textContent = text;
  n.querySelector(".actoast-u").hidden = !undo;
  n.hidden = false;
  TS.timer = setTimeout(hideToast, ms);
}
const undoToast = (text, fn) => toast(text, { undo: fn });

// =============================================================================================
// Glossar
// =============================================================================================
const GL = {
  rpe: { t: "Anstrengung (RPE)", d: "Wie hart sich eine Einheit angefühlt hat, auf einer Skala von 1 bis 10 (RPE = „Rate of Perceived Exertion“). 1–2 sehr leicht, 3–4 leicht, 5–6 mittel, 7–8 hart, 9 sehr hart, 10 maximal. Garvis vergleicht deine Bewertung mit dem Plan – war es öfter härter als gedacht, plant Garvis vorsichtiger." },
  form: { t: "Fitness, Ermüdung & Form", d: "Fitness ist deine über etwa 6 Wochen aufgebaute Trainingsbelastung, Ermüdung die der letzten 7 Tage. Form = Fitness minus Ermüdung: deutlich negativ heißt müde (Training wirkt, aber Erholung nötig), um 0 bis leicht positiv heißt frisch und bereit für harte Einheiten oder Wettkämpfe." },
  zonen: { t: "Zonen", d: "Intensitätsbereiche nach Puls, Leistung (Watt) oder Tempo. Zone 1–2: locker, Grundlage – Unterhaltung möglich. Zone 3: zügig. Zone 4: Schwelle, nur noch kurze Sätze. Zone 5: VO2max, sehr hart und nur wenige Minuten am Stück. Garvis berechnet deine Zonen automatisch aus deinen Bestwerten." },
  ftp: { t: "FTP", d: "Functional Threshold Power: die Leistung in Watt, die du auf dem Rad etwa eine Stunde lang halten kannst. Grundlage für die Watt-Zonen beim Radfahren. Garvis schätzt sie z. B. aus einem Rampentest (75 % der besten Minute)." },
  css: { t: "CSS", d: "Critical Swim Speed: dein Schwellentempo im Wasser pro 100 m – das Tempo, das du etwa 30 Minuten halten kannst. Grundlage für die Tempo-Vorgaben beim Schwimmen." },
  vo2max: { t: "VO2max", d: "Maximale Sauerstoffaufnahme in ml pro kg Körpergewicht und Minute – ein Maß für deine Ausdauer-Leistungsfähigkeit. Garmin schätzt sie aus Puls und Tempo bzw. Leistung. Steigt mit regelmäßigem Training, vor allem mit Intervallen." },
  bb: { t: "Body Battery", d: "Garmins Energiewert von 0 bis 100: lädt sich im Schlaf und in Ruhe auf, sinkt durch Stress und Aktivität. Morgens hoch = gut erholt; bleibt sie niedrig, plant Garvis lockerer." },
  hrv: { t: "HRV", d: "Herzfrequenzvariabilität: wie stark die Abstände zwischen Herzschlägen schwanken, nachts gemessen. Höher als dein Normalbereich = gut erholt; deutlich niedriger = Stress, Krankheit oder Ermüdung." },
  readiness: { t: "Erholung (Trainingsbereitschaft)", d: "Garmins Wert von 0 bis 100 aus Schlaf, Erholungszeit, HRV und Belastung. Ab etwa 70 sind harte Einheiten okay, unter 40 eher locker oder Pause." },
};
const GL_FIND = [
  ["rpe", /\bRPE\b|Anstrengung/], ["zonen", /\bZonen?\b|\bZ[1-5]\b|Zone\s?[1-5]/], ["ftp", /\bFTP\b/], ["css", /\bCSS\b/],
  ["vo2max", /VO2\s?max/i], ["bb", /Body Battery/i], ["hrv", /\bHRV\b/], ["form", /\bForm\b|\bFitness\b|Ermüdung/],
];
const glBtn = (k, label) => `<button type="button" class="acinfo" data-gl="${k}" aria-label="Erklärung: ${esc(GL[k].t)}">${label ? `<span>${esc(label)}</span>` : ""}${AI.info}</button>`;
// Zeile „Begriffe: [FTP ⓘ] [Zonen ⓘ]“ für alle Begriffe, die im Text eines Bereichs vorkommen
function glRow(host, keys) {
  if (!host) return;
  const old = host.querySelector(":scope > .acgl"); if (old) old.remove();
  const txt = host.textContent || "";
  const ks = (keys || GL_FIND.filter(([, rx]) => rx.test(txt)).map(([k]) => k)).filter(k => GL[k]);
  if (!ks.length) return;
  const div = document.createElement("div");
  div.className = "acgl";
  div.innerHTML = `<span class="muted">Begriffe:</span>${ks.map(k => glBtn(k, GL[k].t.replace(/ \(.*\)$/, ""))).join("")}`;
  host.appendChild(div);
}
let POP = null;
function closePop(back = true) {
  const p = $("acPop");
  if (p) p.hidden = true;
  if (POP && back && POP.isConnected) POP.focus({ preventScroll: true });
  POP = null;
}
function openPop(btn, k) {
  const g = GL[k]; if (!g) return;
  let p = $("acPop");
  if (!p) {
    p = document.createElement("div"); p.id = "acPop"; p.className = "acpop"; p.hidden = true;
    p.setAttribute("role", "dialog"); p.setAttribute("aria-labelledby", "acPopT"); p.tabIndex = -1;
    document.body.appendChild(p);
  }
  if (POP === btn && !p.hidden) return closePop();
  POP = btn;
  p.innerHTML = `<div class="acpop-h"><b id="acPopT">${esc(g.t)}</b><button type="button" class="acpop-x" data-pop="close" aria-label="Schließen">${AI.x}</button></div>
    <p>${esc(g.d)}</p><a href="#mehr/glossar" data-pop="all">Alle Begriffe im Glossar</a>`;
  p.hidden = false;
  const r = btn.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
  p.style.width = w + "px";
  p.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
  const h = p.offsetHeight, below = r.bottom + 8 + h < innerHeight - 12;
  p.style.top = (below ? r.bottom + 8 : Math.max(12, r.top - h - 8)) + "px";
  p.focus({ preventScroll: true });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-gl]");
  if (b) { e.preventDefault(); e.stopPropagation(); return openPop(b, b.dataset.gl); }
  const pc = e.target.closest("[data-pop]");
  if (pc) { if (pc.dataset.pop === "close") closePop(); else closePop(false); return; }
  if (POP && !e.target.closest("#acPop")) closePop(false);
}, true);
addEventListener("scroll", () => { if (POP) closePop(false); }, { passive: true, capture: true });

// =============================================================================================
// Speicher: GitHub Contents API (garvis-data) + Offline-Puffer
// =============================================================================================
const fileUrl = path => `${API}/repos/${DATA_REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
async function getJson(path) {
  const r = await gh(fileUrl(path));
  if (r.status === 200 && r.body && r.body.content != null) {
    try { return { ok: true, data: r.body.content === "" ? null : JSON.parse(b64utf8(r.body.content)), sha: r.body.sha }; }
    catch (e) { return { ok: true, data: null, sha: r.body.sha, broken: true }; }
  }
  if (r.status === 404) return { ok: true, data: null, sha: null };
  return { ok: false, r };
}
async function updateJson(path, mutate, message) {
  let last = null;
  for (let i = 0; i < 4; i++) {
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
const fbPath = m => `logs/feedback/${m}.json`, notePath = m => `logs/notes/${m}.json`;
// Status-Listen in settings.status (je ISO-Datum; Dienstbeginn). Das Backend wertet night_shifts aus,
// late_shifts / shifts_24h / oncall sind neu (Vertrag: Listen von ISO-Daten wie night_shifts).
const SLISTS = [
  { key: "night_shifts", name: "Nachtdienst", ic: "night", hint: "Datum = Abend, an dem der Dienst beginnt", after: "Nach Nachtdienst", plan: "am Tag danach nur Erholung" },
  { key: "late_shifts", name: "Spätdienst", ic: "late", hint: "Training dann eher vormittags", plan: "Training vor dem Dienst" },
  { key: "shifts_24h", name: "24-h-Dienst", ic: "h24", hint: "Datum = Tag, an dem der Dienst beginnt", after: "Nach 24-h-Dienst", plan: "kein Training, danach Erholung" },
  { key: "oncall", name: "Bereitschaft", ic: "oncall", hint: "Kurze Einheiten in Wohnortnähe", plan: "nur kurze, abbrechbare Einheiten" },
];
const SL = Object.fromEntries(SLISTS.map(L => [L.key, L]));
const CK = "garvis.actions.cache", OK_ = "garvis.actions.outbox";
const C = Object.assign({ fb: {}, notes: {}, at: 0 }, readLocal(CK) || {});
const saveC = () => writeLocal(CK, C);
const outbox = () => readLocal(OK_) || [];
const setOutbox = o => writeLocal(OK_, o);

// Ein Puffer-Eintrag: {id, kind: "fb"|"note"|"ov"|"st", …, replan}
const opPath = op => op.kind === "fb" ? fbPath(op.e.date.slice(0, 7)) : op.kind === "note" ? notePath(op.date.slice(0, 7)) : "settings.json";
const fbKey = x => x.activity_id != null ? "a" + x.activity_id : "d" + x.date + "|" + String(x.title || "").trim();
const normLog = d => { const o = { ...plain(d) }; o.entries = Array.isArray(o.entries) ? o.entries.filter(x => x && typeof x === "object") : []; return o; };
const pruneOv = o => { const td = todayIso(), out = {}; Object.keys(plain(o)).sort().forEach(k => { if (isIso(k) && k >= td) out[k] = o[k]; }); return out; };
const cleanNs = a => [...new Set((Array.isArray(a) ? a : []).filter(isIso))].filter(d => d >= addDays(todayIso(), -1)).sort();
function applyOp(path, data, op) {
  if (path === "settings.json") {
    const d = { ...plain(data) };
    if (op.kind === "ov") { const o = { ...plain(d.overrides) }; if (op.v) o[op.date] = op.v; else delete o[op.date]; d.overrides = pruneOv(o); }
    else if (d.overrides) d.overrides = pruneOv(d.overrides);  // beim Speichern vergangene Tage entfernen
    if (op.kind === "st") {
      const s = { sick_until: null, pause_until: null, night_shifts: [], ...plain(d.status), ...(op.set || {}) };
      // Datumslisten (Nachtdienst, Spätdienst, 24-h-Dienst, Bereitschaft); nsAdd/nsDel = ältere Puffer-Einträge
      SLISTS.forEach(L => {
        const add = [...((op.add || {})[L.key] || []), ...(L.key === "night_shifts" ? op.nsAdd || [] : [])];
        const del = [...((op.del || {})[L.key] || []), ...(L.key === "night_shifts" ? op.nsDel || [] : [])];
        if (L.key !== "night_shifts" && !add.length && !del.length && !Array.isArray(s[L.key])) return;  // Schlüssel nicht unnötig anlegen
        s[L.key] = cleanNs((Array.isArray(s[L.key]) ? s[L.key] : []).concat(add).filter(x => !del.includes(x)));
      });
      s.updated = op.at;
      d.status = s;
    }
    return d;
  }
  const d = normLog(data);
  if (op.kind === "fb") {
    const k = fbKey(op.e), i = d.entries.findIndex(x => fbKey(x) === k);
    if (op.del) { if (i >= 0) d.entries.splice(i, 1); }
    else if (i >= 0) d.entries[i] = op.e; else d.entries.push(op.e);
  } else if (op.kind === "note") {
    d.entries = d.entries.filter(x => x.date !== op.date);
    if (op.text) d.entries.push({ date: op.date, text: op.text, updated: op.at });
  }
  d.entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return d;
}
const msgFor = (path, ops) => path === "settings.json" ? (ops.some(o => o.kind === "ov") ? "Garvis: Planänderung" : "Garvis: Status")
  : path.startsWith("logs/notes") ? `Garvis: Notiz ${ops[0].date}` : `Garvis: Bewertung ${ops[0].e.date} (${ops[0].e.title || "Einheit"})`.slice(0, 120);

let FL = Promise.resolve();
const RES = {};  // op.id → "ok" | "queued" | {r, kept}
// Letzter dauerhafter Fehler beim Senden (401/403/404/422 …): {status, at, msg}. Einträge bleiben trotzdem im Puffer.
const OE_ = "garvis.actions.outboxErr";
const obErr = () => readLocal(OE_);
const transient = r => !r || r.status === 0 || r.rl || r.status >= 500;
// force: sofort senden (neue Änderung, „Erneut senden“); sonst nach einem dauerhaften Fehler höchstens alle 5 min
function flush(force = false) { FL = FL.then(() => flushOnce(force).catch(e => console.error("actions.js:", e))); return FL; }
async function flushOnce(force) {
  if (!web()) return;
  const all = outbox();
  if (!all.length) { if (obErr()) localStorage.removeItem(OE_); return; }
  const E = obErr();
  if (!force && E && Date.now() - (E.at || 0) < 5 * 60000) return;
  let failed = false;
  const groups = {};
  all.forEach(op => (groups[opPath(op)] ||= []).push(op));
  let replan = false, changed = false;
  for (const [path, ops] of Object.entries(groups)) {
    const r = await updateJson(path, data => ops.reduce((d, op) => applyOp(path, d, op), data), msgFor(path, ops));
    const ids = new Set(ops.map(o => o.id));
    if (r.ok) {
      setOutbox(outbox().filter(o => !ids.has(o.id)));
      ops.forEach(o => { RES[o.id] = "ok"; });
      if (path === "settings.json") { writeLocal(SET_KEY, r.data); if (ops.some(o => o.replan)) replan = true; }
      else (path.startsWith("logs/notes") ? C.notes : C.fb)[path.slice(-12, -5)] = r.data.entries;
      saveC(); changed = true;
    } else if (transient(r.r)) {
      ops.forEach(o => { RES[o.id] = "queued"; });  // Funkloch, Limit, GitHub-Störung → bleibt im Puffer
    } else {  // z. B. Schlüssel ohne Schreibrecht: NIE verwerfen – im Puffer lassen, melden, später erneut senden
      ops.forEach(o => { RES[o.id] = { r: r.r, kept: true }; });
      writeLocal(OE_, { status: r.r ? r.r.status : null, at: Date.now(), msg: (r.r && r.r.body && r.r.body.message) || "" });
      failed = true; changed = true;
    }
  }
  if (!failed && obErr()) { localStorage.removeItem(OE_); changed = true; }
  if (replan) await replan_();
  if (changed) {  // „Offline gepuffert“-Hinweise nach dem Nachsenden entfernen
    [...Object.values(NT), ...Object.values(AC), SS].forEach(x => { if (x.msg && x.msg.kind === "queued" && !outbox().length) x.msg = null; });
    if ($("acStBody")) drawStatus();
    rerender();
  }
}
addEventListener("online", () => flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { flush(); load(); } });

// Änderungen vormerken (sofort sichtbar), dann senden. Ergebnis: "ok" | "queued" | "local" | {r}
async function commit(ops, replan = false) {
  if (!web()) return "local";
  const at = new Date().toISOString();
  const list = (Array.isArray(ops) ? ops : [ops]).map(o => ({ id: uid(), at, ...o, replan }));
  setOutbox(outbox().concat(list));
  rerender();
  await flush(true);
  const res = list.map(o => RES[o.id] || "queued");
  return res.find(x => typeof x === "object") || (res.includes("queued") ? "queued" : "ok");
}
const failHtml = r => !r ? "" : (r.status === 403 && !r.rl) || r.status === 404 ? esc(WRITE_HELP) : esc(errText(r, "Speichern"));
const LOCAL_HINT = "Lokal geöffnet (Datei) – gespeichert wird nur in der Garvis-App (iPhone bzw. Browser).";
const QUEUED_HTML = "<b>Offline – auf dem Gerät gepuffert.</b> Garvis sendet es automatisch, sobald du wieder online bist.";
const hint = (kind, icon, html) => html ? `<div class="hint ${kind || ""}" role="status">${icon}<span>${html}</span></div>` : "";
const KEPT_HTML = " <b>Nicht verloren:</b> bleibt auf diesem Gerät gespeichert und wird erneut gesendet.";
const resMsg = (res, okHtml) => res === "ok" ? { kind: "ok", icon: AI.check, html: okHtml } : res === "queued" ? { kind: "queued", icon: AI.clock, html: QUEUED_HTML }
  : res === "local" ? { kind: "", icon: AI.info, html: LOCAL_HINT } : { kind: "bad", icon: (res.r && (res.r.status === 401 || res.r.status === 403 || res.r.status === 404)) ? AI.key : AI.warning, html: failHtml(res.r) + (res.kept ? KEPT_HTML : "") };
const keptToast = what => toast(`${what} nicht gesendet – bleibt auf dem Gerät gespeichert. Schlüssel prüfen (siehe Hinweis oben).`, { ms: 6000 });

// Hinweis „N Änderungen nicht gesendet – Schlüssel prüfen“ (Heute, Tagesansicht, Mehr › Status) mit „Erneut senden“
const OB = { busy: false };
function outboxNote() {
  const n = outbox().length, E = obErr();
  if (!n || !E || !web()) return "";
  const key = E.status === 401 || E.status === 403 || E.status === 404;
  const why = E.status === 401 ? "Der GitHub-Schlüssel ist ungültig oder abgelaufen."
    : key ? "Dem GitHub-Schlüssel fehlt das Schreibrecht (garvis-data › Contents: Read and write)."
    : `GitHub meldet Fehler ${E.status}${E.msg ? ` (${E.msg})` : ""}.`;
  return `<div class="card acob" role="alert"><span class="acob-i">${key ? AI.key : AI.warning}</span><div>
    <b>${n === 1 ? "1 Änderung" : n + " Änderungen"} nicht gesendet${key ? " – Schlüssel prüfen" : ""}</b>
    <small>${esc(why)} Deine Einträge bleiben auf diesem Gerät gespeichert, bis sie gesendet sind.</small>
    <div class="acob-b"><button type="button" class="txtbtn" data-ob="retry"${OB.busy ? " disabled" : ""}>${OB.busy ? "Sende …" : "Erneut senden"}</button>
      ${key ? `<a class="txtbtn" href="#mehr">Schlüssel prüfen</a>` : ""}
      <button type="button" class="txtbtn acob-x" data-ob="drop">Verwerfen …</button></div></div></div>`;
}
function placeOutboxNote(host, where = "afterbegin") {
  if (!host) return;
  const old = host.querySelector(":scope > .acob"); if (old) old.remove();
  const h = outboxNote(); if (h) host.insertAdjacentHTML(where, h);
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-ob]"); if (!b || b.disabled) return;
  if (b.dataset.ob === "retry") {
    OB.busy = true; b.disabled = true; b.textContent = "Sende …";
    await flush(true);
    OB.busy = false;
    toast(outbox().length ? (obErr() ? "Noch nicht gesendet – Schlüssel prüfen" : "Offline – wird gesendet, sobald du online bist") : "Alles gesendet");
    if ($("acStBody")) drawStatus();
    return A.rerender();
  }
  if (b.dataset.ob === "drop") {
    const n = outbox().length;
    if (!window.confirm(`${n === 1 ? "Die nicht gesendete Änderung" : `Alle ${n} nicht gesendeten Änderungen`} endgültig verwerfen? Das lässt sich nicht rückgängig machen.`)) return;
    setOutbox([]); localStorage.removeItem(OE_);
    toast("Verworfen");
    if ($("acStBody")) drawStatus();
    A.rerender();
  }
});

// „Jetzt neu planen“ nach Planänderung/Status (Workflow daily.yml im Repo garvis)
const RP = { state: null, at: 0 };
const DENIED_HTML = "Gespeichert. Wird beim nächsten Planungslauf berücksichtigt – für sofortige Wirkung Actions-Berechtigung für Repo garvis am Schlüssel ergänzen.";
async function replan_() {
  if (!U.dispatchReplan) { RP.state = "denied"; return; }
  RP.state = "busy"; RP.at = Date.now();
  const r = await U.dispatchReplan();
  if (r.status === 204 || r.ok) { RP.state = "ok"; try { localStorage.removeItem(U.DISPATCH_KEY || "garvis.dispatch"); } catch (e) { /* egal */ } toast("Plan wird neu berechnet …"); }
  else if ((r.status === 403 && !r.rl) || r.status === 404) { RP.state = "denied"; try { localStorage.setItem(U.DISPATCH_KEY || "garvis.dispatch", "denied"); } catch (e) { /* egal */ } toast("Gespeichert – wird beim nächsten Planungslauf berücksichtigt"); }
  else RP.state = "later";
  RP.at = Date.now();
}
function replanHint() {
  if (!RP.state || Date.now() - RP.at > 20 * 60000) return "";
  if (RP.state === "busy") return hint("", AI.clock, "<b>Plan wird neu berechnet …</b>");
  if (RP.state === "ok") return hint("ok", AI.clock, "<b>Plan wird neu berechnet …</b> In etwa 5 Minuten ist der neue Plan da – dann die App neu laden.");
  if (RP.state === "denied") return hint("", AI.key, esc(DENIED_HTML));
  return hint("", AI.clock, "Gespeichert – Neuplanung konnte nicht gestartet werden, wird beim nächsten Planungslauf berücksichtigt.");
}

// ---------- Laden (Bewertungen, Notizen, Einstellungen) ----------
let LOADING = false;
const monthsNeeded = () => {
  const s = new Set([todayIso().slice(0, 7), weekMonday().slice(0, 7), addDays(todayIso(), -7).slice(0, 7)]);
  ((TD() && TD().week) || []).forEach(w => { if (isIso(w.date)) s.add(w.date.slice(0, 7)); });
  return [...s].sort();
};
async function load(force = false) {
  if (!web() || LOADING || (!force && Date.now() - (C.at || 0) < 120000)) return;
  LOADING = true;
  const before = JSON.stringify([C.fb, C.notes, readLocal(SET_KEY)]);
  try {
    if (outbox().length) await flush();
    const ms = monthsNeeded();
    const jobs = [U.fetchSettings()].concat(ms.map(m => getJson(fbPath(m))), ms.map(m => getJson(notePath(m))));
    const res = await Promise.all(jobs);
    if (res.some(r => !r.ok)) return;
    ms.forEach((m, i) => { C.fb[m] = normLog(res[1 + i].data).entries; C.notes[m] = normLog(res[1 + ms.length + i].data).entries; });
    C.at = Date.now(); saveC();
  } finally { LOADING = false; }
  if (JSON.stringify([C.fb, C.notes, readLocal(SET_KEY)]) !== before) rerender();
}

// Ansicht = zuletzt geladener Stand + noch nicht übertragene Änderungen
function viewLog(kind) {
  const src = kind === "fb" ? C.fb : C.notes;
  const by = {};
  Object.keys(src).forEach(m => { by[m] = { entries: (src[m] || []).slice() }; });
  outbox().filter(o => o.kind === (kind === "notes" ? "note" : kind)).forEach(op => { const p = opPath(op), m = p.slice(-12, -5); by[m] = applyOp(p, by[m] || null, op); });
  return Object.values(by).flatMap(x => x.entries);
}
function settingsView() {
  let d = readLocal(SET_KEY);
  if (!d) { const T = TD(); d = T ? { overrides: T.overrides || {}, status: T.status || null } : {}; }
  return outbox().filter(o => o.kind === "ov" || o.kind === "st").reduce((x, op) => applyOp("settings.json", x, op), d);
}
const pendingFor = test => outbox().some(test);
const overrides = () => pruneOv(settingsView().overrides);
const statusNow = () => {
  const s = plain(settingsView().status), td = todayIso();
  return {
    sick: isIso(s.sick_until) && s.sick_until >= td ? s.sick_until : null,
    pause: isIso(s.pause_until) && s.pause_until >= td ? s.pause_until : null,
    nights: cleanNs(s.night_shifts),
    lists: Object.fromEntries(SLISTS.map(L => [L.key, cleanNs(s[L.key])])),
    updated: s.updated || null,
  };
};
const noteFor = date => viewLog("notes").find(n => n.date === date) || null;

// Neu zeichnen – aber nie, während jemand tippt (sonst gehen Eingaben verloren)
let RR = false;
function rerender() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "button" && a.type !== "radio" && a.type !== "checkbox") {
    if (!RR) { RR = true; a.addEventListener("blur", () => { RR = false; setTimeout(rerender, 50); }, { once: true }); }
    return;
  }
  if (sheetOpen()) return;  // Blatt offen: nach dem Schließen neu zeichnen
  A.rerender();
}
const SHEETS = ["acSheet", "acAdj"];
const sheetOpen = () => SHEETS.map($).find(x => x && !x.hidden) || null;

// =============================================================================================
// 1) Bewerten
// =============================================================================================
const acts = () => ((U.G || G).activities || []).filter(a => a && !a.multi);
const actOn = date => acts().filter(a => a.date === date).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
const sportOfAct = a => U.groupOf ? U.groupOf(a.type) : null;
const sameT = (a, b) => String(a || "").trim() === String(b || "").trim();
// App-Bewertung ohne Aktivitäts-ID (z. B. geplante Einheit bewertet, bevor Garmin synchronisiert hat) gehört zur
// passenden Garmin-Aktivität desselben Tags: gleicher Titel, sonst gleiche Sportart, sonst die einzige Aktivität des Tags.
function ownerAct(e) {
  if (!e || e.activity_id != null || !isIso(e.date)) return null;
  const L = actOn(e.date);
  if (!L.length) return null;
  return L.find(a => sameT(a.name, e.title)) || (e.sport ? L.find(a => sportOfAct(a) === e.sport) : null) || (L.length === 1 ? L[0] : null);
}
function appFb(u) {
  const L = viewLog("fb");
  if (u.id != null) return L.find(x => x.activity_id != null && String(x.activity_id) === String(u.id))
    || L.find(x => { const a = ownerAct(x); return !!a && String(a.id) === String(u.id); }) || null;
  return L.find(x => x.activity_id == null && x.date === u.date && sameT(x.title, u.title)) || null;
}
// Einheit = {id, date, time, title, sport, rpe, feel (Garmin), planned}
function unitFrom(a) { return { id: a.id ?? null, date: a.date, time: a.time || "", title: a.name || "Einheit", sport: sportOfAct(a), rpe: a.rpe ?? null, feel: a.feel || null, planned: null, dur: a.dur }; }
function recentUnits(T) {
  const F = T && T.feedback;
  let list;
  if (F && Array.isArray(F.recent)) {
    list = F.recent.map(r => {
      const a = acts().find(x => x.date === r.date && x.name === r.title);
      return { ...(a ? unitFrom(a) : { id: null, date: r.date, time: "", title: r.title }), rpe: r.rpe ?? (a ? a.rpe ?? null : null), feel: r.feel || (a && a.feel) || null, planned: r.planned || null };
    });
  } else list = acts().slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 3).map(unitFrom);
  // in der App bewertete Einheiten ohne Garmin-Aktivität (z. B. heute, noch nicht synchronisiert)
  viewLog("fb").filter(e => e.activity_id == null && e.title && isIso(e.date) && t(e.date) >= t(todayIso()) - 3 * DAY && !ownerAct(e) && !list.some(u => u.date === e.date && u.title === e.title))
    .forEach(e => list.push({ id: null, date: e.date, time: "", title: e.title, sport: e.sport || null, rpe: null, feel: null, planned: null }));
  return list.sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 3);
}
const UNITS = new Map();  // Schlüssel → Einheit (für Klicks)
function uKey(u) { const k = u.id != null ? "a" + u.id : "d" + u.date + "|" + u.title; UNITS.set(k, u); return k; }
function rated(u) {
  const e = appFb(u);
  // Teilbewertung (nur Anstrengung / nur Gefühl / nur Notiz): fehlende Werte aus Garmin ergänzen
  return { rpe: e && e.rpe != null ? e.rpe : u.rpe, feel: e && e.feel ? e.feel : u.feel, note: e ? e.note : null, app: !!e, pending: !!e && pendingFor(o => o.kind === "fb" && fbKey(o.e) === fbKey(e)) };
}
const isOpen = r => r.rpe == null && !r.feel && !r.note;
function unitRow(u, ref, meta) {
  const r = rated(u), open = isOpen(r), f = feelOf(r.feel);
  const label = `${u.title}: ${open ? "noch nicht bewertet – jetzt bewerten" : `${r.rpe != null ? `Anstrengung ${r.rpe} von 10` : "ohne Anstrengung"}${r.feel ? ", Gefühl " + r.feel : ""}${r.note ? ", mit Notiz" : ""} – ändern`}`;
  return `<li><button type="button" class="acfb" data-ac="fb" data-k="${esc(uKey(u))}" aria-label="${esc(label)}">
    <span class="ttl">${esc(u.title)}</span>
    <span class="rpe">${open ? `<span class="pill acopen">offen</span>` : `${r.rpe != null ? `<span class="rpe-v">${esc(r.rpe)}<small>/10</small></span>` : ""}${r.feel ? `<span class="rpe-feel">${f ? f.ic : ""}${esc(r.feel)}</span>` : ""}${r.rpe == null && !r.feel && r.note ? `<span class="rpe-feel">${AI.note}Notiz</span>` : ""}`}</span>
    <span class="meta">${esc(meta)}${r.pending ? " · wartet auf Verbindung" : ""}</span></button></li>`;
}
function enhanceFeedback(T) {
  const host = $("hFeedback");
  if (!host) return;
  const ul = host.querySelector("ul.fb"), units = recentUnits(T);
  const relD = iso => { const n = Math.round((t(todayIso()) - t(iso)) / DAY); return n === 0 ? "Heute" : n === 1 ? "Gestern" : dShort(iso); };
  const html = units.length ? `<ul class="fb acfbl">${units.map(u => unitRow(u, null, `${relD(u.date)}${u.planned ? ` · geplant: ${u.planned}` : ""}`)).join("")}</ul>` : `<p class="note">Noch keine Einheiten erfasst.</p>`;
  if (ul) ul.outerHTML = html;
  else { const p = host.querySelector("p.note"); if (p && /Noch keine Einheiten/.test(p.textContent)) p.outerHTML = html; else host.querySelector("h3").insertAdjacentHTML("afterend", html); }
  const h3 = host.querySelector("h3");
  if (h3 && !h3.querySelector(".acinfo")) h3.insertAdjacentHTML("beforeend", glBtn("rpe"));
  const desc = host.querySelector("p.desc");
  if (desc) desc.textContent = "Antippen und Anstrengung (1–10) & Gefühl eintragen – oder auf der Uhr bzw. in Garmin Connect";
  host.querySelectorAll(".hint").forEach(h => { if (/Noch ohne Bewertung/.test(h.textContent)) h.remove(); });
  const open = units.filter(u => isOpen(rated(u)));
  if (open.length) host.insertAdjacentHTML("beforeend", `<div class="hint">${IC.pen}<span><b>Noch ohne Bewertung:</b> ${open.map(u => esc(u.title)).join(", ")} – antippen und kurz bewerten. Garvis passt den Plan daran an.</span></div>`);
}

// Blatt „Bewerten“
const FB = { u: null, rpe: null, feel: null, note: "", note0: "", busy: false, msg: null, ret: null };
const fbCan = () => web() && !FB.busy && (FB.rpe != null || !!FB.feel || !!FB.note.trim());
function sheetEl() {
  let s = $("acSheet");
  if (s) return s;
  s = document.createElement("div"); s.id = "acSheet"; s.className = "acsheet"; s.hidden = true;
  s.innerHTML = `<div class="acsheet-back" data-fbs="close"></div><div class="acsheet-p" role="dialog" aria-modal="true" aria-labelledby="acShT"><div id="acShB"></div></div>`;
  document.body.appendChild(s);
  s.addEventListener("click", e => {
    const b = e.target.closest("[data-fbs]"); if (!b) return;
    const a = b.dataset.fbs;
    if (a === "close") return closeSheet(false, b.classList.contains("acsheet-back"));
    if (a === "rpe") { FB.rpe = +b.dataset.v; return drawSheet("rpe"); }
    if (a === "feel") { FB.feel = b.dataset.v; return drawSheet("feel"); }
    if (a === "save") return saveFb();
  });
  s.addEventListener("input", e => {
    if (e.target.name !== "fbnote") return;
    FB.note = e.target.value;
    const b = s.querySelector('[data-fbs="save"]'); if (b) b.disabled = !fbCan();  // nur Notiz reicht auch
  });
  return s;
}
// Escape: erst Popover, dann Blatt (vor dem Escape der Tagesansicht in app.js)
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && POP) { e.stopPropagation(); return closePop(); }
    const s = sheetOpen();
    if (!s) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (s.id === "acAdj") closeAdj(); else closeSheet(); }
    if (e.key === "Tab") {  // Fokus im Blatt halten
      const f = [...s.querySelectorAll("button, textarea, input, a[href]")].filter(x => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
}, true);
function openSheet(u) {
  const r = rated(u);
  Object.assign(FB, { u, rpe: r.rpe != null ? Math.max(1, Math.min(10, Math.round(r.rpe))) : null, feel: r.feel || null, note: r.note || "", note0: r.note || "", busy: false, msg: null, ret: document.activeElement });
  const s = sheetEl();
  s.hidden = false; document.documentElement.classList.add("ac-lock");
  drawSheet();
  const h = $("acShT"); if (h) h.focus({ preventScroll: true });
}
// force: nach dem Speichern. Sonst: getippte Notiz nicht kommentarlos verwerfen (v. a. versehentliches Tippen auf den Hintergrund).
function closeSheet(force = false, backdrop = false) {
  const s = $("acSheet"); if (!s || s.hidden) return;
  if (!force && FB.note.trim() && FB.note.trim() !== String(FB.note0 || "").trim()
    && !window.confirm(backdrop ? "Blatt schließen und die getippte Notiz verwerfen?" : "Getippte Notiz verwerfen?")) return;
  s.hidden = true; document.documentElement.classList.remove("ac-lock");
  if (FB.ret && FB.ret.isConnected) FB.ret.focus({ preventScroll: true });
  rerender();
}
function drawSheet(focus) {
  const u = FB.u, g = u.rpe != null || u.feel, can = fbCan();
  const when = `${dRelC(u.date)}${u.time ? ` · ${u.time} Uhr` : ""}${u.dur ? ` · ${Math.round(u.dur)} min` : ""}`;
  $("acShB").innerHTML = `<div class="acsh-h"><div><div class="kicker">${esc(when)}</div><h3 id="acShT" tabindex="-1">${esc(u.title)}</h3></div>
      <button type="button" class="iconbtn" data-fbs="close" aria-label="Schließen">${AI.x}</button></div>
    ${g ? `<p class="note" style="margin:0 0 12px">Aus Garmin: ${u.rpe != null ? `Anstrengung ${esc(u.rpe)}/10` : ""}${u.rpe != null && u.feel ? " · " : ""}${u.feel ? `Gefühl ${esc(u.feel)}` : ""}</p>` : ""}
    <div class="acsh-l" id="acRpeL">Anstrengung ${glBtn("rpe")}</div>
    <div class="acrpe" role="radiogroup" aria-labelledby="acRpeL">${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<button type="button" role="radio" data-fbs="rpe" data-v="${v}" aria-checked="${FB.rpe === v}" aria-label="${v} – ${RPE_WORD(v)}" style="--c:${v <= 4 ? "var(--q3)" : v <= 6 ? "var(--q4)" : v <= 8 ? "var(--q5)" : "var(--q6)"}"><b>${v}</b><small>${RPE_WORD(v)}</small></button>`).join("")}</div>
    <p class="acrpe-d" aria-live="polite">${FB.rpe ? `<b>${FB.rpe}/10 · ${esc(RPE_WORD(FB.rpe))}:</b> ${esc(RPE_DESC[FB.rpe])}` : "Wie hart war es insgesamt? 1 = sehr leicht, 10 = maximal."}</p>
    <div class="acsh-l" id="acFeelL">Gefühl</div>
    <div class="acfeel" role="radiogroup" aria-labelledby="acFeelL">${FEELS.map(f => `<button type="button" role="radio" data-fbs="feel" data-v="${esc(f.k)}" aria-checked="${FB.feel === f.k}">${f.ic}<span>${esc(f.k)}</span></button>`).join("")}</div>
    <label class="acsh-l" for="acFbNote">Notiz <span class="muted">optional</span></label>
    <textarea id="acFbNote" name="fbnote" rows="2" maxlength="300" placeholder="z. B. Beine schwer, Wind von vorn, Knie zwickt">${esc(FB.note)}</textarea>
    ${FB.msg ? hint(FB.msg.kind, FB.msg.icon, FB.msg.html) : !web() ? hint("", AI.info, LOCAL_HINT) : ""}
    <div class="formfoot"><button type="button" class="btn" data-fbs="save"${can ? "" : " disabled"}>${FB.busy ? "Speichere …" : "Speichern"}</button>
      <button type="button" class="txtbtn" data-fbs="close">Abbrechen</button>
      <span class="muted">${FB.rpe == null && !FB.feel ? "Eins reicht: Anstrengung, Gefühl oder Notiz" : ""}</span></div>`;
  if (focus) { const b = $("acShB").querySelector(`[data-fbs="${focus}"][aria-checked="true"]`); if (b) b.focus({ preventScroll: true }); }
}
async function saveFb() {
  const u = FB.u;
  if (!u || !fbCan()) return;
  const e = { activity_id: u.id != null && !isNaN(+u.id) ? +u.id : null, date: u.date, title: u.title, rpe: FB.rpe ?? null, feel: FB.feel || null, note: FB.note.trim() || null, updated: new Date().toISOString() };
  if (u.sport) e.sport = u.sport;  // für die Zuordnung zur späteren Garmin-Aktivität
  const old = appFb(u), ops = [];
  if (old && old.activity_id == null && e.activity_id != null) ops.push({ kind: "fb", e: old, del: true });  // vorläufige Bewertung jetzt der Garmin-Aktivität zuordnen
  ops.push({ kind: "fb", e });
  FB.busy = true; FB.msg = null; drawSheet();
  const res = await commit(ops);
  FB.busy = false;
  if (res === "ok") {
    closeSheet(true); toast("Bewertung gespeichert – Plan wird angepasst …");
    replan_();  // Bewertung (und Notiz darin) fließt sofort in die Planung ein
    return;
  }
  if (res === "queued") { closeSheet(true); toast("Offline – Bewertung wird gesendet, sobald du online bist"); return; }
  if (res && res.kept) { closeSheet(true); keptToast("Bewertung"); return; }
  FB.msg = resMsg(res); drawSheet();
}

// =============================================================================================
// 2) Plan anpassen (Tagesansicht) – settings.overrides
// =============================================================================================
const AC = {};  // je Datum: { mode: "move"|"swap"|null, msg, busy }
const acOf = d => (AC[d] ||= { mode: null, msg: null, busy: false });
const weekDays = () => ((TD() && TD().week) || []).filter(w => isIso(w.date));
const wTitle = w => w ? (w.type === "rest" ? "Ruhetag" : w.type === "done" ? "Training geschafft" : w.title || "Training") : "";
const altOf = (d, T) => d.alternative || (T && T.date === d.date && T.recommendation && T.recommendation.alternative) || null;
function ovText(date, o, T) {
  if (!o) return "";
  if (o.action === "skip") return `Einheit fällt aus${SKIP_WHY[o.reason] ? ` (${SKIP_WHY[o.reason]})` : ""}`;
  if (o.action === "shorten") return `Kürzer: nur ${o.minutes} min`;
  if (o.action === "alternative") { const w = weekDays().find(x => x.date === date), a = w && altOf(w, T); return a ? `Alternative statt Plan: ${a.title}${a.duration ? ` (${a.duration} min)` : ""}` : "Alternative statt Plan"; }
  if (o.action === "move") return `Verschoben auf ${dShort(o.to)}`;
  if (o.action === "swap") return `Getauscht mit ${dShort(o.with)}`;
  return o.action;
}
const SKIP_WHY = { dienst: "Dienst", krank: "krank", keine_zeit: "keine Zeit", muede: "müde" };
// Änderungen, die diesen Tag betreffen: eigene (Quelle) oder als Ziel einer Verschiebung/eines Tauschs
function ovFor(date) {
  const O = overrides(), out = [];
  if (O[date]) out.push({ src: date, o: O[date], own: true });
  Object.entries(O).forEach(([k, o]) => {
    if (k === date) return;
    if (o.action === "move" && o.to === date) out.push({ src: k, o, own: false, txt: `Einheit von ${dShort(k)} hierher verschoben` });
    if (o.action === "swap" && o.with === date) out.push({ src: k, o, own: false, txt: `Getauscht mit ${dShort(k)}` });
  });
  return out;
}
const SKIP_UNDO = new Set();
async function setOverride(date, v, okText, opt = {}) {
  const st = acOf(date);
  if (st.busy) return;
  const prev = overrides()[date] || null;
  st.busy = true; st.mode = null; st.msg = null;
  const res = await commit({ kind: "ov", date, v }, true);
  st.busy = false;
  st.msg = res === "ok" ? null : resMsg(res);
  if (res === "ok" || res === "queued") {
    if (opt.undo !== false) undoToast(res === "queued" ? `${okText} – offline gepuffert` : okText, () => setOverride(date, prev, prev ? "Wiederhergestellt" : "Änderung zurückgenommen", { undo: false }));
  } else if (res && res.kept) keptToast("Planänderung");
  rerender();
  return res;
}
function planCard(d, T) {
  const date = d.date, st = acOf(date), mine = ovFor(date);
  const W = weekDays(), td = todayIso();
  const others = W.filter(w => w.date >= td && w.date !== date);
  const alt = altOf(d, T), restNoTrain = d.type === "rest" || d.type === "done";
  const own = mine.find(m => m.own);
  let body = "";
  if (mine.length) {
    body += mine.map(m => `<div class="acov"><span class="acov-i">${AI.swap}</span><div><b>Von dir geändert:</b> ${esc(m.own ? ovText(date, m.o, T) : m.txt)}
      <small>${m.o.created ? `am ${esc(stamp(m.o.created))}` : ""}${pendingFor(o => o.kind === "ov" && o.date === m.src) ? " · wartet auf Verbindung" : ""}</small></div>
      <button type="button" class="txtbtn" data-ac="ov-undo" data-date="${esc(m.src)}"${st.busy ? " disabled" : ""}>Rückgängig</button></div>`).join("");
  }
  if (!own && !restNoTrain) {
    if (st.mode === "move" || st.mode === "swap") {
      const mv = st.mode === "move";
      body += `<div class="acpick" role="group" aria-label="${mv ? "Verschieben auf" : "Tauschen mit"}"><div class="acsh-l">${mv ? "Verschieben auf …" : "Tauschen mit …"}</div>
        ${others.length ? others.map(w => `<button type="button" class="acday" data-ac="${mv ? "ov-move" : "ov-swap"}" data-date="${esc(date)}" data-to="${esc(w.date)}">
          <b>${esc(dRelC(w.date))}${dRel(w.date) !== dShort(w.date) ? ` · ${esc(dShort(w.date))}` : ""}</b><span>${esc(wTitle(w))}</span>${AI.chev}</button>`).join("") : `<p class="note">Keine weiteren Tage in dieser Woche.</p>`}
        <button type="button" class="txtbtn" data-ac="ov-cancel" data-date="${esc(date)}">Abbrechen</button></div>`;
    } else {
      body += `<div class="acbar">
        ${alt ? `<button type="button" class="acbtn" data-ac="ov-alt" data-date="${esc(date)}">${AI.alt}<span>Alternative nehmen<small>${esc(alt.title)}${alt.duration && !/\d\s*min/.test(alt.title) ? ` · ${esc(alt.duration)} min` : ""}</small></span></button>` : ""}
        <button type="button" class="acbtn" data-ac="ov-mode" data-mode="move" data-date="${esc(date)}"${others.length ? "" : " disabled"}>${AI.move}<span>Verschieben …</span></button>
        <button type="button" class="acbtn" data-ac="ov-mode" data-mode="swap" data-date="${esc(date)}"${others.length ? "" : " disabled"}>${AI.swap}<span>Tauschen …</span></button>
        <button type="button" class="acbtn" data-ac="ov-skip" data-date="${esc(date)}">${AI.skip}<span>Ausfallen lassen</span></button></div>`;
    }
  }
  if (!body) return "";
  const msg = st.msg ? hint(st.msg.kind, st.msg.icon, st.msg.html) : !web() ? hint("", AI.info, LOCAL_HINT) : "";
  return `<article class="card acplan" data-noswipe><h3 class="chead">${AI.swap}Plan anpassen</h3>
    ${!own && !restNoTrain && !st.mode ? `<p class="desc">Passt der Tag nicht? Garvis plant den Rest der Woche drumherum neu.</p>` : ""}
    ${body}${msg}${mine.length || st.msg ? replanHint() : ""}</article>`;
}

// =============================================================================================
// 3) Status: Krank, Trainingspause, Nachtdienst – settings.status
// =============================================================================================
const SS = { msg: null, busy: false, nsDate: "", sickDate: "", pauseDate: "" };
async function setStatus(op, okText, undoOp) {
  if (SS.busy) return;
  SS.busy = true; SS.msg = null; drawStatus();
  const res = await commit({ kind: "st", ...op }, true);
  SS.busy = false;
  SS.msg = res === "ok" ? null : resMsg(res);
  if ((res === "ok" || res === "queued") && undoOp) undoToast(okText, () => setStatus(undoOp, "Wiederhergestellt"));
  else if (res === "ok" || res === "queued") toast(okText);
  else if (res && res.kept) keptToast("Status");
  DETAILS.status.sub = statusSub(); A.refreshMenu();
  drawStatus(); rerender();
  return res;
}
const STATUS_HTML = `<h2>Status</h2><p class="sub">Krank, Trainingspause oder Dienste – Garvis plant entsprechend um.</p><div id="acStBody"></div>`;
function renderStatus() {
  const sec = $("status");
  if (!sec.dataset.built) {
    sec.innerHTML = STATUS_HTML; sec.dataset.built = "1";
    sec.addEventListener("click", statusClick);
    sec.addEventListener("input", e => { const f = e.target.dataset.st; if (f) SS[f] = e.target.value; });
  }
  drawStatus();
  load();
}
function statusClick(e) {
  const b = e.target.closest("[data-st-act]"); if (!b || b.disabled) return;
  const a = b.dataset.stAct, v = b.dataset.v, S = statusNow(), td = todayIso();
  const inp = k => { const n = $("acSt_" + k); return n && isIso(n.value) ? n.value : null; };
  const bad = msg => { SS.msg = { kind: "bad", icon: AI.warning, html: esc(msg) }; drawStatus(); };
  if (a === "sick" || a === "pause") {
    const until = v === "date" ? inp(a) : addDays(td, +v);
    if (!until) return bad("Bitte ein Datum wählen.");
    if (until < td) return bad("Das Datum liegt in der Vergangenheit.");
    const key = a === "sick" ? "sick_until" : "pause_until", old = a === "sick" ? S.sick : S.pause;
    return setStatus({ set: { [key]: until } }, `${a === "sick" ? "Krank" : "Trainingspause"} bis ${dShort(until)} gespeichert`, { set: { [key]: old } });
  }
  if (a === "sick-end") return setStatus({ set: { sick_until: null } }, "Krank-Status beendet", { set: { sick_until: S.sick } });
  if (a === "pause-end") return setStatus({ set: { pause_until: null } }, "Trainingspause beendet", { set: { pause_until: S.pause } });
  // Dienste: data-l = Listenschlüssel (night_shifts, late_shifts, shifts_24h, oncall); ns-* = ältere Knöpfe
  const lk = b.dataset.l || "night_shifts", L = SL[lk];
  if (!L) return;
  if (a === "ls-add" || a === "ns-add") {
    const d = v === "date" ? inp(lk) : addDays(td, +v);
    if (!d) return bad("Bitte ein Datum wählen.");
    if (d < addDays(td, -1)) return bad("Das Datum liegt zu weit in der Vergangenheit.");
    if (S.lists[lk].includes(d)) return bad(`${L.name} am ${dShort(d)} ist schon eingetragen.`);
    return setStatus({ add: { [lk]: [d] } }, `${L.name} ${dRel(d)} eingetragen`, { del: { [lk]: [d] } });
  }
  if (a === "ls-del" || a === "ns-del") return setStatus({ del: { [lk]: [v] } }, `${L.name} ${dRel(v)} entfernt`, { add: { [lk]: [v] } });
}
function drawStatus() {
  const host = $("acStBody");
  if (!host) return;
  const S = statusNow(), td = todayIso(), dis = !web() || SS.busy ? " disabled" : "";
  const dateIn = (k, min) => `<input type="date" id="acSt_${k}" data-st="${k}Date" min="${min}" value="${esc(SS[k + "Date"] || "")}" aria-label="Datum wählen${SL[k] ? ": " + SL[k].name : ""}"${dis}>`;
  const row = (ic, title, state, active, controls) => `<div class="acst${active ? " on" : ""}"><span class="mi">${ic}</span><div class="acst-m"><b>${title}</b><small>${state}</small>${controls}</div></div>`;
  host.innerHTML = `<div class="card acstc">
    ${row(AI.sick, "Krank", S.sick ? `Aktiv bis ${esc(dLong(S.sick))} – kein Training, danach sanfter Wiedereinstieg` : "Aus", !!S.sick,
      S.sick ? `<div class="acst-c"><button type="button" class="txtbtn" data-st-act="sick-end"${dis}>Beenden</button><span class="muted">oder verlängern:</span>${dateIn("sick", td)}<button type="button" class="txtbtn" data-st-act="sick" data-v="date"${dis}>Setzen</button></div>`
      : `<div class="acst-c"><button type="button" class="chipb" data-st-act="sick" data-v="0"${dis}>bis heute</button><button type="button" class="chipb" data-st-act="sick" data-v="1"${dis}>bis morgen</button><button type="button" class="chipb" data-st-act="sick" data-v="2"${dis}>3 Tage</button>
        <span class="acst-d"><span class="muted">bis</span>${dateIn("sick", td)}<button type="button" class="txtbtn" data-st-act="sick" data-v="date"${dis}>Setzen</button></span></div>`)}
    ${row(AI.pause, "Trainingspause", S.pause ? `Aktiv bis ${esc(dLong(S.pause))} – Urlaub, Verletzung oder einfach Pause` : "Aus", !!S.pause,
      S.pause ? `<div class="acst-c"><button type="button" class="txtbtn" data-st-act="pause-end"${dis}>Beenden</button><span class="muted">oder ändern:</span>${dateIn("pause", td)}<button type="button" class="txtbtn" data-st-act="pause" data-v="date"${dis}>Setzen</button></div>`
      : `<div class="acst-c"><button type="button" class="chipb" data-st-act="pause" data-v="6"${dis}>1 Woche</button><button type="button" class="chipb" data-st-act="pause" data-v="13"${dis}>2 Wochen</button>
        <span class="acst-d"><span class="muted">bis</span>${dateIn("pause", td)}<button type="button" class="txtbtn" data-st-act="pause" data-v="date"${dis}>Setzen</button></span></div>`)}
    ${SLISTS.map(L => { const ds = S.lists[L.key], k = L.key; return row(AI[L.ic], L.name, `${ds.length ? (ds.length === 1 ? "Eingetragen" : ds.length + "× eingetragen") : "Keiner eingetragen"} – ${L.hint}`, !!ds.length,
      `${ds.length ? `<div class="acst-c">${ds.map(d => `<span class="acns">${esc(dRelC(d))}${dRel(d) !== dShort(d) ? ` <span class="muted">${esc(dShort(d))}</span>` : ""}<button type="button" data-st-act="ls-del" data-l="${k}" data-v="${esc(d)}" aria-label="${esc(L.name)} ${esc(dShort(d))} entfernen"${dis}>${AI.x}</button></span>`).join("")}</div>` : ""}
      <div class="acst-c">${ds.includes(td) ? "" : `<button type="button" class="chipb" data-st-act="ls-add" data-l="${k}" data-v="0"${dis}>heute</button>`}${ds.includes(addDays(td, 1)) ? "" : `<button type="button" class="chipb" data-st-act="ls-add" data-l="${k}" data-v="1"${dis}>morgen</button>`}
        <span class="acst-d">${dateIn(k, td)}<button type="button" class="txtbtn" data-st-act="ls-add" data-l="${k}" data-v="date"${dis}>Hinzufügen</button></span></div>`); }).join("")}
    </div>
    ${SS.msg ? hint(SS.msg.kind, SS.msg.icon, SS.msg.html) : !web() ? hint("", AI.info, LOCAL_HINT) : ""}
    ${replanHint()}
    <p class="note">${S.updated ? `Zuletzt geändert: ${esc(stamp(S.updated))}. ` : ""}Garvis plant nach jeder Änderung neu – krank: kein Training, danach locker; Nachtdienst: am Tag danach nur Erholung; Spätdienst: Training vor dem Dienst; 24-h-Dienst: kein Training, danach Erholung; Bereitschaft: nur kurze, abbrechbare Einheiten.</p>`;
  placeOutboxNote(host);
}
// Heute: kompakte Chips, nur wenn aktiv
function statusChips() {
  const old = $("acStat"); if (old) old.remove();
  const S = statusNow(), td = todayIso(), chips = [];
  if (S.sick) chips.push({ ic: AI.sick, txt: `Krank bis ${dRel(S.sick)}`, act: "sick-end", v: "", lbl: "Krank-Status beenden" });
  if (S.pause) chips.push({ ic: AI.pause, txt: `Trainingspause bis ${dRel(S.pause)}`, act: "pause-end", v: "", lbl: "Trainingspause beenden" });
  SLISTS.forEach(L => S.lists[L.key].filter(d => d <= addDays(td, 2) && (d >= td || L.after)).forEach(d => chips.push({ ic: AI[L.ic], txt: d < td ? L.after : `${L.name} ${dRel(d)}`, act: "ls-del", l: L.key, v: d, lbl: `${L.name} ${dShort(d)} entfernen` })));
  if (!chips.length) return;
  const div = document.createElement("div");
  div.id = "acStat"; div.className = "acstat";
  div.innerHTML = chips.map(c => `<span class="acchip"><a href="#mehr/status">${c.ic}<span>${esc(c.txt)}</span></a><button type="button" data-st-act="${c.act}"${c.l ? ` data-l="${c.l}"` : ""} data-v="${esc(c.v)}" aria-label="${esc(c.lbl)}">${AI.x}</button></span>`).join("");
  div.addEventListener("click", statusClick);
  const sech = document.querySelector("#v-heute .sech");
  if (sech) sech.before(div);
}

// =============================================================================================
// 4) Notiz zum Tag – logs/notes
// =============================================================================================
const NT = {};  // je Datum: { draft, msg, busy }
const ntOf = d => (NT[d] ||= { draft: null, msg: null, busy: false });
function noteCard(date) {
  const n = noteFor(date), st = ntOf(date), val = st.draft != null ? st.draft : n ? n.text : "";
  const pend = pendingFor(o => o.kind === "note" && o.date === date), dis = !web() || st.busy;
  return `<article class="card acnote" data-date="${esc(date)}"><h3 class="chead">${AI.note}Notiz${n ? `<span class="r muted" style="font-size:12px">${pend ? "wartet auf Verbindung" : n.updated ? esc(stamp(n.updated)) : ""}</span>` : ""}</h3>
    <p class="desc">Garvis berücksichtigt Beschwerden wie „Knie zwickt“ bei der Planung.</p>
    <label class="vh" for="acNote_${esc(date)}">Notiz für ${esc(dLong(date))}</label>
    <textarea id="acNote_${esc(date)}" data-ac-note="${esc(date)}" rows="3" maxlength="500" placeholder="z. B. Knie zwickt, schlecht geschlafen, viel Stress">${esc(val)}</textarea>
    <div class="formfoot" style="margin-top:10px"><button type="button" class="btn" data-ac="note-save" data-date="${esc(date)}"${dis ? " disabled" : ""}>${st.busy ? "Speichere …" : "Speichern"}</button>
      ${n ? `<button type="button" class="txtbtn" data-ac="note-del" data-date="${esc(date)}"${dis ? " disabled" : ""}>Löschen</button>` : ""}</div>
    ${st.msg ? hint(st.msg.kind, st.msg.icon, st.msg.html) : !web() ? hint("", AI.info, LOCAL_HINT) : ""}</article>`;
}
async function saveNote(date, text, okText, undoText) {
  const st = ntOf(date);
  if (st.busy) return;
  const prev = noteFor(date);
  st.busy = true; st.msg = null;
  const res = await commit({ kind: "note", date, text: text || null });
  st.busy = false;
  if (res === "ok" || res === "queued") {
    st.draft = null; st.msg = res === "queued" ? resMsg(res) : null;
    if (undoText !== false) undoToast(res === "queued" ? `${okText} – offline gepuffert` : okText, () => saveNote(date, prev ? prev.text : null, "", false));
  } else st.msg = resMsg(res);
  rerender();
}
document.addEventListener("input", e => { const d = e.target.dataset && e.target.dataset.acNote; if (d) ntOf(d).draft = e.target.value; });

// =============================================================================================
// Tagesansicht / Heute / Woche (Hooks)
// =============================================================================================
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ac]");
  if (!b || b.disabled) return;
  const a = b.dataset.ac, date = b.dataset.date, T = TD();
  if (a === "fb") { const u = UNITS.get(b.dataset.k); if (u) openSheet(u); return; }
  if (a === "adj") return openAdj(b.dataset.step || null);  // „Passt heute nicht?“ (Plan-Karte) bzw. „Krank melden“ (Krankheits-Hinweis)
  if (a === "ov-mode") { acOf(date).mode = b.dataset.mode; acOf(date).msg = null; return rerender(); }
  if (a === "ov-cancel") { acOf(date).mode = null; return rerender(); }
  const mk = (action, extra = {}) => ({ action, to: null, with: null, ...extra, created: new Date().toISOString() });
  if (a === "ov-skip") return setOverride(date, mk("skip"), `${dRelC(date)}: Einheit fällt aus`);
  if (a === "ov-alt") return setOverride(date, mk("alternative"), `${dRelC(date)}: Alternative gewählt`);
  if (a === "ov-move") return setOverride(date, mk("move", { to: b.dataset.to }), `Verschoben auf ${dShort(b.dataset.to)}`);
  if (a === "ov-swap") return setOverride(date, mk("swap", { with: b.dataset.to }), `Getauscht mit ${dShort(b.dataset.to)}`);
  if (a === "ov-undo") { const prev = overrides()[date]; return setOverride(date, null, "Änderung zurückgenommen", { undo: !!prev }); }
  if (a === "note-save") {
    const ta = document.querySelector(`textarea[data-ac-note="${CSS.escape(date)}"]`), txt = ta ? ta.value.trim() : "";
    if (!txt) { if (!noteFor(date)) { ntOf(date).msg = { kind: "bad", icon: AI.warning, html: "Bitte zuerst etwas eintragen." }; return rerender(); } return saveNote(date, null, "Notiz gelöscht"); }
    return saveNote(date, txt, "Notiz gespeichert");
  }
  if (a === "note-del") { ntOf(date).draft = null; return saveNote(date, null, "Notiz gelöscht"); }
});

function fbCard(date, d, T) {
  const list = actOn(date).map(unitFrom), td = todayIso();
  if (!list.length && date === td && d && d.type && d.type !== "rest" && d.title && !/kein Zeitfenster/i.test(d.title)) list.push({ id: null, date, time: d.start || "", title: d.title, sport: d.sport || null, rpe: null, feel: null, planned: null, plannedOnly: true });
  viewLog("fb").filter(e => e.activity_id == null && e.title && e.date === date && !ownerAct(e) && !list.some(u => u.title === e.title)).forEach(e => list.push({ id: null, date, time: "", title: e.title, sport: e.sport || null, rpe: null, feel: null }));
  if (!list.length) return "";
  return `<article class="card acfbc"><h3 class="chead">${IC.pen}${list.length === 1 ? "Einheit bewerten" : "Einheiten bewerten"} ${glBtn("rpe")}</h3>
    <p class="desc">Antippen: Anstrengung (1–10) und Gefühl – Garvis passt die nächsten Tage daran an.</p>
    <ul class="fb acfbl">${list.map(u => unitRow(u, null, [u.time && `${u.time} Uhr`, u.dur && `${Math.round(u.dur)} min`, u.plannedOnly && "geplant · noch nicht von Garmin übertragen"].filter(Boolean).join(" · ") || dRelC(date))).join("")}</ul></article>`;
}
function pastHead(body, iso) {
  const head = body.firstElementChild;
  if (!head) return;
  const L = actOn(iso), min = L.reduce((s, a) => s + (a.dur || 0), 0), mon = weekMonday(), td = todayIso();
  const prev = iso > mon ? addDays(iso, -1) : null, next = addDays(iso, 1) <= td ? addDays(iso, 1) : null;
  head.classList.add("ds-head");
  head.innerHTML = `<div class="kicker">${esc(dLong(iso))}</div>
    <div class="plan-head" style="margin-top:8px"><span class="sic">${IC.check}</span><h2 class="plan-title" id="dsTitle" tabindex="-1">Rückblick</h2></div>
    <p class="note" style="margin:0">${L.length ? `${L.length === 1 ? "1 Aktivität" : L.length + " Aktivitäten"} · ${Math.round(min)} min: ${L.map(a => esc(a.name)).join(", ")}` : "Keine Aktivität von Garmin für diesen Tag."}</p>
    <div class="acnav">${prev ? `<a href="#woche/${prev}" data-replace="1">${IC.chev.replace("<path", '<path transform="rotate(180 12 12)"')}${esc(dShort(prev))}</a>` : "<span></span>"}<a href="#woche/${next || td}" data-replace="1">${esc(next === td || !next ? "Heute" : dShort(next))}${IC.chev}</a></div>`;
}
document.addEventListener("click", e => { const a = e.target.closest("a[data-replace]"); if (a) { e.preventDefault(); location.replace(a.getAttribute("href")); } });

function dayHook(body, d, ctx) {
  if (!body || !d || !isIso(d.date)) return;
  const T = TD(), date = d.date, td = todayIso(), past = date < td;
  if (ctx && ctx.unplanned) { if (!past || date < weekMonday()) return; pastHead(body, date); }
  const head = body.querySelector(".ds-head") || body.firstElementChild;
  let html = "";
  if (!past && !(ctx && ctx.unplanned)) html += planCard(d, T);
  if (date <= td) html += fbCard(date, d, T);
  if (html && head) head.insertAdjacentHTML("afterend", html);
  placeOutboxNote(body);
  // Notiz: ans Ende (vor „Zur Heute-Ansicht“)
  const link = body.querySelector(":scope > .ds-link");
  if (link) link.insertAdjacentHTML("beforebegin", noteCard(date)); else body.insertAdjacentHTML("beforeend", noteCard(date));
  // Glossar + Anstrengung im Klartext
  body.querySelectorAll(":scope > article.card").forEach(c => { if (!c.matches(".acnote, .acplan, .acfbc")) { humanizeRpe(c); glRow(c); } });
  load(); flush();
}
function todayHook(T) {
  statusChips();
  rateCallout();
  const al = $("hAlerts"); if (al) { placeOutboxNote(al); al.hidden = !al.innerHTML.trim(); }
  enhanceFeedback(T);
  const plan = $("hPlan");
  if (plan) { humanizeRpe(plan); glRow(plan); adjRow(plan); }
  const ready = $("hReady");
  if (ready) {
    const k = ready.querySelector(":scope > .kicker");
    if (k && !k.querySelector(".acinfo")) k.insertAdjacentHTML("beforeend", glBtn("readiness"));
    const fr = ready.querySelector("a.formrow");
    if (fr && !fr.parentElement.classList.contains("acfr")) {
      const w = document.createElement("div"); w.className = "acfr"; fr.before(w); w.appendChild(fr); w.insertAdjacentHTML("beforeend", glBtn("form"));
    }
    ready.querySelectorAll(".factor > span:first-child").forEach(s => {
      const k2 = /HRV/i.test(s.textContent) ? "hrv" : /Body Battery/i.test(s.textContent) ? "bb" : null;
      if (k2 && !s.querySelector(".acinfo")) s.insertAdjacentHTML("beforeend", glBtn(k2));
    });
  }
  load(); flush();
}
function weekHook(list, W) {
  const rows = list.querySelectorAll(".drow");
  (W || []).forEach((w, i) => {
    const r = rows[i]; if (!r) return;
    const n = noteFor(w.date), ov = ovFor(w.date);
    const dt = r.querySelector(".dt");
    if (n && dt) dt.insertAdjacentHTML("beforeend", `<i class="acdot" title="Notiz: ${esc(n.text.slice(0, 80))}">${AI.note}</i>`);
    const dl = r.querySelector("a.dlink .vh");
    if (dl && (n || ov.length)) dl.textContent += [n ? " · mit Notiz" : "", ov.length ? " · von dir geändert" : ""].join("");
    if (ov.length) {
      const card = r.querySelector(".day");
      const m = ov[0];
      if (card) card.insertAdjacentHTML("beforeend", `<div class="acwk">${AI.swap}<span><b>Von dir geändert:</b> ${esc(m.own ? ovText(w.date, m.o, TD()) : m.txt)}</span></div>`);
    }
  });
  // vergangene Tage der laufenden Woche (Rückblick, Notiz, Bewertung, Kraft nachtragen)
  const mon = weekMonday(), td = todayIso();
  if (mon < td && W && W.length) {
    const days = []; for (let d = mon; d < td; d = addDays(d, 1)) days.push(d);
    const div = document.createElement("div");
    div.className = "acpast"; div.style.gridColumn = "1 / -1";
    div.innerHTML = `<span class="kicker">Diese Woche bisher</span><div class="acpast-l">${days.map(d => {
      const n = !!noteFor(d), a = actOn(d).length;
      return `<a href="#woche/${d}" aria-label="${esc(dLong(d))}${a ? `, ${a} ${a === 1 ? "Aktivität" : "Aktivitäten"}` : ""}${n ? ", mit Notiz" : ""}"><span>${WD[wdi(t(d))]}</span><b>${new Date(t(d)).getUTCDate()}</b><i>${a ? `<em class="acdotf"></em>` : ""}${n ? AI.note : ""}</i></a>`;
    }).join("")}</div>`;
    list.prepend(div);
  }
  load();
}

// =============================================================================================
// 5) „Passt heute nicht?“ – ein Blatt auf Heute: Plan ändern (Alternative, kürzer, verschieben, ausfallen + Grund)
//    und Status/Dienste (krank, Nacht-, Spät-, 24-h-Dienst, Bereitschaft). Speichern = settings.json + Neuplanung.
//    Neu: overrides[datum] = {action: "shorten", minutes} und {action: "skip", reason}; status.late_shifts/shifts_24h/oncall.
// =============================================================================================
const ADJ = { step: null, ret: null };
const toMin = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
const shortOpts = dur => [20, 30, 45, 60, 75, 90].filter(m => m <= dur - 10).slice(-4);
// Plan für das echte Heute: Empfehlung (wenn TODAY.date = heute), sonst der vorläufige Eintrag aus dem Wochenplan
function adjDay() {
  const T = TD(), td = todayIso();
  const w = weekDays().find(x => x.date === td) || null, R = T && T.date === td ? T.recommendation : null;
  if (!w && !R) return null;
  const d = { ...(w || {}), date: td };
  if (R) { if (R.level) d.type = R.level; ["title", "sport", "duration", "start", "end"].forEach(k => { if (R[k] != null) d[k] = R[k]; }); if (R.alternative) d.alternative = R.alternative; }
  if (!d.end && d.start && d.duration && toMin(d.start) != null) { const e = Math.min(toMin(d.start) + +d.duration, 1439); d.end = `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; }
  return d;
}
function adjEl() {
  let s = $("acAdj");
  if (s) return s;
  s = document.createElement("div"); s.id = "acAdj"; s.className = "acsheet"; s.hidden = true;
  s.innerHTML = `<div class="acsheet-back" data-adj="close"></div><div class="acsheet-p" role="dialog" aria-modal="true" aria-labelledby="acAdjT"><div id="acAdjB"></div></div>`;
  document.body.appendChild(s);
  s.addEventListener("click", adjClick);
  return s;
}
function openAdj(step = null) {
  const s = adjEl();
  ADJ.step = step; ADJ.ret = document.activeElement;
  s.hidden = false; document.documentElement.classList.add("ac-lock");
  drawAdj();
  load();
}
function closeAdj() {
  const s = $("acAdj"); if (!s || s.hidden) return;
  s.hidden = true; document.documentElement.classList.remove("ac-lock");
  if (ADJ.ret && ADJ.ret.isConnected) ADJ.ret.focus({ preventScroll: true });
  rerender();
}
function drawAdj() {
  const host = $("acAdjB"); if (!host) return;
  const T = TD(), d = adjDay(), td = todayIso(), S = statusNow(), O = overrides()[td] || null;
  const train = !!d && !!d.type && d.type !== "rest" && d.type !== "done" && !!d.title && !/kein Zeitfenster/i.test(d.title);
  const alt = d && altOf(d, T), dur = d ? +d.duration || 0 : 0, opts = shortOpts(dur);
  const others = weekDays().filter(w => w.date > td), dis = web() ? "" : " disabled";
  const back = `<button type="button" class="txtbtn acadj-back" data-adj="step" data-v="">Zurück</button>`;
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  let body = "";
  if (ADJ.step === "short" && opts.length) {
    body = `<div class="acsh-l">Kürzer – wie viel Zeit hast du?</div>
      <div class="acchips">${opts.map(m => `<button type="button" class="chipb" data-adj="short" data-v="${m}"${dis}>nur ${m} min</button>`).join("")}</div>
      <p class="note">Statt ${dur} min. Garvis plant die Einheit beim nächsten Planungslauf auf diese Dauer.</p>${back}`;
  } else if (ADJ.step === "move") {
    body = `<div class="acsh-l">Verschieben auf …</div><div class="acpick">${others.length ? others.map(w => `<button type="button" class="acday" data-adj="move" data-v="${esc(w.date)}"${dis}>
        <b>${esc(dRelC(w.date))}${dRel(w.date) !== dShort(w.date) ? ` · ${esc(dShort(w.date))}` : ""}</b><span>${esc(wTitle(w))}</span>${AI.chev}</button>`).join("") : `<p class="note">Keine weiteren Tage im Wochenplan.</p>`}</div>${back}`;
  } else if (ADJ.step === "skip") {
    body = `<div class="acsh-l">Ausfallen – warum?</div>
      <div class="acbar">${Object.entries(SKIP_WHY).map(([k, l]) => `<button type="button" class="acbtn" data-adj="skip" data-v="${k}"${dis}>${k === "krank" ? AI.sick : k === "dienst" ? AI.h24 : k === "muede" ? AI.night : AI.clock}<span>${esc(cap(l))}</span></button>`).join("")}</div>
      <p class="note">Der Grund hilft beim Umplanen – z. B. nach „müde“ etwas lockerer weiter.</p>${back}`;
  } else if (ADJ.step === "sick") {
    body = `<div class="acsh-l">Krank – bis wann?</div>
      ${S.sick ? `<p class="note" style="margin:0 0 8px">Eingetragen bis ${esc(dLong(S.sick))}.</p>` : ""}
      <div class="acchips">${[[0, "bis heute"], [1, "bis morgen"], [2, "3 Tage"], [6, "1 Woche"]].map(([n, l]) => `<button type="button" class="chipb" data-adj="sick" data-v="${n}"${dis}${S.sick === addDays(td, n) ? ' aria-pressed="true"' : ""}>${l}</button>`).join("")}
        ${S.sick ? `<button type="button" class="chipb" data-adj="sick-end"${dis}>Wieder gesund</button>` : ""}</div>
      <p class="note">Kein Training, danach ein sanfter Wiedereinstieg. Bei Fieber nicht trainieren.</p>${back}`;
  } else {
    if (O) body += `<div class="acov"><span class="acov-i">${AI.swap}</span><div><b>Von dir geändert:</b> ${esc(ovText(td, O, T))}
        <small>${O.created ? `am ${esc(stamp(O.created))}` : ""}${pendingFor(o => o.kind === "ov" && o.date === td) ? " · wartet auf Verbindung" : ""}</small></div>
        <button type="button" class="txtbtn" data-adj="undo"${dis}>Rückgängig</button></div>`;
    if (train && !O) body += `<div class="acsh-l">Training heute</div><div class="acbar">
        ${alt ? `<button type="button" class="acbtn acwide" data-adj="alt"${dis}>${AI.alt}<span>Alternative<small>${esc(alt.title)}${alt.duration && !/\d\s*min/.test(alt.title) ? ` · ${esc(alt.duration)} min` : ""}</small></span></button>` : ""}
        ${opts.length ? `<button type="button" class="acbtn" data-adj="step" data-v="short">${AI.short}<span>Kürzer<small>nur ${opts[0]}–${opts.at(-1)} min</small></span></button>` : ""}
        <button type="button" class="acbtn" data-adj="step" data-v="move"${others.length ? "" : " disabled"}>${AI.move}<span>Verschieben …</span></button>
        <button type="button" class="acbtn" data-adj="step" data-v="skip">${AI.skip}<span>Ausfallen …</span></button></div>`;
    body += `<div class="acsh-l">Heute ist …</div><div class="acadj-st">
      <div class="acadj-r"><span class="acadj-n">${AI.sick}<b>Krank</b>${S.sick ? `<small>bis ${esc(dRel(S.sick))}</small>` : ""}</span>
        <span class="acadj-t"><button type="button" class="chipb" data-adj="step" data-v="sick"${S.sick ? ' aria-pressed="true"' : ""}>${S.sick ? "Ändern …" : "Melden …"}</button></span></div>
      ${SLISTS.map(L => `<div class="acadj-r"><span class="acadj-n">${AI[L.ic]}<b>${esc(L.name)}</b></span><span class="acadj-t" role="group" aria-label="${esc(L.name)}">${[0, 1].map(i => {
        const dd = addDays(td, i), on = S.lists[L.key].includes(dd);
        return `<button type="button" class="chipb" data-adj="list" data-l="${L.key}" data-v="${dd}" aria-pressed="${on}" aria-label="${esc(L.name)} ${i ? "morgen" : "heute"}${on ? " – eingetragen, antippen zum Entfernen" : ""}"${dis}>${on ? AI.check : ""}${i ? "morgen" : "heute"}</button>`; }).join("")}</span></div>`).join("")}
      </div>`;
  }
  host.innerHTML = `<div class="acsh-h"><div><div class="kicker">Heute · ${esc(dShort(td))}</div><h3 id="acAdjT" tabindex="-1">Passt heute nicht?</h3></div>
      <button type="button" class="iconbtn" data-adj="close" aria-label="Schließen">${AI.x}</button></div>
    ${d && d.title ? `<p class="note" style="margin:0">Geplant: <b>${esc(d.type === "rest" ? "Ruhetag" : d.title)}</b>${train && dur ? ` · ${dur} min` : ""}${d.start && train ? ` · ${esc(d.start)} Uhr` : ""}</p>` : ""}
    ${body}
    ${!web() ? hint("", AI.info, LOCAL_HINT) : ""}
    ${outboxNote()}
    <p class="note acadj-f">Garvis plant nach dem Speichern neu. Längere Zeiträume (Pause, mehrere Dienste): <a href="#mehr/status" data-adj="link">Mehr › Status</a></p>`;
  humanizeRpe(host);
  const h = $("acAdjT"); if (h) h.focus({ preventScroll: true });
}
function adjClick(e) {
  const b = e.target.closest("[data-adj]"); if (!b || b.disabled) return;
  const a = b.dataset.adj, v = b.dataset.v, td = todayIso();
  if (a === "close" || a === "link") return closeAdj();  // Link navigiert selbst weiter
  if (a === "step") { ADJ.step = v || null; return drawAdj(); }
  const S = statusNow(), mk = (action, extra = {}) => ({ action, to: null, with: null, ...extra, created: new Date().toISOString() });
  closeAdj();  // sofort schließen – Rückmeldung per Hinweis (mit „Rückgängig“), Neuplanung startet automatisch
  if (a === "alt") return setOverride(td, mk("alternative"), "Heute: Alternative gewählt");
  if (a === "short") return setOverride(td, mk("shorten", { minutes: +v }), `Heute: nur ${v} min`);
  if (a === "move") return setOverride(td, mk("move", { to: v }), `Verschoben auf ${dShort(v)}`);
  if (a === "skip") return setOverride(td, mk("skip", { reason: v }), `Heute fällt aus (${SKIP_WHY[v] || "ohne Grund"})`);
  if (a === "undo") { const prev = overrides()[td]; return setOverride(td, null, "Änderung zurückgenommen", { undo: !!prev }); }
  if (a === "sick") { const until = addDays(td, +v); return setStatus({ set: { sick_until: until } }, `Krank bis ${dRel(until)} gespeichert – gute Besserung`, { set: { sick_until: S.sick } }); }
  if (a === "sick-end") return setStatus({ set: { sick_until: null } }, "Krank-Status beendet", { set: { sick_until: S.sick } });
  if (a === "list") {
    const L = SL[b.dataset.l]; if (!L || !isIso(v)) return;
    return S.lists[L.key].includes(v)
      ? setStatus({ del: { [L.key]: [v] } }, `${L.name} ${dRel(v)} entfernt`, { add: { [L.key]: [v] } })
      : setStatus({ add: { [L.key]: [v] } }, `${L.name} ${dRel(v)} eingetragen`, { del: { [L.key]: [v] } });
  }
}
// Plan-Karte auf Heute: „Passt heute nicht?“ + eigene Änderung für heute
function adjRow(plan) {
  if (!plan || plan.querySelector(":scope > .acadj")) return;
  const td = todayIso(), O = overrides()[td], T = TD();
  if (!T) return;
  plan.insertAdjacentHTML("beforeend", `<div class="acadj">${O ? `<div class="acwk">${AI.swap}<span><b>Von dir geändert:</b> ${esc(ovText(td, O, T))}${pendingFor(o => o.kind === "ov" && o.date === td) ? " · wartet auf Verbindung" : ""}</span></div>` : ""}
    <button type="button" class="txtbtn acadj-b" data-ac="adj">${AI.swap}<span>Passt heute nicht?</span></button></div>`);
}
// Oben auf Heute: „Wie war's? – Bewerten“, sobald das Training vorbei ist (geplantes Ende erreicht, erledigt
// oder schon von Garmin übertragen) und noch keine Bewertung vorliegt
function rateCallout() {
  const old = $("acRate"); if (old) old.remove();
  const T = TD(), td = todayIso(); if (!T) return;
  const R = T.date === td ? T.recommendation : null, d = adjDay();
  const type = R ? R.level : d ? d.type : null, title = d ? d.title : null;
  const now = new Date(), end = d ? toMin(d.end) : null, ended = end != null && now.getHours() * 60 + now.getMinutes() >= end;
  let units = actOn(td).map(unitFrom);
  if (!units.length && !(type === "done" || ended)) return;
  if (!units.length) {
    const DA = R && R.done_activity;
    if (DA && DA.name) units = [{ id: DA.id ?? null, date: td, time: DA.time || "", title: DA.name, sport: d && d.sport || null, rpe: DA.rpe ?? null, feel: null, planned: null }];
    else if (type && type !== "rest" && title && !/kein Zeitfenster/i.test(title)) units = [{ id: null, date: td, time: d.start || "", title, sport: d.sport || null, rpe: null, feel: null, planned: null, plannedOnly: true }];
  }
  const open = units.filter(u => isOpen(rated(u)));
  if (!open.length) return;
  const u = open[0], div = document.createElement("div");
  div.id = "acRate"; div.className = "card acrate";
  div.innerHTML = `<span class="acrate-i">${IC.pen}</span><div><b>Wie war's?</b><small>${esc(u.title)}${open.length > 1 ? ` und ${open.length - 1} weitere` : ""} – kurz bewerten, Garvis plant die nächsten Tage danach.</small></div>
    <button type="button" class="btn" data-ac="fb" data-k="${esc(uKey(u))}">Bewerten</button>`;
  const sech = document.querySelector("#v-heute .sech");
  if (sech) sech.before(div);
}

// =============================================================================================
// 6) Glossar-Seite
// =============================================================================================
function renderGlossar() {
  const sec = $("glossar");
  sec.innerHTML = `<h2>Glossar</h2><p class="sub">Fachbegriffe aus Plan und Auswertungen, kurz erklärt</p>
    <div class="card acglc">${Object.entries(GL).map(([k, g]) => `<section id="gl-${k}" class="acgle"><h3>${esc(g.t)}</h3><p>${esc(g.d)}</p></section>`).join("")}</div>`;
}

// =============================================================================================
// 7) Datenexport
// =============================================================================================
const EX = { busy: false, msg: null, out: null };
async function listTree(path, files, depth = 0) {
  const r = await gh(fileUrl(path));
  if (r.status === 404) return true;
  if (r.status !== 200 || !Array.isArray(r.body)) { EX.err = r; return false; }
  for (const it of r.body) {
    if (it.type === "dir" && depth < 4) { if (!(await listTree(it.path, files, depth + 1))) return false; }
    else if (it.type === "file" && /\.json$/i.test(it.name)) files.push(it.path);
  }
  return true;
}
async function fetchAll(prefixes) {
  const files = [];
  for (const p of prefixes) if (!(await listTree(p, files))) return null;
  const out = {};
  for (let i = 0; i < files.length; i += 6) {
    const part = await Promise.all(files.slice(i, i + 6).map(p => getJson(p).then(r => [p, r])));
    for (const [p, r] of part) { if (!r.ok) { EX.err = r.r; return null; } out[p] = r.data; }
    EX.msg = { kind: "", icon: AI.clock, html: `Lade … ${Math.min(files.length, i + 6)}/${files.length} Dateien` }; drawExport();
  }
  return out;
}
const csvCell = v => { if (v == null) return ""; const s = typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => "\uFEFF" + rows.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
function strengthRows(F) {
  const names = readLocal("garvis.strength.names") || {}, rows = [["Datum", "Übung", "Übungs-ID", "Satz", "Wiederholungen", "Gewicht kg", "Anstrengung (RPE)", "Notiz"]];
  Object.keys(F).filter(p => /^logs\/strength\/\d{4}-\d{2}\.json$/.test(p)).sort().forEach(p => normLog(F[p]).entries.forEach(e => (e.sets || []).forEach((s, i) =>
    rows.push([e.date, names[e.exercise_id] || e.exercise_id, e.exercise_id, i + 1, s.reps, s.weight_kg, s.rpe, i === 0 ? e.note : null]))));
  return rows;
}
function nutritionRows(F) {
  const rows = [["Datum", "Uhrzeit", "Mahlzeit", "Name", "Menge", "Einheit", "kcal", "Kohlenhydrate g", "Eiweiß g", "Fett g", "Ballaststoffe g"]];
  Object.keys(F).filter(p => /^logs\/nutrition\/\d{4}-\d{2}-\d{2}\.json$/.test(p)).sort().forEach(p => {
    const d = plain(F[p]), date = d.date || p.slice(-15, -5);
    (Array.isArray(d.entries) ? d.entries : []).forEach(e => rows.push([date, e.time, e.meal, e.name, e.amount_g, e.amount_g != null ? "g" : null, e.kcal, e.carbs_g, e.protein_g, e.fat_g, e.fiber_g]));
    if (d.water_ml) rows.push([date, null, "Getränke", "Wasser", d.water_ml, "ml", null, null, null, null, null]);
  });
  return rows;
}
function feedbackRows(F) {
  const rows = [["Datum", "Einheit", "Aktivitäts-ID", "Anstrengung (1–10)", "Gefühl", "Notiz", "Quelle", "Geändert"]], seen = new Set();
  Object.keys(F).filter(p => /^logs\/feedback\/\d{4}-\d{2}\.json$/.test(p)).sort().forEach(p => normLog(F[p]).entries.forEach(e => { seen.add(fbKey(e)); rows.push([e.date, e.title, e.activity_id, e.rpe, e.feel, e.note, "App", e.updated]); }));
  acts().filter(a => a.rpe != null || a.feel).forEach(a => { if (!seen.has("a" + a.id)) rows.push([a.date, a.name, a.id, a.rpe, a.feel, null, "Garmin", null]); });
  rows.splice(1, rows.length, ...rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  return rows;
}
const EXPORTS = {
  json: { name: "Alles (JSON)", sub: "settings.json und alle Einträge unter logs/", file: "garvis-export", ext: "json", mime: "application/json" },
  kraft: { name: "Kraft-Einträge (CSV)", sub: "Ein Satz je Zeile", file: "garvis-kraft", ext: "csv", mime: "text/csv", rows: strengthRows, pre: ["logs/strength"] },
  ernaehrung: { name: "Ernährung (CSV)", sub: "Mahlzeiten und Wasser je Tag", file: "garvis-ernaehrung", ext: "csv", mime: "text/csv", rows: nutritionRows, pre: ["logs/nutrition"] },
  bewertungen: { name: "Bewertungen (CSV)", sub: "Anstrengung & Gefühl aus App und Garmin", file: "garvis-bewertungen", ext: "csv", mime: "text/csv", rows: feedbackRows, pre: ["logs/feedback"] },
};
async function prepareExport(kind) {
  if (EX.busy || !web()) return;
  const X = EXPORTS[kind];
  EX.busy = true; EX.out = null; EX.err = null; EX.msg = { kind: "", icon: AI.clock, html: "Lade Daten aus garvis-data …" }; drawExport();
  let text = null;
  try {
    if (kind === "json") {
      const F = await fetchAll(["logs"]);
      const s = F && await getJson("settings.json");
      if (F && s && s.ok) text = JSON.stringify({ app: "Garvis", exported: new Date().toISOString(), repo: DATA_REPO, files: { "settings.json": s.data, ...F } }, null, 2);
      else if (s && !s.ok) EX.err = s.r;
    } else {
      const F = await fetchAll(X.pre);
      if (F) text = csv(X.rows(F));
    }
  } finally { EX.busy = false; }
  if (text == null) { EX.msg = { kind: "bad", icon: AI.warning, html: esc(errText(EX.err || { status: 0 }, "Export")) }; return drawExport(); }
  const name = `${X.file}-${todayIso()}.${X.ext}`;
  EX.out = { kind, name, mime: X.mime, text, size: new Blob([text]).size };
  EX.msg = null; drawExport();
  const b = $("acExShare") || $("acExDown"); if (b) b.focus();
}
function deliver(how) {
  const o = EX.out; if (!o) return;
  const blob = new Blob([o.text], { type: o.mime + ";charset=utf-8" });
  if (how === "share") {
    try {
      const f = new File([blob], o.name, { type: o.mime });
      navigator.share({ files: [f], title: o.name }).catch(e => { if (e && e.name !== "AbortError") { EX.msg = { kind: "bad", icon: AI.warning, html: "Teilen nicht möglich – bitte „Herunterladen“ verwenden." }; drawExport(); } });
    } catch (e) { EX.msg = { kind: "bad", icon: AI.warning, html: "Teilen nicht möglich – bitte „Herunterladen“ verwenden." }; drawExport(); }
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = o.name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const canShareFiles = () => { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File(["x"], "x.json", { type: "application/json" })] })); } catch (e) { return false; } };
function renderExport() {
  const sec = $("export");
  if (!sec.dataset.built) {
    sec.dataset.built = "1";
    sec.innerHTML = `<h2>Meine Daten exportieren</h2><p class="sub">Deine Einträge aus garvis-data als Datei – zum Sichern oder für Excel &amp; Numbers</p><div id="acExBody"></div>`;
    sec.addEventListener("click", e => {
      const b = e.target.closest("[data-ex]"); if (!b || b.disabled) return;
      if (b.dataset.ex === "share" || b.dataset.ex === "down") return deliver(b.dataset.ex);
      prepareExport(b.dataset.ex);
    });
  }
  drawExport();
}
function drawExport() {
  const host = $("acExBody"); if (!host) return;
  const dis = !web() || EX.busy ? " disabled" : "", o = EX.out;
  host.innerHTML = `<div class="card menu-card">${Object.entries(EXPORTS).map(([k, X]) => `<div class="setrow"><span class="mi">${k === "json" ? AI.down : IC.list}</span><span><b>${esc(X.name)}</b><small>${esc(X.sub)}</small></span>
      <button type="button" class="txtbtn" data-ex="${k}"${dis}>${o && o.kind === k ? "Neu laden" : "Erstellen"}</button></div>`).join("")}</div>
    ${o ? `<div class="card acexo"><div><b>${esc(o.name)}</b><small>${nf(o.size / 1024, o.size < 10240 ? 1 : 0)} KB · bereit</small></div>
      <div class="formfoot" style="margin-top:12px">${canShareFiles() ? `<button type="button" class="btn" id="acExShare" data-ex="share">${AI.share}Teilen / Sichern</button>` : ""}
        <button type="button" class="${canShareFiles() ? "txtbtn" : "btn"}" id="acExDown" data-ex="down">${AI.down}Herunterladen</button></div></div>` : ""}
    ${EX.msg ? hint(EX.msg.kind, EX.msg.icon, EX.msg.html) : !web() ? hint("", AI.info, "Lokal geöffnet (Datei) – der Export lädt deine Daten aus GitHub und geht nur in der Garvis-App (iPhone bzw. Browser).") : ""}
    <p class="note">CSV-Dateien nutzen Semikolon und Dezimalkomma (passt für Excel und Numbers auf Deutsch). Garmin-Rohdaten exportierst du in Garmin Connect.</p>`;
}

// ---------- Anmelden ----------
const mk = id => { if ($(id)) return; const s = document.createElement("section"); s.id = id; s.hidden = true; $("mDetail").appendChild(s); };
["status", "glossar", "export"].forEach(mk);
const statusSub = () => { const S = statusNow(), a = [S.sick && `Krank bis ${dShort(S.sick)}`, S.pause && `Pause bis ${dShort(S.pause)}`, ...SLISTS.map(L => S.lists[L.key].length && `${L.name} ${S.lists[L.key].map(dRel).join(", ")}`)].filter(Boolean); return a.length ? a.join(" · ") : "Krank, Pause, Nacht-/Spät-/24-h-Dienst, Bereitschaft"; };
const DETAILS = {
  status: { name: "Status", sub: statusSub(), icon: AI.status, render: renderStatus, noRange: true, group: "settings" },
  glossar: { name: "Glossar", sub: "Anstrengung, Form, Zonen, FTP, HRV …", icon: AI.book, render: renderGlossar, noRange: true },
  export: { name: "Meine Daten exportieren", sub: "JSON oder CSV (Kraft, Ernährung, Bewertungen)", icon: AI.down, render: renderExport, noRange: true, group: "settings" },
};
window.GarvisActions = { toast, undo: undoToast, rpeText, rpeWord: RPE_WORD, humanizeRpe, glossary: GL, openGlossary: openPop,
  // Gemeinsamer Puffer-Helfer für andere Module (z. B. strength.js): nie verwerfen, nur bei dauerhaften Fehlern melden
  outbox: { count: () => outbox().length, error: obErr, retry: () => flush(true), transient, note: outboxNote },
  openAdjust: step => openAdj(step) };
A.register({ id: "actions", details: DETAILS, hooks: {
  today: T => { DETAILS.status.sub = statusSub(); todayHook(T); },
  week: weekHook, day: dayHook,
} });
setTimeout(() => { flush(); load(); }, 1200);
})();
