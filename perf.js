/* Garvis – Leistungs- & Pace-Kurve (Fortschritt), Rennplanung und Jahresrückblick (Zusatzmodul, wird von app.js nachgeladen).
   Alle Daten sind optional – ohne Felder zeigt das Modul Hinweise bzw. einen Rückblick aus den Garmin-Aktivitäten:
   - GARMIN.curves      { updated, power: { all|90d|year|prev_year: [{ sec, watts, date, activity }] },
                          pace: { …: [{ m, sec, date, activity }] }, sources: [str], ftp_est: { watts, method } | null }
   - TODAY.race_plan    Rennplanung (nur bei Ziel Wettkampf) → Mehr › Rennplanung, Link in Woche und Tagesansicht
   - TODAY.year_review  Jahresrückblick → Mehr › Jahresrückblick, 31.12.–7.1. zusätzlich als Karte auf Heute
   Diagramme nach dem Stamina-/dataviz-Schema: eine Y-Achse, Legende ab 2 Serien, Fadenkreuz-Tooltip, Tabelle als Alternative.
   Abhaken (Pack-/Checkliste) bleibt lokal im localStorage. */
(() => {
const A = window.GarvisApp;
if (!A || window.GarvisPerf) return;
window.GarvisPerf = true;
const { esc, nf, IC, t, DAY, MONTHS, MONTHS_L, fmtDate, el, legend, lineChart, showTip, hideTip, readLocal, writeLocal, todayRef } = A.api;
const G = () => window.GARMIN || {}, TD = () => window.TODAY || {};
const $ = id => document.getElementById(id);
const isNum = v => typeof v === "number" && isFinite(v);
const arr = v => Array.isArray(v) ? v : [];
const obj = v => v && typeof v === "object" && !Array.isArray(v) ? v : null;
const first = (...v) => v.find(x => x != null && x !== "");
const isoOk = s => typeof s === "string" && /^\d{4}-\d\d-\d\d/.test(s);
const tms = s => isoOk(s) ? t(s.slice(0, 10)) : null;
const sumA = a => a.reduce((s, x) => s + (x || 0), 0);
const pl = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
const CHEV = IC.chev;

// ---------- Formatierung ----------
const pad = n => String(n).padStart(2, "0");
const clock = sec => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
const hmS = sec => { if (!isNum(sec)) return "–"; const m = Math.round(sec / 60), h = Math.floor(m / 60); return h ? `${h}:${pad(m % 60)} h` : `${m} min`; };
const durLbl = sec => sec < 60 ? `${nf(sec)} s` : sec < 3600 ? (sec % 60 ? `${Math.floor(sec / 60)}:${pad(sec % 60)} min` : `${nf(sec / 60)} min`) : sec % 3600 ? `${Math.floor(sec / 3600)}:${pad(Math.round(sec % 3600 / 60))} h` : `${nf(sec / 3600)} h`;
const paceFmt = spk => { if (!isNum(spk)) return "–"; const s = Math.round(spk); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const pace = (m, sec) => sec / (m / 1000);
const DNAME = { 400: "400 m", 800: "800 m", 1000: "1 km", 1609: "1 Meile", 1610: "1 Meile", 3000: "3 km", 5000: "5 km", 10000: "10 km", 15000: "15 km", 21097: "Halbmarathon", 21098: "Halbmarathon", 42195: "Marathon" };
const distLbl = m => DNAME[Math.round(m)] || (m < 1000 ? `${nf(m)} m` : `${nf(m / 1000, m % 1000 ? 1 : 0)} km`);
const distShort = m => Math.round(m) === 21097 || Math.round(m) === 21098 ? "HM" : Math.round(m) === 42195 ? "M" : m < 1000 ? `${nf(m)} m` : `${nf(m / 1000, m % 1000 && m < 10000 ? 1 : 0)} km`;
const dShort = iso => { const d = new Date(tms(iso)); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${String(d.getUTCFullYear()).slice(2)}`; };
const kmFmt = km => nf(km, km < 100 ? 1 : 0);
const signedNf = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(Math.abs(v), d);
const trim = (s, n = 34) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Achsenwerte (wie app.js): runde Schritte 1/2/2,5/5
function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; min = min - 1; }
  const step0 = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
// Pace-Achse: Schritte in Sekunden, die als m:ss rund aussehen
function paceTicks(min, max) {
  const step = [5, 10, 15, 20, 30, 60, 120].find(s => (max - min) / s <= 4) || 120;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + 0.1; v += step) out.push(v);
  return out.length > 1 ? out : [out[0], out[0] + step];
}
// Balken: 4px gerundetes Datenende, eckig an der Basislinie
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0 || w <= 0) return "";
  return `M${x},${y + h}v-${h - r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

// ---------- Sportarten: feste Kategoriefarben – zentral in index.html (--sp-*), gleiche Zuordnung wie app.js GROUPS ----------
const SPORTS = [
  { key: "bike", name: "Radfahren", color: "var(--sp-bike)", ic: "bike" },
  { key: "run", name: "Laufen", color: "var(--sp-run)", ic: "run" },
  { key: "swim", name: "Schwimmen", color: "var(--sp-swim)", ic: "swim" },
  { key: "gym", name: "Kraft & Fitness", color: "var(--sp-gym)", ic: "gym" },
  { key: "golf", name: "Golf", color: "var(--sp-golf)", ic: "flag" },
  { key: "ski", name: "Ski", color: "var(--sp-ski)", ic: "ski" },
  { key: "other", name: "Ballsport & Sonstiges", color: "var(--sp-other)", ic: "pulse" },
];
const SP = Object.fromEntries(SPORTS.map(s => [s.key, s]));
// Labels in einer bunten Fläche: weiß, auf Gelb (Rad) fast schwarz (palette.md)
const INK_ON = { bike: "#0b0b0b" };
function sportKey(n) {
  n = String(n || "").toLowerCase();
  if (SP[n]) return n;
  return /swim|schwimm|freiwasser/.test(n) ? "swim" : /bike|rad|ride|cycl|zwift|rolle/.test(n) ? "bike" : /run|lauf/.test(n) ? "run"
    : /golf/.test(n) ? "golf" : /tennis|padel|paddel|volley|ball/.test(n) ? "other" : /ski|langlauf|snowboard/.test(n) ? "ski"
    : /kraft|gym|strength|fitness|yoga|pilates|cardio|rowing|ruder|stabi/.test(n) ? "gym" : "other";
}
const sportName = k => (SP[k] || SP.other).name;
const legName = k => ({ swim: "Schwimmen", bike: "Rad", run: "Laufen" })[k] || sportName(k);
const sportIc = k => IC[(SP[k] || SP.other).ic] || IC.pulse;

// ---------- Lokale Einstellungen (Serienauswahl, W/kg) ----------
const UI_KEY = "garvis.perf.ui";
const UI = Object.assign({ power: ["all", "90d"], pace: ["all", "90d"], wkg: false }, readLocal(UI_KEY) || {});
const saveUI = () => writeLocal(UI_KEY, UI);

// =====================================================================================
// Kurvendiagramm mit logarithmischer x-Achse (Dauer bzw. Distanz), eine y-Achse
// =====================================================================================
function curveChart(host, { series, lo, hi, ticks, yFmt, yTick, invert = false, dots = false, height = 220, xName, tipVal, yInclude = [], label = "Bestwerte" }) {
  host.innerHTML = "";
  series = series.filter(s => s.pts.length);
  if (!series.length) { host.innerHTML = `<div class="empty">Keine Werte für die gewählten Zeiträume</div>`; return; }
  const box = document.createElement("div"); box.className = "chart pf-chart"; host.appendChild(box);
  const W = box.clientWidth || 340, H = height, m = { l: 40, r: 12, t: 10, b: 24 };
  const L = Math.log(lo), R = Math.log(hi);
  const X = v => m.l + (Math.log(v) - L) / (R - L) * (W - m.l - m.r);
  const ys = series.flatMap(s => s.pts.map(p => p.y)).concat(yInclude);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const yt = invert ? paceTicks(y0, y1) : niceTicks(y0 - (y1 - y0) * 0.04, y1, 4);
  y0 = yt[0]; y1 = yt[yt.length - 1];
  const Y = v => invert ? m.t + (v - y0) / (y1 - y0) * (H - m.t - m.b) : m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label}: ${series.map(s => { const a = s.pts[0], b = s.pts[s.pts.length - 1]; return `${s.name} von ${xName(a.x)} ${yFmt(a.y)} bis ${xName(b.x)} ${yFmt(b.y)}`; }).join("; ")}` }, box);
  yt.forEach((v, i) => {
    const base = invert ? i === yt.length - 1 : i === 0;
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: base ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = yTick(v);
  });
  ticks.filter(k => k.v >= lo && k.v <= hi).forEach(k => {
    el("line", { x1: X(k.v), x2: X(k.v), y1: m.t, y2: H - m.b, stroke: "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: X(k.v), y: H - 7, "text-anchor": "middle" }, svg).textContent = k.l;
  });
  series.forEach(s => {
    const d = s.pts.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + "," + Y(p.y).toFixed(1)).join("");
    el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    if (dots || s.pts.length < 3) s.pts.forEach(p => el("circle", { cx: X(p.x), cy: Y(p.y), r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2 }, svg));
  });
  // Hover-Ebene: Fadenkreuz rastet auf der nächsten Dauer/Distanz ein, ein Tooltip für alle Serien
  const xs = [...new Set(series.flatMap(s => s.pts.map(p => p.x)))].sort((a, b) => a - b);
  const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
  const marks = series.map(s => el("circle", { r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg));
  const hit = el("rect", { x: m.l - 8, y: 0, width: W - m.l - m.r + 16, height: H, fill: "transparent" }, svg);
  const move = e => {
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
    const lv = L + (px - m.l) / (W - m.l - m.r) * (R - L);
    let x = xs[0];
    xs.forEach(v => { if (Math.abs(Math.log(v) - lv) < Math.abs(Math.log(x) - lv)) x = v; });
    cross.setAttribute("x1", X(x)); cross.setAttribute("x2", X(x)); cross.setAttribute("visibility", "visible");
    const rows = [];
    series.forEach((s, i) => {
      const p = s.pts.find(q => q.x === x);
      if (!p) { marks[i].setAttribute("visibility", "hidden"); return; }
      marks[i].setAttribute("cx", X(p.x)); marks[i].setAttribute("cy", Y(p.y)); marks[i].setAttribute("visibility", "visible");
      rows.push({ k: s.name, v: tipVal ? tipVal(p) : yFmt(p.y), color: s.color });
      const sub = [p.p && p.p.date && dShort(p.p.date), p.p && p.p.activity && trim(p.p.activity, 30)].filter(Boolean).join(" · ");
      if (sub) rows.push({ k: sub, v: "" });
    });
    showTip(e, xName(x), rows);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); marks.forEach(c => c.setAttribute("visibility", "hidden")); });
}

// Serien-Schalter (zugleich Legende): Linien-Schlüssel in Serienfarbe, Text in Textfarbe
function chips(list, sel, kind) {
  return `<div class="pf-chips" role="group" aria-label="Zeiträume, bis zu 3 gleichzeitig" data-kind="${kind}">${list.map(s =>
    `<button type="button" data-k="${s.k}" aria-pressed="${sel.includes(s.k)}"><i style="background:${s.c}"></i>${esc(s.n)}</button>`).join("")}</div>`;
}
function bindChips(card, kind, avail, redraw) {
  card.querySelector(`.pf-chips[data-kind="${kind}"]`).addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if (!b) return;
    const k = b.dataset.k, cur = UI[kind].filter(x => avail.includes(x));
    if (cur.includes(k)) { if (cur.length > 1) UI[kind] = cur.filter(x => x !== k); }
    else UI[kind] = [...cur, k].slice(-3);  // höchstens 3: der älteste fliegt raus
    saveUI();
    card.querySelectorAll(`.pf-chips[data-kind="${kind}"] button`).forEach(x => x.setAttribute("aria-pressed", String(UI[kind].includes(x.dataset.k))));
    redraw();
  });
}
const curveYear = C => { const u = C && isoOk(C.updated) ? +C.updated.slice(0, 4) : new Date(todayRef()).getUTCFullYear(); return u; };
const serList = C => { const y = curveYear(C); return [
  // Vergleichsserien (keine Sportfarben): s1, Neutralgrau, cmp3, cmp4 – alle Paare validiert
  { k: "all", n: "Gesamt", c: "var(--s1)" }, { k: "90d", n: "90 Tage", c: "var(--neutral)" },
  { k: "year", n: String(y), c: "var(--cmp3)" }, { k: "prev_year", n: String(y - 1), c: "var(--cmp4)" }]; };
const powerPts = list => arr(list).filter(p => p && isNum(p.sec) && isNum(p.watts) && p.sec > 0 && p.watts > 0).sort((a, b) => a.sec - b.sec);
const pacePts = list => arr(list).filter(p => p && isNum(p.m) && isNum(p.sec) && p.m > 0 && p.sec > 0).sort((a, b) => a.m - b.m);
const at = (pts, key, v) => { let best = null; pts.forEach(p => { if (Math.abs(Math.log(p[key] / v)) < 0.12 && (!best || Math.abs(p[key] - v) < Math.abs(best[key] - v))) best = p; }); return best; };

// =====================================================================================
// Fortschritt: Karten „Leistungskurve“ und „Pace-Kurve“ (Hook progress)
// =====================================================================================
const P_TICKS = [{ v: 5, l: "5 s" }, { v: 60, l: "1 min" }, { v: 300, l: "5 min" }, { v: 1200, l: "20 min" }, { v: 3600, l: "1 h" }];
const P_ROWS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200];
const curFtp = () => { const g = G(); return first(g.zones && g.zones.current && g.zones.current.ftp, g.profile && g.profile.ftp); };
const weight = () => { const w = G().profile && G().profile.weight; return isNum(w) && w > 30 ? w : null; };

function powerCard(card, C, opts = {}) {
  const P = obj(C && C.power) || {}, list = (opts.series || serList(C)).filter(s => powerPts(P[s.k]).length);
  const head = `<h3 class="chead">${IC.bolt}${opts.title || "Leistungskurve"}<span class="r muted pf-r">Rad${C && isoOk(C.updated) && !opts.series ? ` · Stand ${esc(dShort(C.updated))}` : ""}</span></h3>`;
  if (!list.length) {
    card.innerHTML = head + `<div class="hint">${IC.info}<span>Leistungskurve braucht Radfahrten mit Wattmessung – z. B. Zwift. Sie erscheint nach dem nächsten Abgleich mit solchen Fahrten.</span></div>`;
    return;
  }
  const avail = list.map(s => s.k), kg = weight();
  const selKey = opts.sel || "power";
  if (!opts.series) { UI.power = UI.power.filter(k => avail.includes(k)); if (!UI.power.length) UI.power = avail.slice(0, 2); }
  const sel = () => opts.series ? avail : UI.power;
  const wkg = () => !!(kg && UI.wkg);
  const val = w => wkg() ? w / kg : w;
  const vf = (w, unit = true) => wkg() ? nf(w / kg, 1) + (unit ? " W/kg" : "") : nf(w) + (unit ? " W" : "");
  const draw = () => {
    const S = list.filter(s => sel().includes(s.k)).map(s => ({ name: s.n, color: s.c, pts: powerPts(P[s.k]).filter(p => p.sec >= 5 && p.sec <= 7200).map(p => ({ x: p.sec, y: val(p.watts), p })) }));
    const xsAll = S.flatMap(s => s.pts.map(p => p.x));
    curveChart(card.querySelector(".pf-plot"), { series: S, lo: 5, hi: Math.max(3600, Math.min(7200, Math.max(...xsAll, 3600))), ticks: P_TICKS, height: opts.height || 230, label: "Leistungskurve Rad",
      yFmt: v => vf(v * (wkg() ? kg : 1)), yTick: v => wkg() ? nf(v, v % 1 ? 1 : 0) : nf(v), xName: x => `Beste ${durLbl(x)}`, tipVal: q => vf(q.p.watts) });
    // Tabelle (Alternative zum Diagramm)
    const cols = list.filter(s => sel().includes(s.k));
    const rows = P_ROWS.filter(sec => cols.some(s => at(powerPts(P[s.k]), "sec", sec)));
    const tb = card.querySelector(".pf-tbl tbody"), th = card.querySelector(".pf-tbl thead");
    th.innerHTML = `<tr><th>Dauer</th>${cols.map(s => `<th class="n">${esc(s.n)}</th>`).join("")}</tr>`;
    tb.innerHTML = rows.map(sec => `<tr><td>${durLbl(sec)}</td>${cols.map(s => { const p = at(powerPts(P[s.k]), "sec", sec);
      return `<td class="n">${p ? `${vf(p.watts)}${p.date ? `<small>${esc(dShort(p.date))}</small>` : ""}` : "–"}</td>`; }).join("")}</tr>`).join("");
    if (!opts.series) kpis();
  };
  // Kennzahlen: Bestwerte aus „Gesamt“ (bzw. erster Serie), darunter 90 Tage
  const base = powerPts(P.all).length ? "all" : avail[0], cmp = base !== "90d" && powerPts(P["90d"]).length ? "90d" : null;
  const kpis = () => {
    const host = card.querySelector(".pf-kpis"); if (!host) return;
    const unit = wkg() ? "W/kg" : "W";
    const tiles = [[5, "5 s"], [60, "1 min"], [300, "5 min"], [1200, "20 min"]].map(([sec, l]) => {
      const p = at(powerPts(P[base]), "sec", sec), q = cmp && at(powerPts(P[cmp]), "sec", sec);
      return `<div class="pf-kpi"><div class="l">${l}</div><div class="v">${p ? vf(p.watts, false) : "–"}<small>${unit}</small></div><div class="f">${q ? `90 Tage: ${vf(q.watts, !wkg())}` : p && p.date ? esc(dShort(p.date)) : "&nbsp;"}</div></div>`;
    });
    const est = C && obj(C.ftp_est) && isNum(C.ftp_est.watts) ? C.ftp_est : null, ftp = curFtp();
    if (est || isNum(ftp)) {
      const d = est && isNum(ftp) ? est.watts - ftp : null;
      tiles.push(`<div class="pf-kpi pf-ftp"><div class="l">${est ? "FTP-Schätzung" : "FTP"}</div><div class="v">${vf(est ? est.watts : ftp, false)}<small>${unit}</small></div>
        <div class="f">${est && isNum(ftp) ? `aktuell ${vf(ftp)}<br><span class="${d >= 0 ? "delta-up" : "delta-down"}">${d >= 0 ? "▲" : "▼"} ${wkg() ? signedNf(d / kg, 1) : signedNf(d)}</span>` : est ? "aus der Kurve" : "aktuell (Garmin)"}</div></div>`);
    }
    host.innerHTML = tiles.join("");
    const meth = card.querySelector(".pf-meth");
    if (meth) meth.textContent = est && est.method ? `FTP-Schätzung: ${est.method}` : "";
  };
  card.innerHTML = head + (opts.desc != null ? opts.desc : `<p class="desc">Beste Durchschnittsleistung je Dauer · x-Achse logarithmisch</p>`) +
    (opts.series ? "" : `<div class="pf-kpis"></div><p class="pf-meth muted"></p>`) +
    `<div class="pf-ctl">${opts.series ? "" : chips(list, sel(), selKey)}${kg ? `<div class="seg pf-unit" role="group" aria-label="Einheit"><button type="button" data-u="w" aria-pressed="${!wkg()}">Watt</button><button type="button" data-u="kg" aria-pressed="${wkg()}">W/kg</button></div>` : ""}</div>
    ${opts.series && list.length > 1 ? `<div class="legend">${list.map(s => `<span><i class="line" style="background:${s.c}"></i>${esc(s.n)}</span>`).join("")}</div>` : ""}
    <div class="pf-plot"></div>
    <details class="pf-tbl"><summary>Als Tabelle</summary><div class="tscroll"><table><thead></thead><tbody></tbody></table></div></details>
    ${!opts.series && C && arr(C.sources).length ? `<p class="pf-src muted">Quellen: ${C.sources.map(esc).join(", ")}${kg ? ` · Gewicht ${nf(kg, 1)} kg (Garmin)` : ""}</p>` : ""}`;
  if (!opts.series) bindChips(card, selKey, avail, draw);
  const u = card.querySelector(".pf-unit");
  if (u) u.addEventListener("click", e => {
    const b = e.target.closest("button[data-u]"); if (!b) return;
    UI.wkg = b.dataset.u === "kg"; saveUI();
    u.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String((x.dataset.u === "kg") === UI.wkg)));
    draw();
  });
  draw();
}

const R_TICKS = [{ v: 400, l: "400 m" }, { v: 1000, l: "1 km" }, { v: 5000, l: "5 km" }, { v: 10000, l: "10 km" }, { v: 21097.5, l: "HM" }, { v: 42195, l: "M" }];
function paceCard(card, C) {
  const P = obj(C && C.pace) || {}, list = serList(C).filter(s => pacePts(P[s.k]).length);
  const head = `<h3 class="chead">${IC.run}Pace-Kurve<span class="r muted pf-r">Laufen${C && isoOk(C.updated) ? ` · Stand ${esc(dShort(C.updated))}` : ""}</span></h3>`;
  if (!list.length) {
    card.innerHTML = head + `<div class="hint">${IC.info}<span>Pace-Kurve braucht Läufe mit GPS oder Laufband-Distanz. Sie erscheint nach dem nächsten Abgleich mit solchen Läufen.</span></div>`;
    return;
  }
  const avail = list.map(s => s.k);
  UI.pace = UI.pace.filter(k => avail.includes(k)); if (!UI.pace.length) UI.pace = avail.slice(0, 2);
  const base = pacePts(P.all).length ? "all" : avail[0], yr = list.find(s => s.k === "year" && s.k !== base);
  const draw = () => {
    const S = list.filter(s => UI.pace.includes(s.k)).map(s => ({ name: s.n, color: s.c, pts: pacePts(P[s.k]).map(p => ({ x: p.m, y: pace(p.m, p.sec), p })) }));
    const xs = S.flatMap(s => s.pts.map(p => p.x));
    const lo = Math.min(...xs) * 0.8, hi = Math.max(...xs) * 1.2;
    curveChart(card.querySelector(".pf-plot"), { series: S, lo, hi, ticks: R_TICKS, invert: true, dots: true, height: 220, label: "Pace-Kurve Laufen",
      yFmt: v => paceFmt(v) + " /km", yTick: v => paceFmt(v), xName: x => distLbl(x), tipVal: q => `${clock(q.p.sec)} · ${paceFmt(q.y)} /km` });
  };
  const rows = pacePts(P[base]);
  const yrPts = yr ? pacePts(P.year) : [];
  card.innerHTML = head + `<p class="desc">Schnellste Pace je Distanz · schneller = weiter oben · x-Achse logarithmisch</p>
    <div class="pf-ctl">${chips(list, UI.pace, "pace")}</div>
    <div class="pf-plot"></div>
    <h4 class="pf-h4">Bestzeiten</h4>
    <div class="tscroll pf-best"><table><thead><tr><th>Distanz</th><th class="n">Zeit</th><th class="n">Pace</th><th class="n">Datum</th>${yr ? `<th class="n">${esc(yr.n)}</th>` : ""}<th class="pf-dk">Aktivität</th></tr></thead><tbody>
      ${rows.map(p => { const y = yr && at(yrPts, "m", p.m);
        return `<tr><td>${esc(distLbl(p.m))}</td><td class="n"><b>${clock(p.sec)}</b></td><td class="n">${paceFmt(pace(p.m, p.sec))} /km</td><td class="n">${p.date ? esc(dShort(p.date)) : "–"}</td>${yr ? `<td class="n">${y ? clock(y.sec) : "–"}</td>` : ""}<td class="pf-dk">${esc(trim(p.activity, 40))}</td></tr>`; }).join("")}
    </tbody></table></div>
    ${C && arr(C.sources).length ? `<p class="pf-src muted">Quellen: ${C.sources.map(esc).join(", ")}</p>` : ""}`;
  bindChips(card, "pace", avail, draw);
  draw();
}

function progressHook(host) {
  if (!host) return;
  const C = obj(G().curves);
  ["pfPower", "pfPace"].forEach(id => { const o = $(id); if (o) o.remove(); });
  const pw = document.createElement("div"); pw.className = "card pcard wide pf-card"; pw.id = "pfPower";
  const pc = document.createElement("div"); pc.className = "card pcard wide pf-card"; pc.id = "pfPace";
  host.append(pw, pc);
  powerCard(pw, C); paceCard(pc, C);
}

// =====================================================================================
// Rennplanung (Mehr › Rennplanung)
// =====================================================================================
const RP = () => obj(TD().race_plan);
const daysLeft = rp => { const d = tms(rp.date); return d != null ? Math.round((d - todayRef()) / DAY) : isNum(rp.days_left) ? rp.days_left : null; };
const raceKey = rp => "garvis.race." + String((rp.event || "") + "|" + (rp.date || "")).toLowerCase().replace(/[^a-z0-9|äöüß-]+/g, "-");
const VERDICT = {
  realistic: ["good", IC.check, "Realistisch"], ok: ["good", IC.check, "Realistisch"], likely: ["good", IC.check, "Realistisch"], faster: ["good", IC.check, "Mit Puffer"], easy: ["good", IC.check, "Mit Puffer"],
  ambitious: ["warning", IC.warning, "Ambitioniert"], tight: ["warning", IC.warning, "Knapp"],
  unrealistic: ["serious", IC.warning, "Eher unrealistisch"], unlikely: ["serious", IC.warning, "Eher unrealistisch"], too_ambitious: ["serious", IC.warning, "Sehr ambitioniert"], slower: ["serious", IC.warning, "Eher unrealistisch"],
};
const distText = d => {
  if (typeof d === "string") return d;
  d = obj(d); if (!d) return "";
  if (d.name || d.text || d.label) return d.name || d.text || d.label;
  const p = [];
  if (isNum(d.swim_m)) p.push(`${nf(d.swim_m / 1000, d.swim_m % 1000 ? 1 : 0)} km Schwimmen`);
  if (isNum(d.bike_km)) p.push(`${nf(d.bike_km)} km Rad`);
  if (isNum(d.run_km)) p.push(`${nf(d.run_km, d.run_km % 1 ? 1 : 0)} km Laufen`);
  if (isNum(d.km)) p.push(`${nf(d.km, d.km % 1 ? 1 : 0)} km`);
  if (isNum(d.m)) p.push(distLbl(d.m));
  return p.join(" · ");
};
const legDist = m => isNum(m) ? (m < 1000 ? `${nf(m)} m` : `${nf(m / 1000, m % 1000 ? 1 : 0)} km`) : "";
const valText = v => isNum(v) ? nf(v, v % 1 ? 1 : 0) : asText(v);
const asText = v => typeof v === "string" ? v : Array.isArray(v) ? v.map(asText).filter(Boolean).join(" · ") : obj(v) ? first(v.text, v.label, v.plan, v.name) || "" : v == null ? "" : String(v);

function renderRace() {
  const sec = $("rennplanung"); if (!sec) return;
  const rp = RP();
  if (!rp) {
    sec.innerHTML = `<h2>Rennplanung</h2><p class="sub">Dein Plan für den Wettkampftag</p><div class="card"><div class="empty">Die Rennplanung entsteht, sobald unter „Ziel &amp; Fokus“ ein Wettkampf mit Datum gesetzt ist – beim nächsten Planungslauf.</div>
      <a class="linkrow" href="#mehr/ziel">Ziel festlegen ${CHEV}</a></div>`;
    return;
  }
  const dl = daysLeft(rp), legs = arr(rp.legs).filter(obj), trs = arr(rp.transitions).filter(obj);
  const store = readLocal(raceKey(rp)) || { pack: {}, check: {} };
  // Abschnitte in Reihenfolge: Leg, Wechsel, Leg, …
  const parts = [];
  legs.forEach((l, i) => {
    const k = sportKey(l.sport);
    parts.push({ kind: "leg", key: k, name: legName(k), dist: legDist(l.distance_m), time: l.time_s, target: l.target_text, notes: l.notes, color: (SP[k] || SP.other).color, ink: INK_ON[k] || "#fff", course: legCourse(l, k) });
    if (trs[i] && i < legs.length - 1) parts.push({ kind: "tr", key: "tr", name: trs[i].name || `Wechsel ${i + 1}`, time: trs[i].time_s, tips: arr(trs[i].tips), color: "var(--axis)", ink: "var(--text-primary)" });
  });
  const total = isNum(rp.total_s) ? rp.total_s : sumA(parts.map(p => p.time));
  let cum = 0; parts.forEach(p => { cum += p.time || 0; p.cum = cum; });
  const timed = parts.filter(p => isNum(p.time) && p.time > 0);
  const tc = obj(rp.target_check);
  const vd = tc && (VERDICT[String(tc.verdict || "").toLowerCase()] || null);
  const tgtS = tc && (isNum(tc.target_s) ? tc.target_s : isNum(tc.target) ? tc.target : null);
  const est = tc && isNum(tc.estimate_s) ? tc.estimate_s : total;
  const diff = tgtS != null && isNum(est) ? est - tgtS : null;
  const legend_ = [...new Map(timed.map(p => [p.key, p])).values()];

  const hero = `<article class="card rp-hero">
      <div class="kicker">${dl == null ? "Wettkampf" : dl > 0 ? "Countdown" : dl === 0 ? "Heute ist Wettkampftag" : "Vorbei"}</div>
      <div class="rp-count">${dl == null ? "" : dl > 0 ? `<b>${nf(dl)}</b><span>${dl === 1 ? "Tag" : "Tage"}</span>` : dl === 0 ? `<b>Heute</b>` : `<b>${nf(-dl)}</b><span>${dl === -1 ? "Tag" : "Tage"} her</span>`}</div>
      <div class="rp-ev">${esc(rp.event || "Wettkampf")}</div>
      <div class="rp-meta">${[rp.date && fmtDate(tms(rp.date)), rp.sport && (/tri/i.test(rp.sport) ? "Triathlon" : sportKey(rp.sport) === "other" ? rp.sport : sportName(sportKey(rp.sport))), distText(rp.distance)].filter(Boolean).map(esc).join(" · ")}</div>
    </article>`;

  const seg = timed.length ? `<div class="rp-seg" role="img" aria-label="${esc(timed.map(p => `${p.name} ${hmS(p.time)}`).join(", "))}">${timed.map((p, i) =>
      `<div class="rp-part" data-i="${parts.indexOf(p)}" style="flex:${p.time};background:${p.color};color:${p.ink}" tabindex="0"><span data-short="${esc(p.kind === "tr" ? p.name : hmS(p.time))}">${esc(p.name)} ${esc(hmS(p.time))}</span></div>`).join("")}</div>
      <div class="rp-axis"><span>Start</span><span>${isNum(total) ? esc(clock(total)) : ""}</span></div>
      ${legend_.length > 1 ? `<div class="legend" style="margin-top:8px">${legend_.map(p => `<span><i style="background:${p.color}"></i>${esc(p.kind === "tr" ? "Wechsel" : p.name)}</span>`).join("")}</div>` : ""}` : "";
  const legRows = parts.map(p => `<li class="rp-leg${p.kind === "tr" ? " tr" : ""}">
      <span class="rp-mk" style="background:${p.color}"></span>
      <div class="rp-lb"><b>${esc(p.name)}${p.dist ? ` <span class="muted">${esc(p.dist)}</span>` : ""}</b>
        ${p.target ? `<div class="rp-tg">${esc(p.target)}</div>` : ""}
        ${p.course && p.course.name ? `<div class="rp-nt"><a class="rp-cl-a" href="#rpCourse${parts.indexOf(p)}" data-to="rpCourse${parts.indexOf(p)}">${IC.pin}${esc(p.course.name)}${p.course.laps > 1 ? ` · ${p.course.laps} Runden` : ""}</a></div>` : ""}
        ${p.notes ? `<div class="rp-nt">${esc(asText(p.notes))}</div>` : ""}
        ${p.tips && p.tips.length ? `<div class="rp-nt">${p.tips.map(x => esc(asText(x))).join(" · ")}</div>` : ""}</div>
      <div class="rp-tm"><b>${isNum(p.time) ? esc(clock(p.time)) : "–"}</b>${isNum(p.time) ? `<small>nach ${esc(clock(p.cum))}</small>` : ""}</div></li>`).join("");
  const totalBox = `<div class="rp-total"><div><div class="kicker">Geschätzte Gesamtzeit</div><div class="rp-tt">${isNum(total) ? esc(clock(total)) : "–"}${isNum(total) && total >= 3600 ? "<small>h</small>" : ""}</div></div>
      ${tc ? `<div class="rp-tc"><div class="kicker">Ziel ${esc(asText(tc.target) || (tgtS != null ? clock(tgtS) : ""))}</div>
        ${vd ? `<span class="rp-status" style="--c:var(--${vd[0]})"><i>${vd[1]}</i>${vd[2]}</span>` : tc.verdict ? `<span class="rp-status" style="--c:var(--axis)"><i>${IC.info}</i>${esc(String(tc.verdict))}</span>` : ""}
        ${diff != null ? `<div class="rp-df">${Math.abs(diff) < 1 ? "genau im Ziel" : `${diff > 0 ? "+" : "−"}${esc(clock(Math.abs(diff)))} ${diff > 0 ? "über" : "unter"} dem Ziel`}</div>` : ""}
        ${tc.text ? `<div class="rp-df">${esc(tc.text)}</div>` : ""}</div>` : ""}</div>`;
  const legsCard = legs.length ? `<article class="card rp-legs"><h3 class="chead">${IC.timer}Abschnitte &amp; Zielwerte</h3>
      <p class="desc">Geschätzte Zeiten je Abschnitt aus deinen Trainingsdaten</p>${seg}<ul class="rp-list">${legRows}</ul>${totalBox}</article>` : "";

  // Je Abschnitt mit Strecke: Höhenprofil + Abschnittstabelle
  const courseCards = parts.filter(p => p.course).map(p => { const C = p.course, i = parts.indexOf(p);
    const notes = [...arr(C.notes), ...(typeof C.notes === "string" ? [C.notes] : []), C.summary, C.hint].map(asText).filter(Boolean);
    return `<article class="card rp-course" id="rpCourse${i}"><h3 class="chead">${sportIc(p.key)}${esc(({ bike: "Radstrecke", run: "Laufstrecke", swim: "Schwimmstrecke" })[p.key] || p.name + " · Strecke")}${p.dist ? `<span class="r muted">${esc(p.dist)}</span>` : ""}</h3>
      <div class="rp-cn">${esc(C.name || "Garmin-Strecke")}</div>
      ${courseFacts(C).length ? `<p class="desc">${courseFacts(C).map(esc).join(" · ")}</p>` : ""}
      ${lapNote(C)}
      <div class="rp-ph" data-i="${i}"></div>
      ${sectionTable(C)}
      ${notes.length ? `<ul class="why rp-cnotes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</article>`; }).join("");

  const F = obj(rp.fueling);
  const fuel = F ? `<article class="card"><h3 class="chead">${IC.bolt}Verpflegung</h3>
      <div class="rp-tiles">${[[F.total_carbs_g, "Kohlenhydrate gesamt", "g"], [F.fluid_ml_h, "Trinken", "ml/h"], [F.sodium_mg_h, "Natrium", "mg/h"]].filter(x => x[0] != null).map(([v, l, u]) =>
        `<div class="pf-kpi"><div class="l">${l}</div><div class="v">${Array.isArray(v) ? v.map(x => nf(x)).join("–") : esc(isNum(v) ? nf(v) : v)}<small>${u}</small></div></div>`).join("")}</div>
      ${F.pre ? `<div class="rp-fu"><div class="kicker">Vor dem Start</div><p>${esc(asText(F.pre))}</p></div>` : ""}
      ${arr(F.legs).length ? `<ul class="rp-fl">${arr(F.legs).map(l => { const o = obj(l) || { text: l }, k = sportKey(o.sport);
        const nums = [isNum(o.carbs_g_h) && `${nf(o.carbs_g_h)} g KH/h`, isNum(o.fluid_ml_h) && `${nf(o.fluid_ml_h)} ml/h`, isNum(o.sodium_mg_h) && `${nf(o.sodium_mg_h)} mg Natrium/h`].filter(Boolean).join(" · ");
        return `<li><span class="rp-mk" style="background:${o.sport ? (SP[k] || SP.other).color : "var(--axis)"}"></span><div><b>${esc(o.sport ? legName(k) : o.name || "")}</b>${nums ? ` <span class="muted">${nums}</span>` : ""}${asText(o.text || o.plan || o.notes) ? `<div class="rp-nt">${esc(asText(o.text || o.plan || o.notes))}</div>` : ""}</div></li>`; }).join("")}</ul>` : ""}
      ${arr(F.plan).length ? `<div class="kicker" style="margin-top:14px">Ablauf</div><ol class="rp-ol">${F.plan.map(x => `<li>${esc(asText(x))}</li>`).join("")}</ol>` : ""}</article>` : "";

  const sched = arr(rp.schedule).filter(Boolean);
  const schedCard = sched.length ? `<article class="card"><h3 class="chead">${IC.clock}Zeitplan am Renntag</h3>
      <ol class="rp-sched">${sched.map(s => { const o = obj(s) || { text: s }; return `<li><span class="tm">${esc(o.time || "")}</span><i></i><span>${esc(asText(o.text || o.label))}</span></li>`; }).join("")}</ol></article>` : "";

  const pack = arr(rp.packing).map(asText).filter(Boolean);
  const nPack = pack.filter(x => store.pack[x]).length;
  const packCard = pack.length ? `<article class="card" id="rpPack"><h3 class="chead">${IC.list}Packliste<span class="r muted rp-cnt">${nPack} von ${pack.length}</span></h3>
      <div class="rp-meter" aria-hidden="true"><div style="width:${pack.length ? nPack / pack.length * 100 : 0}%"></div></div>
      <ul class="rp-checks">${pack.map((x, i) => `<li><label><input type="checkbox" data-pack="${i}"${store.pack[x] ? " checked" : ""}><span>${esc(x)}</span></label></li>`).join("")}</ul>
      <p class="pf-src muted">Abhaken wird nur auf diesem Gerät gespeichert.</p></article>` : "";

  const cl = arr(rp.checklist).map(c => obj(c) || { text: c }).filter(c => c.text).sort((a, b) => (b.days_before ?? -1) - (a.days_before ?? -1));
  const clRow = (c, i) => {
    const db = isNum(c.days_before) ? c.days_before : null, done = !!store.check[c.text];
    const due = dl != null && db != null && dl <= db && dl >= 0;
    const when = db == null ? "" : db === 0 ? "am Renntag" : db === 1 ? "1 Tag vorher" : `${db} Tage vorher`;
    const st = dl == null || db == null ? "" : dl < db ? "fällig" : dl === db ? "heute" : dl - db === 1 ? "morgen" : `in ${dl - db} Tagen`;
    return `<li class="${due && !done ? "due" : ""}${done ? " done" : ""}"><label><input type="checkbox" data-check="${i}"${done ? " checked" : ""}><span>${esc(c.text)}<small>${esc(when)}${st ? ` · ${due && !done ? `<b>${IC.clock}${esc(st)}</b>` : esc(st)}` : ""}</small></span></label></li>`;
  };
  const nDue = cl.filter(c => dl != null && isNum(c.days_before) && dl <= c.days_before && !store.check[c.text]).length;
  const clCard = cl.length ? `<article class="card" id="rpCheck"><h3 class="chead">${IC.check}Checkliste Vorwoche${nDue ? `<span class="r rp-due">${nDue} fällig</span>` : ""}</h3>
      <ul class="rp-checks rp-cl">${cl.map(clRow).join("")}</ul></article>` : "";

  const basis = [...arr(rp.basis), ...arr(rp.notes), ...(typeof rp.notes === "string" ? [rp.notes] : [])].map(asText).filter(Boolean);
  const basisCard = basis.length || rp.disclaimer ? `<article class="card"><h3 class="chead">${IC.info}Worauf beruht das?</h3>
      ${basis.length ? `<ul class="why">${basis.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${rp.disclaimer ? `<p class="note rp-disc">${esc(asText(rp.disclaimer))}</p>` : ""}</article>` : "";

  sec.innerHTML = `<h2>Rennplanung</h2><p class="sub">Zielwerte, Zeiten und Ablauf für deinen Wettkampf</p>
    <div class="rp-grid"><div class="stack">${hero}${legsCard}${courseCards}${schedCard}${packCard}</div><div class="stack">${fuel}${clCard}${basisCard}</div></div>`;

  sec.querySelectorAll(".rp-ph").forEach(h => profileChart(h, parts[+h.dataset.i].course));
  sec.querySelectorAll("a.rp-cl-a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); const t = $(a.dataset.to); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  // Segmente: Beschriftung nur, wenn sie hineinpasst (sonst Tooltip/Liste)
  requestAnimationFrame(() => sec.querySelectorAll(".rp-part").forEach(d => {
    const s = d.firstElementChild; if (!s) return;
    if (s.scrollWidth > d.clientWidth) s.textContent = s.dataset.short;
    if (s.scrollWidth > d.clientWidth) s.remove();
  }));
  sec.querySelectorAll(".rp-part").forEach(d => {
    const p = parts[+d.dataset.i];
    const tip = e => showTip(e, `${p.name}${p.dist ? " · " + p.dist : ""}`, [{ k: "Zeit", v: clock(p.time), color: p.color }, { k: "Anteil", v: nf(p.time / total * 100) + " %" },
      ...(p.target ? [{ k: "Ziel", v: trim(p.target, 36) }] : []), { k: "Nach", v: clock(p.cum) }]);
    d.addEventListener("pointermove", tip); d.addEventListener("pointerdown", tip); d.addEventListener("pointerleave", hideTip);
    d.addEventListener("focus", () => { const r = d.getBoundingClientRect(); tip({ clientX: r.left + r.width / 2, clientY: r.bottom }); });
    d.addEventListener("blur", hideTip);
  });
  const save = () => writeLocal(raceKey(rp), store);
  sec.querySelectorAll("input[data-pack]").forEach(i => i.addEventListener("change", () => {
    store.pack[pack[+i.dataset.pack]] = i.checked; if (!i.checked) delete store.pack[pack[+i.dataset.pack]]; save();
    const n = pack.filter(x => store.pack[x]).length;
    sec.querySelector("#rpPack .rp-cnt").textContent = `${n} von ${pack.length}`;
    sec.querySelector("#rpPack .rp-meter div").style.width = `${n / pack.length * 100}%`;
  }));
  sec.querySelectorAll("input[data-check]").forEach(i => i.addEventListener("change", () => {
    const c = cl[+i.dataset.check]; if (i.checked) store.check[c.text] = true; else delete store.check[c.text]; save(); renderRace();
  }));
}

// =====================================================================================
// Strecken (GARMIN.courses, TODAY.race_plan.legs[i].course): Höhenprofil + Abschnittstabelle
// =====================================================================================
const CTYPE = {
  up: { name: "Anstieg", color: "var(--s2)" },
  down: { name: "Abfahrt", color: "var(--s1)" },
  flat: { name: "Flach/wellig", color: "var(--text-muted)" },
};
const ctKey = s => /anstieg|climb|uphill|berg|^up/i.test(String(s || "")) ? "up" : /abfahrt|descent|downhill|^down/i.test(String(s || "")) ? "down" : "flat";
const profPts = p => arr(p).filter(q => Array.isArray(q) && isNum(+q[0]) && isNum(+q[1])).map(q => [+q[0], +q[1]]).sort((a, b) => a[0] - b[0]);
const gradeTxt = g => isNum(g) ? `${g > 0 ? "+" : g < 0 ? "−" : ""}${nf(Math.abs(g), 1)} %` : "–";
const kmTxt = v => nf(v, v % 1 && v < 100 ? 1 : 0);
const courseApi = id => (A.api.courseById ? A.api.courseById(id) : null);
// Verpflegungspunkte: [{km, name}] oder [km] unter verschiedenen Schlüsseln; race_plan: fuel_points [{min, km, where}]
const aidPts = (...src) => {
  const l = src.map(s => obj(s) ? first(s.fuel_points, s.aid_stations, s.feed_zones, s.aid, s.feeds, s.verpflegung) : null).find(x => arr(x).length);
  return arr(l).map(a => isNum(a) ? { km: a } : obj(a) && isNum(+first(a.km, a.at_km, a.distance_km))
    ? { km: +first(a.km, a.at_km, a.distance_km), name: first(a.name, a.label, a.text, isNum(a.min) ? `Gel · min ${nf(a.min)}` : null) } : null).filter(Boolean);
};
// Strecke eines Abschnitts: race_plan-Angaben (mit Zielen) vor GARMIN.courses (Profil); Fallback über die im Ziel gespeicherte ID
function legCourse(leg, k) {
  const c = obj(leg.course), goal = obj(TD().goal) || {};
  const id = c && c.id != null ? c.id : k === "bike" || k === "run" ? goal[k + "_course_id"] : null;
  const base = id != null ? courseApi(id) : null;
  if (!c && !base) return null;
  const C = { ...(base || {}), ...(c || {}) };
  C.profile = profPts(c && arr(c.profile).length ? c.profile : base && base.profile);
  C.sections = arr(c && arr(c.sections).length ? c.sections : base && base.sections).filter(obj).filter(s => isNum(+s.from_km) && isNum(+s.to_km));
  C.aid = aidPts(c, leg, base);
  C.laps = isNum(+C.laps) && +C.laps > 1 ? Math.round(+C.laps) : 1;
  if (C.profile.length < 2 && !C.sections.length) return null;
  return C;
}
// Runden: Profil einer Runde wird gekachelt, wenn die Abschnitte über die ganze Renndistanz gehen
function coursePts(C) {
  let pts = C.profile;
  const lapLen = pts.length ? pts[pts.length - 1][0] : 0, secMax = Math.max(0, ...C.sections.map(s => +s.to_km));
  let tiled = false;
  if (C.laps > 1 && lapLen > 0 && secMax > lapLen * 1.15) {
    const out = [];
    for (let l = 0; l < C.laps; l++) pts.forEach((p, i) => { if (l && !i) return; out.push([p[0] + l * lapLen, p[1]]); });
    pts = out; tiled = true;
  }
  return { pts, lapLen, tiled };
}
const eleAt = (pts, km) => {
  if (!pts.length) return null;
  if (km <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= km) { const a = pts[i - 1], b = pts[i], f = (km - a[0]) / ((b[0] - a[0]) || 1); return a[1] + f * (b[1] - a[1]); }
  return pts[pts.length - 1][1];
};
function profileChart(host, C, { height = 190 } = {}) {
  host.innerHTML = "";
  const { pts, lapLen, tiled } = coursePts(C);
  if (pts.length < 2) return;
  const box = document.createElement("div"); box.className = "chart pf-chart rp-prof"; host.appendChild(box);
  const ys = pts.map(p => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 80) { const mid = (hi + lo) / 2; lo = mid - 40; hi = mid + 40; }
  const yt = niceTicks(lo - (hi - lo) * 0.05, hi, 3), y0 = yt[0], y1 = yt[yt.length - 1];
  const W = box.clientWidth || 340, H = height, m = { l: Math.max(36, (nf(y1).length + 2) * 6.6 + 8), r: 12, t: C.aid.length ? 18 : 10, b: 24 };
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  const X = v => m.l + (v - x0) / ((x1 - x0) || 1) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b), base = Y(y0);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Höhenprofil ${C.name || ""}: ${kmTxt(x1 - x0)} km, ${nf(Math.min(...ys))}–${nf(Math.max(...ys))} m` }, box);
  yt.forEach((v, i) => {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: i === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = `${nf(v)}${i === yt.length - 1 ? " m" : ""}`;
  });
  niceTicks(x0, x1, W < 420 ? 4 : 7).filter(v => v >= x0 - 1e-9 && v <= x1 + 1e-9).forEach((v, i, a) => {
    el("text", { x: X(v), y: H - 7, "text-anchor": i === 0 && X(v) - m.l < 12 ? "start" : "middle" }, svg).textContent = i === a.length - 1 ? `${kmTxt(v)} km` : kmTxt(v);
  });
  // Abschnitte: Fläche (Wash) + 2px-Linie in der Typfarbe; ohne Abschnitte eine neutrale Fläche
  const secs = C.sections.map(s => ({ ...s, from: Math.max(x0, +s.from_km), to: Math.min(x1, +s.to_km), k: ctKey(s.type) })).filter(s => s.to > s.from);
  const segs = secs.length ? secs : [{ from: x0, to: x1, k: null }];
  const slice = (a, b) => [[a, eleAt(pts, a)], ...pts.filter(p => p[0] > a && p[0] < b), [b, eleAt(pts, b)]];
  segs.forEach(s => {
    const P = slice(s.from, s.to), col = s.k ? CTYPE[s.k].color : "var(--text-secondary)";
    const d = P.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("");
    el("path", { d: `${d}L${X(s.to).toFixed(1)},${base}L${X(s.from).toFixed(1)},${base}Z`, fill: col, "fill-opacity": s.k === "flat" ? 0.12 : 0.18 }, svg);
    s.path = el("path", { d, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  });
  // 2px-Flächenlücke zwischen Abschnitten
  secs.slice(1).forEach(s => el("line", { x1: X(s.from), x2: X(s.from), y1: Y(eleAt(pts, s.from)) + 2, y2: base, stroke: "var(--surface-1)", "stroke-width": 2 }, svg));
  if (tiled) for (let l = 1; l < C.laps; l++) {
    const x = X(x0 + l * lapLen);
    el("line", { x1: x, x2: x, y1: m.t, y2: base, stroke: "var(--axis)", "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
    el("text", { x: x + 4, y: m.t + 10, "text-anchor": "start", class: "rp-lap" }, svg).textContent = `Runde ${l + 1}`;
  }
  // Verpflegung: Markierung oben, gestrichelt bis zum Profil
  C.aid.filter(a => a.km >= x0 && a.km <= x1).forEach(a => {
    const x = X(a.km);
    el("line", { x1: x, x2: x, y1: 10, y2: Y(eleAt(pts, a.km)), stroke: "var(--text-secondary)", "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    el("path", { d: `M${x - 5},4h10l-5,7z`, fill: "var(--text-primary)", stroke: "var(--surface-1)", "stroke-width": 1.5, "stroke-linejoin": "round" }, svg);
  });
  // Hover: Fadenkreuz rastet auf dem nächsten Profilpunkt ein
  const cross = el("line", { y1: m.t, y2: base, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4, fill: "var(--text-primary)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg);
  const hit = el("rect", { x: m.l - 8, y: 0, width: W - m.l - m.r + 16, height: H, fill: "transparent" }, svg);
  const slope = km => { const a = Math.max(x0, km - 0.25), b = Math.min(x1, km + 0.25); return b - a > 0.05 ? (eleAt(pts, b) - eleAt(pts, a)) / ((b - a) * 1000) * 100 : null; };
  const move = e => {
    const r = svg.getBoundingClientRect(), km = x0 + (e.clientX - r.left - m.l) / (W - m.l - m.r) * (x1 - x0);
    let p = pts[0]; pts.forEach(q => { if (Math.abs(q[0] - km) < Math.abs(p[0] - km)) p = q; });
    cross.setAttribute("x1", X(p[0])); cross.setAttribute("x2", X(p[0])); cross.setAttribute("visibility", "visible");
    const s = secs.find(q => p[0] >= q.from && p[0] <= q.to);
    dot.setAttribute("cx", X(p[0])); dot.setAttribute("cy", Y(p[1])); dot.setAttribute("fill", s ? CTYPE[s.k].color : "var(--text-secondary)"); dot.setAttribute("visibility", "visible");
    const sl = slope(p[0]), rows = [{ k: "Höhe", v: `${nf(p[1])} m` }, { k: "Steigung", v: sl == null ? "–" : gradeTxt(sl) }];
    if (tiled) rows.push({ k: "Runde", v: `${Math.min(C.laps, Math.floor((p[0] - x0) / lapLen) + 1)} von ${C.laps}` });
    if (s) {
      rows.push({ k: CTYPE[s.k].name, v: `km ${kmTxt(+s.from_km)}–${kmTxt(+s.to_km)}${isNum(+s.grade) && s.grade != null ? " · Ø " + gradeTxt(+s.grade) : ""}`, color: CTYPE[s.k].color });
      if (s.target_text) rows.push({ k: "Ziel", v: trim(asText(s.target_text), 34) });
      if (isNum(s.time_s)) rows.push({ k: "Zeit Abschnitt", v: clock(s.time_s) });
    }
    const a = C.aid.find(q => Math.abs(q.km - p[0]) <= Math.max(0.3, (x1 - x0) / 60));
    if (a) rows.push({ k: "Verpflegung", v: a.name ? trim(asText(a.name), 28) : `km ${kmTxt(a.km)}` });
    showTip(e, `km ${nf(p[0], 1)}`, rows);
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
  // Legende: Abschnittstypen (Fläche) + Verpflegung
  const used = [...new Set(secs.map(s => s.k))].sort((a, b) => Object.keys(CTYPE).indexOf(a) - Object.keys(CTYPE).indexOf(b));
  const items = used.map(k => `<span><i style="background:${CTYPE[k].color}"></i>${CTYPE[k].name}</span>`);
  if (C.aid.length) items.push(`<span><i class="rp-aidk" aria-hidden="true"></i>Verpflegung</span>`);
  if (items.length > 1 || C.aid.length) host.insertAdjacentHTML("beforeend", `<div class="legend" style="margin-top:6px">${items.join("")}</div>`);
}
function sectionTable(C) {
  if (!C.sections.length) return "";
  const hasT = C.sections.some(s => s.target_text), hasZ = C.sections.some(s => isNum(s.time_s));
  return `<div class="tscroll rp-st"><table><thead><tr><th>km</th><th>Typ</th><th class="n">Steigung</th>${hasT ? `<th class="pf-dk">Ziel</th>` : ""}${hasZ ? `<th class="n">Zeit</th>` : ""}</tr></thead><tbody>${C.sections.map(s => { const k = ctKey(s.type);
    return `<tr><td class="num">${kmTxt(+s.from_km)}–${kmTxt(+s.to_km)}</td><td><span class="rp-ty"><i style="background:${CTYPE[k].color}"></i>${esc(s.label || (/^(climb|descent|flat)$/.test(s.type) ? CTYPE[k].name : s.type) || CTYPE[k].name)}</span>${isNum(s.gain_m) && s.gain_m > 0 ? `<small>${nf(s.gain_m)} hm</small>` : ""}${hasT && s.target_text ? `<small class="rp-tgm">${esc(asText(s.target_text))}</small>` : ""}</td>
      <td class="n">${s.grade != null && isNum(+s.grade) ? esc(gradeTxt(+s.grade)) : "–"}</td>${hasT ? `<td class="rp-tgc pf-dk">${esc(asText(s.target_text) || "–")}</td>` : ""}${hasZ ? `<td class="n">${isNum(s.time_s) ? esc(clock(s.time_s)) : "–"}</td>` : ""}</tr>`; }).join("")}</tbody></table></div>`;
}
const courseFacts = C => [isNum(C.distance_km) && `${kmTxt(C.distance_km)} km`, isNum(C.gain_m) && `${nf(C.gain_m)} hm Anstieg`, isNum(C.loss_m) && `${nf(C.loss_m)} hm Abstieg`, C.loop && C.laps <= 1 ? "Rundkurs" : ""].filter(Boolean);
function lapNote(C) {
  if (C.laps <= 1) return "";
  const { tiled, lapLen } = coursePts(C);
  return `<div class="hint rp-laps">${IC.info}<span><b>${C.laps} Runden</b>${lapLen ? ` à ${esc(kmTxt(lapLen))} km` : ""} – ${tiled ? "das Profil zeigt alle Runden hintereinander." : "Profil und Abschnitte gelten für eine Runde."}</span></div>`;
}

// Mehr › Meine Garmin-Strecken: Übersicht mit Mini-Profil, Antippen klappt Profil + Abschnitte auf
const CS_UI = { f: "all" };
const allCourses = () => (A.api.courseList ? A.api.courseList() : []);
const CS_SP = { bike: ["Rad", "var(--sp-bike)"], run: ["Laufen", "var(--sp-run)"], other: ["Sonstige", "var(--sp-other)"] };
function renderCourses() {
  const sec = $("strecken"); if (!sec) return;
  const all = allCourses();
  if (!all.length) { sec.innerHTML = `<h2>Meine Garmin-Strecken</h2><p class="sub">Geplante Strecken aus Garmin Connect</p><div class="card"><div class="empty">Noch keine Strecken. In Garmin Connect unter Training › Strecken anlegen – sie erscheinen nach dem nächsten Datenabgleich.</div></div>`; return; }
  const goal = obj(TD().goal) || {}, used = new Set([goal.bike_course_id, goal.run_course_id].filter(x => x != null).map(String));
  const fs = ["all", "bike", "run", "other"].filter(f => f === "all" || all.some(c => c.sport === f));
  if (!fs.includes(CS_UI.f)) CS_UI.f = "all";
  const list = all.filter(c => CS_UI.f === "all" || c.sport === CS_UI.f);
  sec.innerHTML = `<h2>Meine Garmin-Strecken</h2><p class="sub">${nf(all.length)} geplante ${all.length === 1 ? "Strecke" : "Strecken"} aus Garmin Connect</p>
    <div class="card cs-card">${fs.length > 2 ? `<div class="cp-f cs-f" role="group" aria-label="Sportart">${fs.map(f => `<button type="button" data-f="${f}" aria-pressed="${f === CS_UI.f}">${f === "all" ? "Alle" : CS_SP[f][0]} <span>${all.filter(c => f === "all" || c.sport === f).length}</span></button>`).join("")}</div>` : ""}
      <ul class="cs-list">${list.map(c => { const sp = CS_SP[c.sport] || CS_SP.other;
        return `<li><details data-id="${esc(c.id)}"><summary>${A.api.miniProfile(c.profile, { w: 88, h: 30, color: sp[1], cls: "minip cs-mp" })}
          <span class="cp-txt"><b>${esc(c.name || "Strecke")}${used.has(c.id) ? ` <span class="cs-tag">Im Ziel</span>` : ""}</b><small>${esc([sp[0], isNum(c.distance_km) && `${kmTxt(c.distance_km)} km`, isNum(c.gain_m) && `${nf(c.gain_m)} hm`, c.loop ? "Rundkurs" : ""].filter(Boolean).join(" · "))}</small></span></summary>
          <div class="cs-body"><div class="cs-ph"></div><div class="cs-tb"></div></div></details></li>`; }).join("")}</ul>
      <p class="pf-src muted">Rad- und Laufstrecke für die Rennplanung wählst du unter <a href="#mehr/ziel">Ziel &amp; Fokus</a>.</p></div>`;
  const f = sec.querySelector(".cs-f");
  if (f) f.addEventListener("click", e => { const b = e.target.closest("button[data-f]"); if (!b) return; CS_UI.f = b.dataset.f; renderCourses(); });
  sec.querySelectorAll(".cs-list details").forEach(d => d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.drawn) return;
    const c = all.find(x => x.id === d.dataset.id); if (!c) return;
    const C = { ...c, profile: profPts(c.profile), sections: arr(c.sections).filter(obj).filter(s => isNum(+s.from_km) && isNum(+s.to_km)), aid: aidPts(c), laps: 1 };
    const facts = [isNum(c.loss_m) && `${nf(c.loss_m)} hm Abstieg`, c.source && `Quelle: ${asText(c.source)}`].filter(Boolean);
    profileChart(d.querySelector(".cs-ph"), C, { height: 170 });
    d.querySelector(".cs-tb").innerHTML = (facts.length ? `<p class="desc" style="margin:6px 0 0">${facts.map(esc).join(" · ")}</p>` : "") + sectionTable(C);
    d.dataset.drawn = "1";
  }));
}

// Woche: Link in der Ziel-Kopfkarte · Tagesansicht des Wettkampftags: Link-Karte
function weekHook() {
  const rp = RP(), g = $("wGoal");
  if (!rp || !g || g.querySelector(".pf-racelink")) return;
  const dl = daysLeft(rp);
  g.insertAdjacentHTML("beforeend", `<a class="linkrow pf-racelink" href="#mehr/rennplanung" style="margin-top:12px">Rennplanung${dl != null && dl >= 0 ? ` · ${dl === 0 ? "heute" : `noch ${nf(dl)} ${dl === 1 ? "Tag" : "Tage"}`}` : ""} ${CHEV}</a>`);
}
function dayHook(body, w) {
  const rp = RP();
  if (!rp || !w || !body || (w.date !== rp.date && !(w.type === "race" && !rp.date))) return;
  const total = isNum(rp.total_s) ? rp.total_s : null;
  const a = document.createElement("a"); a.className = "card ds-link pf-daylink"; a.href = "#mehr/rennplanung";
  a.innerHTML = `${IC.medal}<span><b>Rennplanung</b><small>${[total && `Geschätzt ${clock(total)}`, "Zielwerte, Verpflegung, Zeitplan, Packliste"].filter(Boolean).map(esc).join(" · ")}</small></span>${CHEV}`;
  const head = body.querySelector(".ds-head");
  if (head) head.after(a); else body.prepend(a);
}

// =====================================================================================
// Jahresrückblick (Mehr › Jahresrückblick; 31.12.–7.1. zusätzlich auf Heute)
// =====================================================================================
const refYear = () => { const d = new Date(todayRef()); return d.getUTCMonth() === 0 && d.getUTCDate() <= 7 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };
const toPts = v => {
  const list = Array.isArray(v) ? v : obj(v) ? first(v.series, v.points, v.values, v.months, v.data) : null;
  return arr(list).map(p => {
    if (Array.isArray(p)) return { x: tms(p[0]), y: p[1] };
    const o = obj(p); if (!o) return null;
    const d = first(o.date, o.day, isoOk(o.month) ? o.month + (o.month.length === 7 ? "-15" : "") : null);
    const y = first(o.value, o.v, o.y, o.ctl, o.vo2, o.vo2max, o.ftp, o.watts, o.rhr);
    return { x: tms(d), y };
  }).filter(p => p && p.x != null && isNum(p.y)).sort((a, b) => a.x - b.x);
};
const pick = (o, ...keys) => { if (!o) return null; for (const k of keys) if (o[k] != null) return o[k]; return null; };
function hoursOf(o) {
  if (isNum(o)) return o;
  o = obj(o); if (!o) return null;
  const h = pick(o, "hours", "h", "duration_h", "time_h");
  if (isNum(h)) return h;
  const s = pick(o, "time_s", "duration_s", "seconds", "sec");
  if (isNum(s)) return s / 3600;
  const m = pick(o, "minutes", "min", "duration_min");
  return isNum(m) ? m / 60 : null;
}
const kmOf = o => { o = obj(o); if (!o) return null; const k = pick(o, "distance_km", "km", "dist_km"); if (isNum(k)) return k; const m = pick(o, "distance_m", "meters"); return isNum(m) ? m / 1000 : null; };

// Normalisiert TODAY.year_review (Felder robust erkennen); ohne Feld: Rückblick aus GARMIN.activities
function yearData() {
  const raw = obj(TD().year_review);
  if (raw) return normYear(raw, false);
  return fallbackYear(refYear());
}
function normYear(r, computed) {
  const year = isNum(+r.year) && +r.year > 2000 ? +r.year : refYear();
  const T = obj(r.totals) || {};
  const totals = {
    hours: hoursOf(T), activities: pick(T, "activities", "count", "sessions", "n"), km: kmOf(T),
    elev: pick(T, "elevation_m", "ascent_m", "elev_m", "elevation"), kcal: pick(T, "kcal", "calories"),
    days: pick(T, "active_days", "days_active", "days"), longest: obj(T.longest) || obj(T.longest_activity),
  };
  let by = [];
  if (Array.isArray(r.by_sport)) by = r.by_sport.map(o => obj(o)).filter(Boolean).map(o => ({ key: sportKey(first(o.sport, o.key, o.name)), hours: hoursOf(o), count: pick(o, "count", "activities", "n"), km: kmOf(o) }));
  else if (obj(r.by_sport)) by = Object.entries(r.by_sport).map(([k, o]) => ({ key: sportKey(k), hours: hoursOf(o), count: obj(o) ? pick(o, "count", "activities", "n") : null, km: kmOf(o) }));
  const byMap = {};
  by.filter(b => isNum(b.hours)).forEach(b => { const x = byMap[b.key] || (byMap[b.key] = { key: b.key, hours: 0, count: null, km: null }); x.hours += b.hours; if (isNum(b.count)) x.count = (x.count || 0) + b.count; if (isNum(b.km)) x.km = (x.km || 0) + b.km; });
  by = Object.values(byMap).filter(b => b.hours > 0).sort((a, b) => b.hours - a.hours);
  if (!isNum(totals.hours) && by.length) totals.hours = sumA(by.map(b => b.hours));
  // Monate: 12 Töpfe, Stunden je Sportart (oder nur gesamt)
  const months = Array.from({ length: 12 }, (_, i) => ({ i, v: {}, total: null, n: null }));
  arr(r.months).forEach((m, idx) => {
    const o = obj(m) || (isNum(m) ? { hours: m } : null); if (!o) return;
    let i = isNum(o.month) ? o.month - 1 : isoOk(o.month + "-01") ? +String(o.month).slice(5, 7) - 1 : isNum(o.m) ? o.m - 1 : idx;
    if (!(i >= 0 && i < 12)) return;
    const sp = obj(first(o.by_sport, o.sports, o.hours_by_sport));
    if (sp) Object.entries(sp).forEach(([k, v]) => { const h = hoursOf(v); if (isNum(h) && h > 0) { const kk = sportKey(k); months[i].v[kk] = (months[i].v[kk] || 0) + h; } });
    const h = hoursOf(o); if (isNum(h)) months[i].total = h;
    const n = pick(o, "activities", "count", "n"); if (isNum(n)) months[i].n = n;
    if (!sp && isNum(h)) months[i].v._all = h;
  });
  const hasMonths = months.some(m => Object.keys(m.v).length);
  const prs = arr(r.prs).map(p => obj(p) || (typeof p === "string" ? { label: p } : null)).filter(Boolean).map(p => ({
    label: first(p.label, p.name, p.title, p.type, ""), value: first(p.text, p.display, isNum(p.value) && p.unit ? `${nf(p.value, p.value % 1 ? 1 : 0)} ${p.unit}` : p.value),
    date: p.date, activity: first(p.activity, p.activity_name), sport: p.sport, prev: first(p.prev, p.previous, p.old) })).filter(p => p.label || p.value);
  let zones = [];
  if (Array.isArray(r.zones)) zones = r.zones.map((z, i) => { const o = obj(z) || { hours: z }; return { name: first(o.name, o.label, o.zone != null ? `Zone ${o.zone}` : null, `Zone ${i + 1}`), hours: hoursOf(o), pct: pick(o, "pct", "share", "percent") }; });
  else if (obj(r.zones)) zones = Object.entries(r.zones).filter(([k]) => /\d/.test(k)).map(([k, v]) => ({ name: `Zone ${k.replace(/\D/g, "")}`, hours: hoursOf(v), pct: obj(v) ? pick(v, "pct", "share") : null }));
  zones = zones.filter(z => isNum(z.hours) || isNum(z.pct));
  const metric = v => { const o = obj(v); if (!o) return null; return { pts: toPts(o), start: pick(o, "start", "first", "from"), end: pick(o, "end", "last", "to", "current"), max: pick(o, "max", "peak", "high"), min: pick(o, "min", "low"), avg: pick(o, "avg", "mean", "average"), maxDate: pick(o, "max_date", "peak_date") }; };
  const vs = [];
  const VSL = { hours: ["Stunden", v => nf(v, v < 100 ? 1 : 0) + " h", true], activities: ["Einheiten", v => nf(v), true], count: ["Einheiten", v => nf(v), true], distance_km: ["Distanz", v => kmFmt(v) + " km", true], km: ["Distanz", v => kmFmt(v) + " km", true],
    elevation_m: ["Höhenmeter", v => nf(v) + " m", true], kcal: ["Kalorien", v => nf(v) + " kcal", true], active_days: ["Aktive Tage", v => nf(v), true], vo2: ["VO2max", v => nf(v), true], vo2max: ["VO2max", v => nf(v), true], ctl: ["Fitness (CTL)", v => nf(v), true],
    ftp: ["FTP", v => nf(v) + " W", true], rhr: ["Ruhepuls", v => nf(v) + " bpm", false], sleep_h: ["Schlaf", v => nf(v, 1) + " h", true] };
  if (obj(r.vs_prev)) Object.entries(r.vs_prev).forEach(([k, v]) => {
    const base = k.replace(/_(pct|delta|diff)$/, ""), L_ = VSL[base] || [base.replace(/_/g, " "), x => nf(x, x % 1 ? 1 : 0), true];
    const o = obj(v);
    if (o) { const c = pick(o, "cur", "now", "this", "value", "year"), p = pick(o, "prev", "last", "before", "prev_year"); if (isNum(c) || isNum(p)) vs.push({ k: base, label: L_[0], fmt: L_[1], up: L_[2], cur: c, prev: p, pct: pick(o, "pct", "delta_pct", "change_pct") }); }
    else if (isNum(v) && /_pct$/.test(k)) vs.push({ k: base, label: L_[0], fmt: L_[1], up: L_[2], cur: null, prev: null, pct: v });
  });
  const cv = obj(r.curves);
  return {
    year, complete: r.complete === true, computed, updated: first(r.updated, r.generated, r.as_of), until: r.until,
    totals, by, months: hasMonths ? months : null, prs, zones, vo2: metric(r.vo2), ctl: metric(r.ctl), rhr: metric(r.rhr), sleep: obj(r.sleep), vs,
    highlights: arr(r.highlights).map(asText).filter(Boolean), golf: obj(r.golf), curves: cv, push: obj(r.push),
  };
}
function fallbackYear(year) {
  const g = G(), from = Date.UTC(year, 0, 1), to = Math.min(Date.UTC(year, 11, 31), todayRef());
  const acts = arr(g.activities).filter(a => a && !a.multi && a.type !== "transition_v2" && a.type !== "multi_sport");
  const inY = acts.filter(a => { const x = tms(a.date); return x >= from && x <= to; });
  if (!inY.length) return null;
  const doy = to - from;
  const prevA = acts.filter(a => { const x = tms(a.date); return x >= Date.UTC(year - 1, 0, 1) && x <= Date.UTC(year - 1, 0, 1) + doy; });
  const agg = L => ({ hours: sumA(L.map(a => a.dur)) / 60, activities: L.length, km: sumA(L.map(a => a.dist)), elev: sumA(L.map(a => a.elev)), kcal: sumA(L.map(a => a.kcal)), days: new Set(L.map(a => a.date)).size });
  const cur = agg(inY), prev = agg(prevA);
  const lg = inY.reduce((b, a) => !b || (a.dur || 0) > (b.dur || 0) ? a : b, null);
  const by = {}, months = {};
  inY.forEach(a => {
    const k = sportKey(a.type === "hiking" || a.type === "walking" ? "other" : a.type), mi = +a.date.slice(5, 7);
    (by[k] ||= { hours: 0, count: 0, distance_km: 0 }); by[k].hours += (a.dur || 0) / 60; by[k].count++; by[k].distance_km += a.dist || 0;
    (months[mi] ||= { month: mi, by_sport: {}, activities: 0 }); months[mi].by_sport[k] = (months[mi].by_sport[k] || 0) + (a.dur || 0) / 60; months[mi].activities++;
  });
  const vo2 = [...arr(g.vo2 && g.vo2.null), ...arr(g.vo2 && g.vo2.RUNNING)].filter(v => tms(v.date) >= from && tms(v.date) <= to).map(v => ({ date: v.date, value: v.vo2MaxValue }));
  const F = obj(g.fitness), ctl = [];
  if (F && Array.isArray(F.date) && Array.isArray(F.ctl)) F.date.forEach((d, i) => { const x = tms(d); if (x >= from && x <= to && (+d.slice(8, 10) === 1 || i === F.date.length - 1)) ctl.push({ date: d, value: F.ctl[i] }); });
  const ctlV = ctl.map(c => c.value).filter(isNum);
  const r = normYear({
    year, complete: false, updated: g.generated ? String(g.generated).slice(0, 10) : null,
    totals: { hours: cur.hours, activities: cur.activities, distance_km: cur.km, elevation_m: cur.elev || null, kcal: cur.kcal || null, active_days: cur.days,
      longest: lg ? { name: lg.name, hours: lg.dur / 60, date: lg.date } : null },
    by_sport: by, months: Object.values(months),
    vo2: vo2.length ? { series: vo2, start: vo2[0].value, end: vo2.at(-1).value } : null,
    ctl: ctl.length ? { series: ctl, start: ctlV[0], end: ctlV.at(-1), max: Math.max(...ctlV) } : null,
    vs_prev: prevA.length ? { hours: { cur: cur.hours, prev: prev.hours }, activities: { cur: cur.activities, prev: prev.activities }, distance_km: { cur: cur.km, prev: prev.km }, active_days: { cur: cur.days, prev: prev.days } } : null,
  }, true);
  r.until = to;
  return r;
}

const yrName = () => `Jahresrückblick ${(yearData() || { year: refYear() }).year}`;
function todayCardVisible(Y) {
  if (!Y || Y.computed && !obj(TD().year_review)) return false;
  const d = new Date(todayRef()), m = d.getUTCMonth(), day = d.getUTCDate(), y = d.getUTCFullYear();
  const win = (m === 11 && day === 31 && Y.year === y) || (m === 0 && day <= 7 && Y.year === y - 1);
  return win || (m === 11 && Y.complete && Y.year === y);
}
function todayHook() {
  const Y = yearData(), host = $("v-heute"); let card = $("hYear");
  if (!host) return;
  if (!todayCardVisible(Y)) { if (card) card.remove(); return; }
  if (!card) { card = document.createElement("a"); card.id = "hYear"; card.className = "card yr-tile"; card.href = "#mehr/jahresrueckblick"; const a = $("hAlerts"); (a || host.lastElementChild).before(card); }
  const T = Y.totals;
  card.innerHTML = `<div class="yr-tk"><span class="kicker">Dein Sportjahr ${Y.year}</span>${CHEV}</div>
    <div class="yr-tv">${isNum(T.hours) ? `${nf(T.hours)}<small>Stunden</small>` : esc(Y.push && Y.push.title || "Jahresrückblick")}</div>
    <div class="yr-ts">${esc(!isNum(T.hours) && Y.push && Y.push.body || [isNum(T.activities) && pl(T.activities, "Einheit", "Einheiten"), isNum(T.km) && `${kmFmt(T.km)} km`, isNum(T.days) && pl(T.days, "aktiver Tag", "aktive Tage")].filter(Boolean).join(" · ") || "Sieh dir deinen Rückblick an")}</div>
    ${Y.by.length ? `<div class="yr-thin" aria-hidden="true">${Y.by.map(b => `<i style="flex:${b.hours};background:${(SP[b.key] || SP.other).color}"></i>`).join("")}</div>` : ""}`;
  card.style.marginBottom = "18px";
}

// Gestapelte Säulen: Stunden je Monat nach Sportart
function monthChart(host, Y) {
  host.innerHTML = "";
  const keys = SPORTS.filter(s => Y.months.some(m => m.v[s.key] > 0));
  const all = Y.months.some(m => m.v._all > 0) && !keys.length;
  const K = all ? [{ key: "_all", name: "Stunden", color: "var(--s1)" }] : keys;
  legend(host, K);
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 340, H = 210, m = { l: 34, r: 6, t: 8, b: 22 };
  const totals = Y.months.map(b => sumA(K.map(k => b.v[k.key])));
  const ticks = niceTicks(0, Math.max(...totals, 1), 4), y1 = ticks.at(-1);
  const band = (W - m.l - m.r) / 12, bw = Math.max(4, Math.min(24, band - 6));
  const Yp = v => m.t + (1 - v / y1) * (H - m.t - m.b);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Stunden je Monat ${Y.year}` }, box);
  ticks.forEach(v => {
    el("line", { x1: m.l, x2: W - m.r, y1: Yp(v), y2: Yp(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 6, y: Yp(v) + 4, "text-anchor": "end" }, svg).textContent = nf(v);
  });
  const lastM = Y.until ? new Date(Y.until).getUTCMonth() : 11;
  Y.months.forEach((b, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2, g = el("g", { class: "yr-col" }, svg);
    let base = 0;
    const segs = K.filter(k => b.v[k.key] > 0);
    segs.forEach((k, j) => {
      const v = b.v[k.key], yTop = Yp(base + v), yBot = Yp(base), gap = j > 0 ? 2 : 0, h = yBot - yTop - gap;
      if (h > 0.3) el(j === segs.length - 1 ? "path" : "rect", j === segs.length - 1 ? { d: barPath(x, yTop, bw, h), fill: k.color } : { x, y: yTop, width: bw, height: h, fill: k.color }, g);
      base += v;
    });
    el("text", { x: cx, y: H - 7, "text-anchor": "middle" }, svg).textContent = band >= 26 ? MONTHS[i] : MONTHS[i][0];
    const hit = el("rect", { x: m.l + band * i, y: 0, width: band, height: H, fill: "transparent" }, svg);
    const tip = e => {
      svg.querySelectorAll(".yr-col").forEach((c, ci) => c.classList.toggle("dim", ci !== i));
      const rows = segs.slice().sort((a, b2) => b.v[b2.key] - b.v[a.key]).map(k => ({ k: k.name, v: nf(b.v[k.key], 1) + " h", color: k.color }));
      rows.push({ k: "Gesamt", v: nf(totals[i], 1) + " h" });
      if (isNum(b.n)) rows.push({ k: "Einheiten", v: nf(b.n) });
      showTip(e, `${MONTHS_L[i]} ${Y.year}${i > lastM ? " (noch offen)" : ""}`, rows);
    };
    hit.addEventListener("pointermove", tip); hit.addEventListener("pointerdown", tip);
    hit.addEventListener("pointerleave", () => { hideTip(); svg.querySelectorAll(".yr-col").forEach(c => c.classList.remove("dim")); });
  });
  // Tabelle als Alternative
  const det = document.createElement("details"); det.className = "pf-tbl";
  det.innerHTML = `<summary>Als Tabelle</summary><div class="tscroll"><table><thead><tr><th>Monat</th>${K.length > 1 ? K.map(k => `<th class="n">${esc(k.name)}</th>`).join("") : ""}<th class="n">Gesamt</th></tr></thead><tbody>
    ${Y.months.map((b, i) => `<tr><td>${MONTHS_L[i]}</td>${K.length > 1 ? K.map(k => `<td class="n">${b.v[k.key] ? nf(b.v[k.key], 1) : "–"}</td>`).join("") : ""}<td class="n"><b>${totals[i] ? nf(totals[i], 1) + " h" : "–"}</b></td></tr>`).join("")}</tbody></table></div>`;
  host.appendChild(det);
}

function devChart(host, title, M, color, fmt, unit) {
  const pts = M.pts || [];
  const stats = [isNum(M.start) && isNum(M.end) ? `${fmt(M.start)} → <b>${fmt(M.end)}</b> ${unit}` : isNum(M.end) ? `<b>${fmt(M.end)}</b> ${unit}` : "",
    isNum(M.start) && isNum(M.end) && M.end !== M.start ? `<span class="${M.end > M.start ? "delta-up" : "delta-down"}">${M.end > M.start ? "▲" : "▼"} ${signedNf(M.end - M.start, (M.end - M.start) % 1 ? 1 : 0)}</span>` : "",
    isNum(M.max) ? `Höchstwert ${fmt(M.max)}${M.maxDate ? ` (${esc(dShort(M.maxDate))})` : ""}` : ""].filter(Boolean).join(" · ");
  const d = document.createElement("div"); d.className = "subchart";
  d.innerHTML = `<h4 class="chead">${esc(title)}</h4>${stats ? `<p class="desc">${stats}</p>` : ""}<div class="yr-dev"></div>`;
  host.appendChild(d);
  if (pts.length >= 2) lineChart(d.querySelector(".yr-dev"), { series: [{ name: title, color, pts }], height: 140, yFmt: v => v % 1 ? nf(v, 1) : fmt(v), endFmt: v => fmt(v), tipFmt: v => `${fmt(v)} ${unit}`, connect: true, noLegend: true });
  else d.querySelector(".yr-dev").remove();
}

function renderYear() {
  const sec = $("jahresrueckblick"); if (!sec) return;
  const Y = yearData();
  if (!Y) { sec.innerHTML = `<h2>Jahresrückblick</h2><div class="card"><div class="empty">Für dieses Jahr gibt es noch keine Aktivitäten.</div></div>`; return; }
  const T = Y.totals;
  const status = Y.complete ? "Abgeschlossenes Jahr" : `Noch nicht abgeschlossen · Stand ${fmtDate(tms(Y.updated) || Y.until || todayRef())}`;
  const tile = (l, v, u, f) => v == null ? "" : `<div class="pf-kpi"><div class="l">${l}</div><div class="v">${v}${u ? `<small>${u}</small>` : ""}</div>${f ? `<div class="f">${f}</div>` : ""}</div>`;
  const lg = T.longest, lgH = lg && hoursOf(lg);
  const hero = `<article class="card yr-hero">
      <div class="yr-eb"><span class="kicker">Dein Sportjahr</span><span class="kicker">${esc(status)}</span></div>
      <div class="yr-y">${Y.year}</div>
      <div class="yr-big">${isNum(T.hours) ? `<b>${nf(T.hours)}</b><span>Stunden Sport</span>` : `<span>Dein Jahr in Zahlen</span>`}</div>
      ${Y.by.length ? `<div class="yr-thin" role="img" aria-label="${esc(Y.by.map(b => `${sportName(b.key)} ${nf(b.hours)} h`).join(", "))}">${Y.by.map(b => `<i style="flex:${b.hours};background:${(SP[b.key] || SP.other).color}"></i>`).join("")}</div>` : ""}
      <div class="yr-kpis">${[
        tile("Einheiten", isNum(T.activities) ? nf(T.activities) : null),
        tile("Distanz", isNum(T.km) ? kmFmt(T.km) : null, "km"),
        tile("Höhenmeter", isNum(T.elev) ? nf(T.elev) : null, "m"),
        tile("Aktive Tage", isNum(T.days) ? nf(T.days) : null),
        tile("Kalorien", isNum(T.kcal) ? (T.kcal >= 100000 ? nf(T.kcal / 1000) : nf(T.kcal)) : null, T.kcal >= 100000 ? "Tsd. kcal" : "kcal"),
        tile("Längste Einheit", isNum(lgH) ? hmS(lgH * 3600).replace(/ h$/, "") : null, isNum(lgH) && lgH >= 1 ? "h" : "", lg ? esc([trim(lg.name, 26), lg.date && dShort(lg.date)].filter(Boolean).join(" · ")) : ""),
      ].join("")}</div>
      ${Y.computed ? `<p class="pf-src muted">Aus deinen Garmin-Aktivitäten berechnet – der ausführliche Rückblick folgt mit dem nächsten Planungslauf.</p>` : ""}
    </article>`;
  const hl = Y.highlights.length ? `<article class="card"><h3 class="chead">${IC.medal}Highlights</h3><ul class="yr-hl">${Y.highlights.map(h => `<li>${IC.check}<span>${esc(h)}</span></li>`).join("")}</ul></article>` : "";
  const monthsCard = Y.months ? `<article class="card wide"><h3 class="chead">${IC.timer}Stunden je Monat</h3><p class="desc">Trainingszeit nach Sportart</p><div id="yrMonths"></div></article>` : "";
  const maxH = Y.by.length ? Y.by[0].hours : 0, totH = sumA(Y.by.map(b => b.hours));
  const sportsCard = Y.by.length ? `<article class="card"><h3 class="chead">${IC.pulse}Sportarten</h3><p class="desc">Anteil an der Trainingszeit</p>
      <ul class="yr-bars">${Y.by.map(b => `<li data-k="${b.key}"><div class="yr-bl"><span><span class="spi" style="--c:${(SP[b.key] || SP.other).color}" aria-hidden="true">${sportIc(b.key)}</span> ${esc(sportName(b.key))}</span><span class="num">${nf(b.hours, b.hours < 10 ? 1 : 0)} h <small>${nf(b.hours / totH * 100)} %</small></span></div>
        <div class="yr-track"><div style="width:${Math.max(1, b.hours / maxH * 100)}%;background:${(SP[b.key] || SP.other).color}"></div></div>
        ${isNum(b.count) || isNum(b.km) && b.km > 0 ? `<div class="yr-bf">${[isNum(b.count) && pl(b.count, "Einheit", "Einheiten"), isNum(b.km) && b.km > 0 && `${kmFmt(b.km)} km`].filter(Boolean).join(" · ")}</div>` : ""}</li>`).join("")}</ul></article>` : "";
  const prCard = Y.prs.length ? `<article class="card"><h3 class="chead">${IC.trend}Bestwerte ${Y.year}</h3><ul class="alist yr-prs">${Y.prs.map(p => `<li><div><div class="ttl"><span>${esc(p.label)}</span></div>
      ${p.date || p.activity ? `<div class="meta">${esc([p.date && dShort(p.date), p.activity && trim(p.activity, 40)].filter(Boolean).join(" · "))}</div>` : ""}</div>
      <div class="r"><b>${esc(valText(p.value))}</b>${p.prev != null ? `<small>vorher ${esc(valText(p.prev))}</small>` : ""}</div></li>`).join("")}</ul></article>` : "";
  // Entwicklung: FTP, VO2max, Fitness – je eigenes Diagramm (keine zweite Achse)
  const cv = Y.curves, ftp = cv && obj(cv.ftp);
  const yC = cv && obj(cv.power) && Object.values(cv.power).some(v => powerPts(v).length);
  const hasDev = ftp || Y.vo2 || Y.ctl || yC || Y.rhr || Y.sleep;
  const devCard = hasDev ? `<article class="card" id="yrDev"><h3 class="chead">${IC.trend}Entwicklung</h3><p class="desc">FTP, VO2max und Fitness im Lauf des Jahres</p>
      <div class="yr-kpis sm">${[
        ftp && (isNum(ftp.start) || isNum(ftp.end)) ? tile("FTP", isNum(ftp.end) ? nf(ftp.end) : nf(ftp.start), "W", isNum(ftp.start) && isNum(ftp.end) ? `von ${nf(ftp.start)} W · <span class="${ftp.end >= ftp.start ? "delta-up" : "delta-down"}">${ftp.end >= ftp.start ? "▲" : "▼"} ${signedNf(ftp.end - ftp.start)}</span>` : "") : "",
        Y.rhr && (isNum(Y.rhr.avg) || isNum(Y.rhr.end)) ? tile("Ruhepuls Ø", nf(first(Y.rhr.avg, Y.rhr.end)), "bpm", isNum(Y.rhr.min) ? `Tiefstwert ${nf(Y.rhr.min)} bpm` : "") : "",
        Y.sleep ? (s => { const h = first(hoursOf(s), pick(s, "avg_h"), isNum(pick(s, "avg_min")) ? pick(s, "avg_min") / 60 : null); const sc = pick(s, "score", "avg_score");
          return isNum(h) ? tile("Schlaf Ø", hmS(h * 3600).replace(/ h$/, ""), h >= 1 ? "h" : "", isNum(sc) ? `Schlafwert ${nf(sc)}` : "") : isNum(sc) ? tile("Schlafwert Ø", nf(sc)) : ""; })(Y.sleep) : "",
      ].join("")}</div></article>` : "";
  const zonesCard = Y.zones.length ? (() => {
    const tot = sumA(Y.zones.map(z => isNum(z.hours) ? z.hours : 0)), mx = Math.max(...Y.zones.map(z => isNum(z.hours) ? z.hours : z.pct || 0));
    const ramp = ["var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)", "var(--q6)"];
    const col = i => ramp[Math.min(ramp.length - 1, Math.round(i * (ramp.length - 1) / Math.max(1, Y.zones.length - 1)))];
    return `<article class="card"><h3 class="chead">${IC.heart}Intensität</h3><p class="desc">Zeit in den Herzfrequenz-Zonen</p><ul class="yr-bars">${Y.zones.map((z, i) => {
      const v = isNum(z.hours) ? z.hours : z.pct, pct = isNum(z.pct) ? z.pct : tot ? z.hours / tot * 100 : null;
      return `<li><div class="yr-bl"><span>${esc(z.name)}</span><span class="num">${isNum(z.hours) ? `${nf(z.hours)} h ` : ""}<small>${pct != null ? nf(pct) + " %" : ""}</small></span></div><div class="yr-track"><div style="width:${Math.max(1, v / mx * 100)}%;background:${col(i)}"></div></div></li>`; }).join("")}</ul></article>`; })() : "";
  const vsCard = Y.vs.length ? `<article class="card"><h3 class="chead">${IC.grid}Vergleich zum Vorjahr</h3>${Y.computed ? `<p class="desc">Jeweils 1. Januar bis ${esc(fmtDate(Y.until).replace(/ \d{4}$/, ""))}</p>` : ""}
      <div class="tscroll yr-vs"><table><thead><tr><th>Kennzahl</th><th class="n">${Y.year}</th><th class="n">${Y.year - 1}</th><th class="n">Änderung</th></tr></thead><tbody>
      ${Y.vs.map(v => { const pct = isNum(v.pct) ? v.pct : isNum(v.cur) && isNum(v.prev) && v.prev ? (v.cur - v.prev) / v.prev * 100 : null; const good = pct == null ? null : (pct >= 0) === v.up;
        return `<tr><td>${esc(v.label)}</td><td class="n"><b>${isNum(v.cur) ? esc(v.fmt(v.cur)) : "–"}</b></td><td class="n">${isNum(v.prev) ? esc(v.fmt(v.prev)) : "–"}</td>
          <td class="n">${pct == null ? "–" : Math.abs(pct) < 0.5 ? "±0 %" : `<span class="${good ? "delta-up" : "delta-down"}">${pct > 0 ? "▲" : "▼"} ${signedNf(pct)} %</span>`}</td></tr>`; }).join("")}</tbody></table></div></article>` : "";
  const gf = Y.golf;
  const golfCard = gf && Object.keys(gf).length ? `<article class="card"><h3 class="chead">${IC.flag}Golf</h3><div class="yr-kpis sm">${[
      tile("Runden", isNum(pick(gf, "rounds", "count")) ? nf(pick(gf, "rounds", "count")) : null),
      tile("Beste Runde", isNum(pick(gf, "best", "best_score")) ? nf(pick(gf, "best", "best_score")) : null, "Schläge"),
      tile("Ø Schläge", isNum(pick(gf, "avg", "avg_score")) ? nf(pick(gf, "avg", "avg_score"), 1) : null),
      tile("Handicap", isNum(pick(gf, "handicap", "hcp")) ? nf(pick(gf, "handicap", "hcp"), 1) : null),
    ].join("")}</div></article>` : "";

  sec.innerHTML = `<h2>Jahresrückblick ${Y.year}</h2><p class="sub">${Y.complete ? "Dein Jahr im Sport" : "Dein Jahr im Sport – bisher"}</p>
    <div class="yr-grid">${hero}${monthsCard}<div class="stack">${hl}${sportsCard}${zonesCard}${vsCard}</div><div class="stack">${prCard}${devCard}${golfCard}</div></div>`;
  if (Y.months) monthChart($("yrMonths"), Y);
  sec.querySelectorAll(".yr-bars li[data-k]").forEach(li => {
    const b = Y.by.find(x => x.key === li.dataset.k); if (!b) return;
    const tip = e => showTip(e, sportName(b.key), [{ k: "Stunden", v: nf(b.hours, 1) + " h", color: (SP[b.key] || SP.other).color }, { k: "Anteil", v: nf(b.hours / totH * 100) + " %" },
      ...(isNum(b.count) ? [{ k: "Einheiten", v: nf(b.count) }] : []), ...(isNum(b.km) && b.km > 0 ? [{ k: "Distanz", v: kmFmt(b.km) + " km" }] : [])]);
    li.addEventListener("pointermove", tip); li.addEventListener("pointerleave", hideTip);
  });
  const dev = $("yrDev");
  if (dev) {
    if (yC) {
      const yy = Y.year, d = document.createElement("div"); d.className = "subchart";
      dev.appendChild(d);
      const S = [{ k: "year", n: String(yy), c: "var(--cmp3)" }, { k: "prev_year", n: String(yy - 1), c: "var(--cmp4)" }, { k: "all", n: "Gesamt", c: "var(--s1)" }].filter(s => powerPts(cv.power[s.k]).length).slice(0, 3);
      powerCard(d, cv, { series: S, title: "Leistungskurve", height: 180, desc: `<p class="desc">${S.map(s => s.n).join(" vs. ")} · beste Leistung je Dauer</p>` });
    }
    if (Y.vo2) devChart(dev, "VO2max", Y.vo2, "var(--s1)", v => nf(v), "ml/kg/min");
    if (Y.ctl) devChart(dev, "Fitness (CTL)", Y.ctl, "var(--s1)", v => nf(v), "");
    if (Y.rhr && (Y.rhr.pts || []).length >= 2) devChart(dev, "Ruhepuls", Y.rhr, "var(--s1)", v => nf(v), "bpm");
    const k = dev.querySelector(".yr-kpis"); if (k && !k.innerHTML.trim()) k.remove();
  }
}

// =====================================================================================
// Anmelden bei app.js
// =====================================================================================
const DET = {
  rennplanung: { name: "Rennplanung", sub: "", icon: IC.medal, render: renderRace, noRange: true, group: "hidden" },
  jahresrueckblick: { name: "Jahresrückblick", sub: "", icon: IC.trend, render: renderYear, noRange: true },
  strecken: { name: "Meine Garmin-Strecken", sub: "", icon: IC.pin, render: renderCourses, noRange: true, group: "hidden" },
};
function menuState() {
  const rp = RP(), Y = yearData();
  const dl = rp && daysLeft(rp);
  const r = { group: rp ? undefined : "hidden", sub: rp ? [rp.event, dl != null && dl >= 0 ? (dl === 0 ? "heute" : `noch ${nf(dl)} ${dl === 1 ? "Tag" : "Tage"}`) : ""].filter(Boolean).join(" · ") : "Erscheint bei einem Wettkampf-Ziel" };
  const y = { name: Y ? `Jahresrückblick ${Y.year}` : "Jahresrückblick", group: Y ? undefined : "hidden",
    sub: Y ? (Y.complete ? "Dein Jahr im Sport" : "Stunden, Sportarten, Bestwerte, Entwicklung") : "" };
  const cs = allCourses(), cSp = [...new Set(cs.map(c => c.sport))].filter(k => k !== "other").map(k => CS_SP[k][0]);
  const c = { group: cs.length ? undefined : "hidden", sub: cs.length ? `${nf(cs.length)} ${cs.length === 1 ? "Strecke" : "Strecken"}${cSp.length ? " · " + cSp.join(", ") : ""} · Höhenprofile` : "" };
  let changed = false;
  [[DET.rennplanung, r], [DET.jahresrueckblick, y], [DET.strecken, c]].forEach(([d, s]) => Object.keys(s).forEach(k => { if (d[k] !== s[k]) { d[k] = s[k]; changed = true; } }));
  return changed;
}
function init() {
  const host = $("mDetail");
  ["rennplanung", "jahresrueckblick", "strecken"].forEach(id => {
    if ($(id)) return;
    const s = document.createElement("section"); s.id = id; s.hidden = true; s.className = "pf-sec"; host.appendChild(s);
  });
  menuState();
  A.register({ id: "perf", details: DET, hooks: {
    progress: progressHook,
    today: () => { if (menuState()) A.refreshMenu(); todayHook(); },
    week: weekHook,
    day: dayHook,
  } });
}
// eigenes Stylesheet laden, dann anmelden (sonst kurz ungestylt)
const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "perf.css";
let started = false; const go = () => { if (!started) { started = true; init(); } };
css.onload = go; css.onerror = go; setTimeout(go, 1500);
document.head.appendChild(css);
})();
