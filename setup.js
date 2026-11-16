/* Garvis – Einrichtung „Garvis einrichten“ (Zusatzmodul, per <script src="setup.js"> in index.html):
   Geführter Assistent in 5 kurzen Schritten (Blatt von unten), jederzeit unter Mehr › Einstellungen › „Garvis einrichten“.
   1 Körper (settings.nutrition.weight_kg/height_cm/body_fat_pct) · 2 Arbeit (settings.work) · 3 Zuhause & Training
   (settings.locations, Zuhause-Eintrag) · 4 Ernährung (settings.nutrition.program/diet/avoid) · 5 Ziel (Link auf Ziel & Fokus)
   Jeder Schritt speichert beim „Weiter“ sofort über den Offline-Puffer (window.GarvisActions.saveSettings); „Fertig“
   setzt settings.setup = {done: true, at} und stößt einmal „Neu planen“ an. Fortsetzen: zuletzt offener Schritt (localStorage).
   Beim ersten Öffnen einmal von selbst, wenn wichtige Angaben fehlen (Arbeitszeit, Orte, Ernährungsprogramm).
   Wartet auf app.js + actions.js (index.html lädt dieses Skript vor app.js; die anderen Module lädt app.js selbst). */
(() => {
let tries = 0;
const boot = () => {
  const A = window.GarvisApp;
  // erst anmelden, wenn actions.js (letztes Modul) da ist – sonst zählt app.js dieses Modul beim Start mit und zeichnet zu früh
  if (A && A.api && (window.GarvisActions || tries > 80)) return init(A);
  if (++tries < 400) setTimeout(boot, 100);
};
boot();

function init(A) {
if (window.GarvisSetup) return;
const U = A.api;
const { IC, esc, nf, WD, readLocal, writeLocal, SET_KEY } = U;
const $ = id => document.getElementById(id);
const web = () => !!(window.GARVIS && window.GARVIS.web);
const GA = () => window.GarvisActions || null;
const settings = () => readLocal(SET_KEY) || {};   // saveSettings schreibt sofort hierher (inkl. offline gepufferter Änderungen)
const plain = o => o && typeof o === "object" && !Array.isArray(o) ? o : {};
const svgI = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SI = {
  setup: svgI('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  work: svgI('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>'),
  apple: svgI('<path d="M12 7.5c-1.5-1.2-5-1.5-6.3 1.4-1.4 3.2.6 8.6 3 10.3 1.2.8 2.2.4 3.3 0 1.1.4 2.1.8 3.3 0 2.4-1.7 4.4-7.1 3-10.3C17 6 13.5 6.3 12 7.5z"/><path d="M12 7.5c0-2 1-3.5 3-4"/>'),
  locate: svgI('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  back: svgI('<path d="M15 5l-7 7 7 7"/>'),
};

// ---------- Stammdaten (gleiche Schlüssel und Texte wie nutrition.js / strength.js / actions.js / app.js) ----------
const PROGS = [   // nutrition.js PROGS (Name + Kurzbeschreibung)
  { k: "off", n: "Aus", d: "Keine Ernährungstipps" },
  { k: "S", n: "S · Fueling-Ampel", d: "Gerichte-Vorschläge passend zum Training, nichts eintragen" },
  { k: "M", n: "M · Schnell-Check", d: "Wie S, dazu 1–3 Antippen am Tag (Fueling, Trinken, Gewicht)" },
  { k: "L", n: "L · Tracking", d: "Wie M, dazu Mahlzeiten schnell erfassen (Barcode, Favoriten)" },
];
const AVOID = [["laktose", "Laktose"], ["milch", "Milcheiweiß"], ["gluten", "Gluten"], ["nuss", "Nüsse"], ["erdnuss", "Erdnuss"], ["ei", "Ei"], ["soja", "Soja"],
  ["fisch", "Fisch"], ["meeresfruechte", "Meeresfrüchte"], ["sesam", "Sesam"], ["sellerie", "Sellerie"], ["senf", "Senf"], ["huelsenfruechte", "Hülsenfrüchte"],
  ["schwein", "Schwein"], ["rind", "Rind"], ["gefluegel", "Geflügel"], ["alkohol", "Alkohol (Kochen)"]];   // nutrition.js AVOID
const DIETS = [{ k: "omnivore", n: "Mischkost" }, { k: "pescetarian", n: "Pescetarisch" }, { k: "vegetarian", n: "Vegetarisch" }, { k: "vegan", n: "Vegan" }];   // nutrition.js DIETS
const EQUIP_FB = [   // strength.js EQUIP (Ersatz, falls window.GarvisLocations.equip fehlt)
  ["road_bike", "Rennrad draußen"], ["zwift", "Rolle/Zwift"], ["gym", "Fitnessstudio"], ["treadmill", "Laufband"],
  ["pool_indoor", "Hallenbad"], ["pool_outdoor", "Freibad"], ["open_water", "Meer/See"], ["run", "Laufen draußen"],
  ["dumbbells", "Kurzhanteln"], ["kettlebell", "Kettlebell"], ["bands", "Widerstandsbänder"], ["pullup_bar", "Klimmzugstange"],
];
const EQUIP = () => { const L = window.GarvisLocations; return L && Array.isArray(L.equip) && L.equip.length ? L.equip : EQUIP_FB; };
const POOL = { pool_m: { eq: "pool_indoor", n: "Hallenbad", def: 25 }, pool_outdoor_m: { eq: "pool_outdoor", n: "Freibad", def: 50 } };   // strength.js POOL
const TEMPS = [0, 5, 8, 10, 12, 15], TEMP_DEF = 10;   // recommend.py outdoor_limit (Standard 10 °C)
const WK_DEF = { days: [0, 1, 2, 3, 4], start: "07:30", end: "17:00", commute_min: 30 };   // actions.js WK_DEF (Annahme des Planers)
const GOAL_NAME = { balanced: "Ausgeglichen", race: "Wettkampf", performance: "Leistungsziel", strength: "Kraft" };   // app.js GOAL_TYPES
const SPORT_NAME = { triathlon: "Triathlon", run: "Laufen", bike: "Rad", swim: "Schwimmen" };   // app.js GOAL_SPORTS
const STEPS = [
  { k: "body", n: "Körper", ic: IC.user, d: "Gewicht und Größe – für Portionen, Trink- und Eiweißmengen" },
  { k: "work", n: "Arbeit & Dienste", ic: SI.work, d: "Wann du arbeitest – Garvis plant Training drumherum" },
  { k: "home", n: "Zuhause & Training", ic: IC.home, d: "Was du zu Hause zum Trainieren hast" },
  { k: "food", n: "Ernährung", ic: SI.apple, d: "Wie viel Unterstützung beim Essen und Trinken" },
  { k: "goal", n: "Ziel", ic: IC.target, d: "Worauf Garvis hinarbeitet" },
];
const LS = "garvis.setup.wiz", AUTO = "garvis.setup.auto";

// ---------- Helfer ----------
const num = v => { const s = String(v == null ? "" : v).trim().replace(",", "."); if (!s) return null; const n = +s; return Number.isFinite(n) ? n : NaN; };
const r1 = v => Math.round(v * 10) / 10;
const isHm = x => /^([01]\d|2[0-3]):[0-5]\d$/.test(x || "");
const slug = s => String(s || "ort").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "ort";   // wie strength.js
const daysTxt = ds => { const s = [...ds].sort((a, b) => a - b); if (!s.length) return "keine festen Arbeitstage"; const run = s.every((d, i) => !i || d === s[i - 1] + 1); return run && s.length > 2 ? `${WD[s[0]]}–${WD[s.at(-1)]}` : s.map(d => WD[d]).join(", "); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wiz = () => readLocal(LS) || {};
const isDone = () => !!plain(settings().setup).done;
const profile = () => (window.GARMIN && window.GARMIN.profile) || {};
const nutri = () => plain(settings().nutrition);
const workOf = s => {
  const w = plain(s.work), c = w.commute_min;
  return { days: Array.isArray(w.days) ? w.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : WK_DEF.days.slice(),
    start: isHm(w.start) ? w.start : WK_DEF.start, end: isHm(w.end) ? w.end : WK_DEF.end,
    commute_min: c != null && c !== "" && Number.isFinite(+c) ? +c : WK_DEF.commute_min };
};
const locList = () => {
  const L = window.GarvisLocations, own = settings().locations;
  const list = L && L.list ? L.list() : Array.isArray(own) ? own : [];
  return list.filter(l => l && typeof l === "object").map(l => ({ ...l, equipment: Array.isArray(l.equipment) ? l.equipment.slice() : [] }));
};
const savedLocs = () => Array.isArray(settings().locations) && settings().locations.length > 0;
const homeOf = list => list.find(l => l.home) || list[0] || null;
const goalNow = () => {
  const s = settings(), T = window.TODAY, tg = T && T.goal;
  const genMs = T && T.generated ? Date.parse(String(T.generated).replace(" ", "T")) : 0;
  const g = s.goal && s.goal.type && (!tg || Date.parse(s.updated || 0) > genMs) ? s.goal : tg && tg.type ? tg : null;   // wie app.js currentGoal
  if (!g) return null;
  const name = g.type === "balanced" ? "Ausgeglichen" : g.title || g.event || (g.type === "strength" ? "Kraft" : SPORT_NAME[g.sport]) || GOAL_NAME[g.type] || "Ziel";
  return { name, kind: g.type === "balanced" ? "Fokus" : GOAL_NAME[g.type] || "Ziel", date: g.date || null };
};

// Zusammenfassung je Schritt (Detailseite + Schritt 5)
function summary(k) {
  const s = settings(), n = plain(s.nutrition);
  if (k === "body") { const a = [n.weight_kg != null && `${nf(n.weight_kg, n.weight_kg % 1 ? 1 : 0)} kg`, n.height_cm != null && `${nf(n.height_cm)} cm`, n.body_fat_pct != null && `${nf(n.body_fat_pct, 1)} % Körperfett`].filter(Boolean);
    const P = profile(); return a.length ? a.join(" · ") : P.weight ? `Aus Garmin: ${nf(P.weight, 1)} kg${P.height ? ` · ${nf(P.height)} cm` : ""}` : null; }
  if (k === "work") { if (!s.work) return null; const W = workOf(s); return W.days.length ? `${daysTxt(W.days)} ${W.start}–${W.end} · ${nf(W.commute_min)} min Weg` : "Keine festen Arbeitstage"; }
  if (k === "home") { if (!savedLocs()) return null; const h = homeOf(locList()); return h ? `${h.name || "Zuhause"} · ${h.equipment.length} ${h.equipment.length === 1 ? "Möglichkeit" : "Möglichkeiten"} · draußen ab ${nf(Number.isFinite(+s.outdoor_min_temp) && s.outdoor_min_temp != null ? +s.outdoor_min_temp : TEMP_DEF)} °C` : null; }
  if (k === "food") { if (!n.program) return null; const p = PROGS.find(x => x.k === n.program); const d = DIETS.find(x => x.k === n.diet);
    return [p ? (p.k === "off" ? "Ernährung aus" : p.n) : n.program, d && d.n, (n.avoid || []).length && `${(n.avoid || []).length} × meiden`].filter(Boolean).join(" · "); }
  if (k === "goal") { const g = goalNow(); return g ? `${g.kind}: ${g.name}` : null; }
  return null;
}
const missingKey = s => !s.work || !(Array.isArray(s.locations) && s.locations.length) || !plain(s.nutrition).program;

// ---------- Zustand ----------
const W = { open: false, step: 0, d: null, ret: null, msg: null, busy: false, geo: "", auto: false };
function draft() {
  const s = settings(), n = plain(s.nutrition), w = workOf(s), list = locList(), h = homeOf(list);
  const f = v => v == null ? "" : String(v).replace(".", ",");
  return {
    body: { weight_kg: f(n.weight_kg), height_cm: f(n.height_cm), body_fat_pct: f(n.body_fat_pct) },
    work: { days: w.days.slice(), start: w.start, end: w.end, commute_min: String(w.commute_min) },
    home: { list, idx: h ? list.indexOf(h) : -1, name: h ? h.name : "Zuhause", lat: h ? h.lat ?? null : null, lon: h ? h.lon ?? null : null, geoNew: false,
      equipment: h ? h.equipment.slice() : ["run"], pool_m: h && h.pool_m != null ? h.pool_m : POOL.pool_m.def, pool_outdoor_m: h && h.pool_outdoor_m != null ? h.pool_outdoor_m : POOL.pool_outdoor_m.def,
      min_temp: Number.isFinite(+s.outdoor_min_temp) && s.outdoor_min_temp !== null && s.outdoor_min_temp !== "" ? +s.outdoor_min_temp : TEMP_DEF },
    food: { program: n.program || "S", diet: n.diet || "", avoid: Array.isArray(n.avoid) ? n.avoid.slice() : [] },
  };
}

// ---------- Speichern (Offline-Puffer) ----------
// Ergebnis nicht abwarten (Senden kann dauern) – nur dauerhafte Fehler melden; „queued“ = auf dem Gerät gepuffert
function save(ops, replan, what) {
  const G_ = GA();
  if (!G_ || !G_.saveSettings) { W.msg = { kind: "bad", html: "Speichern ist gerade nicht möglich (Modul fehlt) – bitte die App neu laden." }; return Promise.resolve("none"); }
  const p = G_.saveSettings(ops, replan);
  p.then(res => {
    if (res && typeof res === "object") toast(`${what} nicht gesendet – bleibt auf dem Gerät gespeichert. Schlüssel prüfen (Mehr › Status).`);
    else if (res === "queued") toast(`${what}: offline gespeichert – wird gesendet, sobald du Netz hast`);
    refreshMenu();
  }).catch(e => console.error("setup.js:", e));
  refreshMenu();
  return p;
}
const toast = m => { const G_ = GA(); if (G_ && G_.toast) G_.toast(m); else A.toast(m); };
const refreshMenu = () => { DET.sub = menuSub(); A.refreshMenu(); if (W.page) drawPage(); };

// Schritt prüfen + speichern. Rückgabe: Fehlertext oder "" (ok / nichts zu tun)
function commitStep(k, replan = false) {
  const D = W.d, s = settings();
  if (k === "body") {
    const B = D.body, w = num(B.weight_kg), h = num(B.height_cm), bf = num(B.body_fat_pct);
    if (w != null && !(w >= 30 && w <= 250)) return ["weight_kg", "Gewicht bitte in kg (30–250)."];
    if (h != null && !(h >= 120 && h <= 230)) return ["height_cm", "Größe bitte in cm (120–230)."];
    if (bf != null && !(bf >= 3 && bf <= 50)) return ["body_fat_pct", "Körperfett bitte in % (3–50)."];
    const n = plain(s.nutrition), patch = {};
    const put = (key, v) => { if ((n[key] ?? null) !== v) patch[key] = v; };
    put("weight_kg", w != null ? r1(w) : null); put("height_cm", h != null ? Math.round(h) : null); put("body_fat_pct", bf != null ? r1(bf) : null);
    if (!Object.keys(patch).length) return "";
    save({ kind: "set", key: "nutrition", merge: true, value: { ...patch, updated: new Date().toISOString() } }, replan, "Körperdaten");
    return "";
  }
  if (k === "work") {
    const X = D.work, c = num(X.commute_min);
    if (!isHm(X.start) || !isHm(X.end)) return ["start", "Bitte Beginn und Ende als Uhrzeit angeben."];
    if (X.days.length && X.start >= X.end) return ["end", "Ende bitte nach dem Beginn (Nachtdienste unter Mehr › Status eintragen)."];
    if (c != null && !(c >= 0 && c <= 180)) return ["commute_min", "Weg bitte in Minuten (0–180)."];
    const val = { days: X.days.slice().sort((a, b) => a - b), start: X.start, end: X.end, commute_min: c == null ? WK_DEF.commute_min : Math.round(c) };   // leer = Standard 30 min (wie Platzhalter)
    if (s.work && same(workOf(s), val)) return "";
    save({ kind: "set", key: "work", value: val }, replan, "Arbeitszeit");
    return "";
  }
  if (k === "home") {
    const H = D.home, name = String(H.name || "").trim();
    if (!name) return ["name", "Bitte einen Namen für Zuhause eingeben (z. B. „München“)."];
    const list = H.list.map(l => ({ ...l, equipment: l.equipment.slice() }));
    const old = H.idx >= 0 ? list[H.idx] : null;
    const moved = old && old.name !== name && !H.geoNew;   // anderer Ort ohne neuen Standort: alte Koordinaten passen nicht mehr
    const home = { ...(old || {}), id: old && old.id ? old.id : slug(name), name, home: true,
      lat: H.geoNew ? H.lat : moved ? null : old ? old.lat ?? null : null, lon: H.geoNew ? H.lon : moved ? null : old ? old.lon ?? null : null,
      radius_km: old && old.radius_km != null ? old.radius_km : 50,
      equipment: EQUIP().map(e => e[0]).filter(x => H.equipment.includes(x)).concat(H.equipment.filter(x => !EQUIP().some(e => e[0] === x))) };
    Object.keys(POOL).forEach(p => { if (home.equipment.includes(POOL[p].eq)) home[p] = H[p]; else delete home[p]; });   // Beckenlänge nur mit Bad
    const out = list.map(l => ({ ...l, home: false }));
    if (old) out[H.idx] = home; else out.unshift(home);
    const ids = new Set();   // ids eindeutig halten (wie strength.js)
    out.forEach(l => { let id = l.id || slug(l.name), i = 2; while (ids.has(id)) id = `${l.id || slug(l.name)}_${i++}`; ids.add(id); l.id = id; });
    if (+s.outdoor_min_temp !== +H.min_temp || s.outdoor_min_temp == null) save({ kind: "set", key: "outdoor_min_temp", value: +H.min_temp }, replan, "Grenze für draußen");
    if (savedLocs() && same(settings().locations, out)) return "";
    save({ kind: "set", key: "locations", value: out }, replan, "Zuhause & Ausstattung");
    const L = window.GarvisLocations; if (L && L.changed) L.changed();   // Mehr › Orte zeigt den neuen Stand
    return "";
  }
  if (k === "food") {
    const F = D.food, n = plain(s.nutrition);
    const patch = { program: F.program, diet: F.diet || null, avoid: AVOID.map(a => a[0]).filter(x => F.avoid.includes(x)) };
    if (n.program === patch.program && (n.diet ?? null) === patch.diet && same((n.avoid || []).slice().sort(), patch.avoid.slice().sort())) return "";
    save({ kind: "set", key: "nutrition", merge: true, value: { ...patch, updated: new Date().toISOString() } }, replan, "Ernährung");
    return "";
  }
  return "";
}

// ---------- Blatt ----------
function sheetEl() {
  let s = $("suSheet"); if (s) return s;
  s = document.createElement("div"); s.id = "suSheet"; s.className = "su-sheet"; s.hidden = true;
  s.innerHTML = `<div class="su-back" data-su="later"></div>
    <div class="su-p" role="dialog" aria-modal="true" aria-labelledby="suT">
      <div class="su-h"><div class="su-prog" id="suProg"></div>
        <button type="button" class="su-x" data-su="later" aria-label="Später weitermachen">${IC.x}</button></div>
      <div class="su-body" id="suBody"></div>
      <div class="su-foot" id="suFoot"></div>
    </div>`;
  document.body.appendChild(s);
  s.addEventListener("click", onClick);
  s.addEventListener("input", onInput);
  s.addEventListener("change", onInput);
  return s;
}
function open(step, opts = {}) {
  W.d = draft(); W.msg = null; W.geo = ""; W.busy = false; W.auto = !!opts.auto;
  W.step = Math.max(0, Math.min(STEPS.length - 1, step != null ? step : isDone() ? 0 : +wiz().step || 0));
  W.open = true; W.ret = document.activeElement;
  const s = sheetEl(); s.hidden = false; document.documentElement.classList.add("su-lock");
  draw(true);
}
function close() {
  const s = $("suSheet"); if (!s || s.hidden) return;
  s.hidden = true; W.open = false; document.documentElement.classList.remove("su-lock");
  if (W.ret && W.ret.isConnected) W.ret.focus({ preventScroll: true });
  A.rerender();
}
function later() {
  if (!isDone()) writeLocal(LS, { step: W.step });   // beim nächsten Öffnen hier weiter
  close();
  if (W.auto && !isDone()) toast("Später weitermachen: Mehr › Einstellungen › Garvis einrichten");
}
function go(step) {
  W.step = step; W.msg = null; W.geo = "";
  if (!isDone()) writeLocal(LS, { step });
  draw(true);
}

function draw(focus) {
  const st = STEPS[W.step], last = W.step === STEPS.length - 1;
  $("suProg").innerHTML = `<div class="su-bars" aria-hidden="true">${STEPS.map((x, i) => `<i class="${i < W.step ? "done" : i === W.step ? "cur" : ""}"></i>`).join("")}</div>
    <div class="kicker">Schritt ${W.step + 1} von ${STEPS.length} · ${esc(st.n)}</div>`;
  const body = $("suBody");
  body.innerHTML = `<h3 id="suT" tabindex="-1">${esc(TITLES[st.k])}</h3><p class="su-lead">${esc(st.d)}.</p>${RENDER[st.k]()}
    ${W.msg ? `<div class="hint ${W.msg.kind || ""}" role="alert">${W.msg.kind === "bad" ? IC.warning : IC.info}<span>${W.msg.html}</span></div>` : ""}
    ${!web() ? `<div class="hint" role="status">${IC.info}<span>Lokal geöffnet (Datei) – gespeichert wird nur in der Garvis-App auf dem iPhone.</span></div>` : ""}`;
  $("suFoot").innerHTML = `<button type="button" class="su-nav" data-su="back"${W.step ? "" : " hidden"}>${SI.back}Zurück</button>
    <span class="su-sp"></span>
    ${last ? "" : `<button type="button" class="su-skip" data-su="skip">Überspringen</button>`}
    <button type="button" class="btn su-next" data-su="${last ? "done" : "next"}"${W.busy ? " disabled" : ""}>${last ? "Fertig" : "Weiter"}</button>`;
  if (focus) { body.scrollTop = 0; const h = $("suT"); if (h) h.focus({ preventScroll: true }); }
}
const TITLES = { body: "Dein Körper", work: "Arbeit & Dienste", home: "Zuhause & Training", food: "Ernährung", goal: "Dein Ziel" };
const fld = (name, label, val, ph, mode, opt = true, extra = "") => `<label class="field"><span class="kicker">${label}${opt ? " <i>optional</i>" : ""}</span>
  <input name="${name}" data-f="${name}" inputmode="${mode}" autocomplete="off" value="${esc(val)}" placeholder="${esc(ph)}"${extra}></label>`;
const RENDER = {
  body() {
    const B = W.d.body, P = profile();
    return `<div class="su-g">
      <div class="frow">${fld("weight_kg", "Gewicht (kg)", B.weight_kg, P.weight ? `Garmin: ${nf(P.weight, 1)}` : "z. B. 71", "decimal")}
        ${fld("height_cm", "Größe (cm)", B.height_cm, P.height ? `Garmin: ${nf(P.height)}` : "z. B. 181", "numeric")}</div>
      ${fld("body_fat_pct", "Körperfett (%)", B.body_fat_pct, "sonst geschätzt", "decimal")}
      <p class="note">Leer lassen = Garvis nimmt die Werte aus Garmin Connect${P.weight ? ` (${nf(P.weight, 1)} kg${P.height ? `, ${nf(P.height)} cm` : ""})` : ""}. Körperfett nur, wenn du es gemessen hast.</p></div>`;
  },
  work() {
    const X = W.d.work, off = !X.days.length;
    return `<div class="su-g">
      <div class="field"><span class="kicker">Arbeitstage</span>
        <div class="chipsel num su-wd" role="group" aria-label="Arbeitstage">${WD.map((n, i) => `<label><input type="checkbox" data-wd="${i}"${X.days.includes(i) ? " checked" : ""}>${n}</label>`).join("")}</div></div>
      <div class="frow su-two${off ? " su-dim" : ""}">
        <label class="field"><span class="kicker">Beginn</span><input type="time" step="300" data-f="start" value="${esc(X.start)}"></label>
        <label class="field"><span class="kicker">Ende</span><input type="time" step="300" data-f="end" value="${esc(X.end)}"></label></div>
      ${fld("commute_min", "Weg zur Arbeit (min, je Richtung)", X.commute_min, "30", "numeric", false, ' type="number" min="0" max="180" step="5"')}
      <div class="hint">${IC.info}<span><b>Dienste</b> (Nacht-, Spät-, 24-h-Dienst, Bereitschaft) und einzelne abweichende Tage trägst du unter <b>Mehr › Status</b> ein – auch später jederzeit.</span></div></div>`;
  },
  home() {
    const H = W.d.home, eq = EQUIP(), coords = H.lat != null && H.lon != null;
    const moved = H.idx >= 0 && H.list[H.idx].name !== String(H.name).trim() && !H.geoNew;
    const pools = Object.entries(POOL).filter(([, p]) => H.equipment.includes(p.eq));
    return `<div class="su-g">
      ${fld("name", "Name", H.name, "z. B. München", "text", false, ' maxlength="60"')}
      <div class="su-geo"><button type="button" class="txtbtn su-loc" data-su="geo">${SI.locate}Aktuellen Standort verwenden</button>
        <small class="muted" role="status">${esc(W.geo || (coords && !moved ? `Koordinaten: ${nf(H.lat, 3)}, ${nf(H.lon, 3)}${H.geoNew ? " (neu)" : ""}` : moved ? "Neuer Ort – für das Wetter Standort verwenden (optional)" : "Optional – für das Wetter vor Ort"))}</small></div>
      <div class="field"><span class="kicker">Hier kannst du trainieren</span>
        <div class="chipsel" role="group" aria-label="Ausstattung zu Hause">${eq.map(([k, n]) => `<label><input type="checkbox" data-eq="${k}"${H.equipment.includes(k) ? " checked" : ""}>${esc(n)}</label>`).join("")}</div></div>
      ${pools.map(([k, p]) => `<div class="field"><span class="kicker">Beckenlänge ${esc(p.n)}</span>
        <div class="chipsel num" role="radiogroup" aria-label="Beckenlänge ${esc(p.n)}">${[25, 50].map(m => `<label><input type="radio" name="su_${k}" data-pool="${k}" value="${m}"${+H[k] === m ? " checked" : ""}>${m} m</label>`).join("")}</div></div>`).join("")}
      ${H.equipment.some(x => ["run", "road_bike", "pool_outdoor", "open_water"].includes(x)) ? `<div class="field"><span class="kicker">Draußen trainieren ab</span>
        <div class="chipsel num" role="radiogroup" aria-label="Draußen trainieren ab">${TEMPS.map(t => `<label><input type="radio" name="su_temp" data-temp="${t}" value="${t}"${+H.min_temp === t ? " checked" : ""}>${t} °C</label>`).join("")}</div>
        <small class="muted">Kälter: Rolle, Laufband oder Hallenbad, wenn vorhanden – sonst wird trotzdem draußen gelaufen (mit Hinweis).</small></div>` : ""}
      <p class="note">Weitere Orte (Reisen, Eltern …) und die Ausrüstung pflegst du unter <a href="#mehr/orte" data-su="link">Orte &amp; Ausstattung</a>.</p></div>`;
  },
  food() {
    const F = W.d.food;
    return `<div class="su-g">
      <div class="opts su-opts" role="radiogroup" aria-label="Ernährungsprogramm">${PROGS.map(p => `<label class="opt"><input type="radio" name="su_prog" data-prog="${p.k}"${F.program === p.k ? " checked" : ""}><b>${esc(p.n)}</b><small>${esc(p.d)}</small></label>`).join("")}</div>
      <div class="field${F.program === "off" ? " su-dim" : ""}"><span class="kicker">Ernährungsform <i>optional</i></span>
        <div class="chipsel" role="radiogroup" aria-label="Ernährungsform">${[...DIETS, { k: "", n: "Keine Angabe" }].map(d => `<label><input type="radio" name="su_diet" data-diet="${d.k}"${F.diet === d.k ? " checked" : ""}>${esc(d.n)}</label>`).join("")}</div></div>
      <div class="field${F.program === "off" ? " su-dim" : ""}"><span class="kicker">Allergien &amp; Unverträglichkeiten <i>optional</i></span>
        <div class="chipsel" role="group" aria-label="Allergien und Unverträglichkeiten">${AVOID.map(([k, l]) => `<label><input type="checkbox" data-av="${k}"${F.avoid.includes(k) ? " checked" : ""}>${esc(l)}</label>`).join("")}</div></div>
      <p class="note">Programm, Ernährungsform und Ausschlüsse kannst du jederzeit unter Mehr › Einstellungen › Ernährung ändern.</p></div>`;
  },
  goal() {
    const rows = STEPS.slice(0, 4).map((x, i) => { const v = summary(x.k);
      return `<button type="button" class="su-row" data-su="jump" data-v="${i}"><span class="mi">${x.ic}</span><span><b>${esc(x.n)}</b><small>${esc(v || "Noch offen")}</small></span>${v ? `<span class="su-ok" aria-label="erledigt">${IC.check}</span>` : `<span class="su-open">Ergänzen</span>`}</button>`; }).join("");
    const g = goalNow();
    return `<div class="su-g">
      <div class="card su-sum">${rows}</div>
      <div class="card su-goal"><span class="mi">${IC.target}</span><span><b>${g ? esc(`${g.kind}: ${g.name}`) : "Noch kein Ziel"}</b>
        <small>${g ? "Wettkampf, Leistungsziel oder Kraft – hier änderst du es." : "Wettkampf, Leistungsziel, Kraft oder ausgeglichen – Garvis baut den Plan darauf auf."}</small></span>
        <a class="txtbtn" href="#mehr/ziel" data-su="link">${g ? "Ändern" : "Ziel festlegen"}</a></div>
      <p class="note">Mit <b>Fertig</b> plant Garvis einmal neu – der neue Plan ist in etwa 2–3 Minuten da.</p></div>`;
  },
};

function fail(r) {
  const [field, text] = r;
  W.msg = { kind: "bad", html: esc(text) }; draw();
  const inp = $("suBody").querySelector(`[data-f="${field}"]`);
  if (inp) { inp.setAttribute("aria-invalid", "true"); inp.focus(); }
}
function onClick(e) {
  const b = e.target.closest("[data-su]"); if (!b) return;
  const a = b.dataset.su;
  if (a === "later") return later();
  if (a === "back") return go(W.step - 1);
  if (a === "skip") return go(W.step + 1);
  if (a === "jump") return go(+b.dataset.v);
  if (a === "next") { const r = commitStep(STEPS[W.step].k); if (r) return fail(r); return go(W.step + 1); }
  if (a === "done") return finish();
  if (a === "link") { writeLocal(LS, { step: W.step }); W.ret = null; close(); return; }   // Link folgt (Hash-Wechsel) – Assistent später an dieser Stelle fortsetzen
  if (a === "geo") return locate();
}
function onInput(e) {
  const x = e.target, D = W.d, st = STEPS[W.step].k;
  if (x.hasAttribute("aria-invalid")) x.removeAttribute("aria-invalid");
  if (W.msg && W.msg.kind === "bad") { W.msg = null; const h = $("suBody").querySelector(".hint.bad"); if (h) h.remove(); }
  if (x.dataset.f && D[st] && x.dataset.f in D[st]) { D[st][x.dataset.f] = x.value; if (st === "home" && x.dataset.f === "name" && e.type === "change") draw(); return; }
  if (x.dataset.wd != null) { const i = +x.dataset.wd; D.work.days = x.checked ? [...new Set(D.work.days.concat(i))] : D.work.days.filter(d => d !== i); return draw(); }
  if (x.dataset.eq) { const k = x.dataset.eq; D.home.equipment = x.checked ? [...new Set(D.home.equipment.concat(k))] : D.home.equipment.filter(v => v !== k); if (POOL.pool_m.eq === k || POOL.pool_outdoor_m.eq === k) draw(); return; }
  if (x.dataset.pool) { D.home[x.dataset.pool] = +x.value; return; }
  if (x.dataset.temp) { D.home.min_temp = +x.value; return; }
  if (x.dataset.prog) { D.food.program = x.dataset.prog; return draw(); }
  if (x.dataset.diet != null && x.checked) { D.food.diet = x.dataset.diet; return; }
  if (x.dataset.av) { const k = x.dataset.av; D.food.avoid = x.checked ? [...new Set(D.food.avoid.concat(k))] : D.food.avoid.filter(v => v !== k); }
}
function locate() {
  const H = W.d.home;
  if (!navigator.geolocation) { W.geo = "Standort wird von diesem Browser nicht unterstützt."; return draw(); }
  W.geo = "Standort wird ermittelt …"; draw();
  navigator.geolocation.getCurrentPosition(p => {
    H.lat = Math.round(p.coords.latitude * 1e4) / 1e4; H.lon = Math.round(p.coords.longitude * 1e4) / 1e4; H.geoNew = true;
    W.geo = `Übernommen (Genauigkeit ca. ${nf(Math.max(1, p.coords.accuracy))} m) – wird mit „Weiter“ gespeichert.`;
    if (W.open && STEPS[W.step].k === "home") draw();
  }, err => {
    W.geo = err && err.code === 1 ? "Standortzugriff abgelehnt – in den iPhone-Einstellungen › Datenschutz › Ortungsdienste erlauben. Geht auch ohne." : "Standort nicht verfügbar – geht auch ohne.";
    if (W.open && STEPS[W.step].k === "home") draw();
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
}
function finish() {
  if (W.busy) return;
  W.busy = true;
  const at = new Date().toISOString();
  save({ kind: "set", key: "setup", merge: true, value: { done: true, at } }, true, "Einrichtung");   // true = einmal neu planen
  localStorage.removeItem(LS);
  close();
  toast(web() ? "Garvis ist eingerichtet – der Plan wird neu berechnet" : "Garvis ist eingerichtet");
}

// Escape schließt (später weiter), Tab bleibt im Blatt
document.addEventListener("keydown", e => {
  if (!W.open) return;
  const s = $("suSheet");
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return later(); }
  if (e.key === "Tab") {
    const f = [...s.querySelectorAll("button, input, a[href]")].filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
}, true);

// ---------- Mehr › Einstellungen › Garvis einrichten ----------
const DET = { name: "Garvis einrichten", sub: "", icon: SI.setup, noRange: true, group: "settings", render: renderPage };
function menuSub() { if (isDone()) return "Eingerichtet – Angaben prüfen oder ändern"; const n = STEPS.slice(0, 4).filter(x => summary(x.k)).length; return n === 4 ? "Alles ausgefüllt – mit „Fertig“ abschließen" : n ? `${n} von 4 Bereichen erledigt – fortsetzen` : "In 5 kurzen Schritten: Körper, Arbeit, Zuhause, Ernährung, Ziel"; }
function renderPage() { W.page = true; drawPage(); }
function drawPage() {
  const sec = $("setup"); if (!sec || sec.hidden) { W.page = false; return; }
  const done = isDone(), st = +wiz().step || 0;
  sec.innerHTML = `<h2>Garvis einrichten</h2><p class="sub">Die wichtigsten Angaben in 5 kurzen Schritten – alles lässt sich später ändern</p>
    <div class="card menu-card su-list">${STEPS.map((x, i) => { const v = summary(x.k);
      return `<button type="button" class="su-row" data-sp="${i}"><span class="mi">${x.ic}</span><span><b>${i + 1}. ${esc(x.n)}</b><small>${esc(v || (x.k === "goal" ? "Noch kein Ziel" : "Noch offen"))}</small></span>${v ? `<span class="su-ok" aria-label="erledigt">${IC.check}</span>` : `<span class="su-open">Offen</span>`}</button>`; }).join("")}</div>
    <div class="formfoot"><button type="button" class="btn" data-sp="${done ? 0 : st}">${done ? "Noch einmal durchgehen" : st ? `Fortsetzen (Schritt ${st + 1})` : "Einrichtung starten"}</button>
      <span class="muted">${done ? `Eingerichtet${plain(settings().setup).at ? ` am ${esc(new Date(settings().setup.at).toLocaleDateString("de-DE", { day: "numeric", month: "short" }))}` : ""}` : "Dauert etwa 2 Minuten"}</span></div>`;
  if (!sec.dataset.bound) {
    sec.dataset.bound = "1";
    sec.addEventListener("click", e => { const b = e.target.closest("[data-sp]"); if (b) open(+b.dataset.sp); });
  }
}

// ---------- Einmal von selbst beim ersten Öffnen ----------
const busyUi = () => /(?:^|\s)(?:ds|ac|nu|info)-lock(?:\s|$)/.test(document.documentElement.className) || ($("lock") && !$("lock").hidden)
  || document.querySelector(".acsheet:not([hidden])");
async function autoOpen() {
  if (localStorage.getItem(AUTO) || W.open) return;
  let s = readLocal(SET_KEY);
  if (web()) {   // erst den aktuellen Stand holen – auf einem neuen Gerät ist der lokale Stand noch leer
    try { const r = await U.fetchSettings(); if (r && r.ok) s = readLocal(SET_KEY) || r.data || {}; else if (!s) return; } catch (e) { if (!s) return; }
  }
  s = s || {};
  if (plain(s.setup).done || !missingKey(s)) return;
  let n = 0;
  const tryOpen = () => {
    if (localStorage.getItem(AUTO) || W.open) return;
    const h = location.hash.replace(/^#/, "");
    if (busyUi() || U.typing() || (h && h !== "heute")) { if (++n < 60) setTimeout(tryOpen, 2000); return; }   // anderes Blatt offen / woanders: warten
    localStorage.setItem(AUTO, String(Date.now()));
    refreshMenu();
    open(null, { auto: true });
  };
  tryOpen();
}

// ---------- Anmelden ----------
if (!$("setup")) { const sec = document.createElement("section"); sec.id = "setup"; sec.hidden = true; $("mDetail").appendChild(sec); }
DET.sub = menuSub();
window.GarvisSetup = { open: step => open(step), done: isDone };
A.register({ id: "setup", details: { setup: DET }, hooks: { today: () => { DET.sub = menuSub(); } } });
setTimeout(autoOpen, 1500);
}
})();
