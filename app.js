/* Garmin Dashboard – rendert window.GARMIN (von scripts/build_data.py) als SVG-Diagramme. */
(() => {
let G = window.GARMIN;
const NS = "http://www.w3.org/2000/svg";
const DAY = 86400000;

// ---------- Sportarten → 8 feste Gruppen (Farbe folgt der Gruppe, nie dem Rang) ----------
// Farben zentral in index.html (--sp-*): 6 Farbtöne, alle Paare validiert (hell & dunkel) + neutrales Grau für „Ballsport & Sonstiges“.
// Gleiche Zuordnung in perf.js (SPORTS). Symbol (ic) begleitet die Farbe in Legenden und Listen.
const GROUPS = [
  { key: "bike", name: "Radfahren", color: "var(--sp-bike)", ic: "bike" },
  { key: "run", name: "Laufen", color: "var(--sp-run)", ic: "run" },
  { key: "swim", name: "Schwimmen", color: "var(--sp-swim)", ic: "swim" },
  { key: "gym", name: "Kraft & Fitness", color: "var(--sp-gym)", ic: "gym" },
  { key: "golf", name: "Golf", color: "var(--sp-golf)", ic: "flag" },
  { key: "ski", name: "Ski", color: "var(--sp-ski)", ic: "ski" },
  { key: "other", name: "Ballsport & Sonstiges", color: "var(--sp-other)", ic: "pulse" },
];
const GROUP_OF = {
  golf: "golf",
  running: "run", treadmill_running: "run", virtual_run: "run", trail_running: "run",
  cycling: "bike", road_biking: "bike", virtual_ride: "bike", indoor_cycling: "bike", mountain_biking: "bike", gravel_cycling: "bike",
  resort_skiing_snowboarding_ws: "ski", resort_skiing: "ski", skate_skiing_ws: "ski", backcountry_skiing_snowboarding_ws: "ski", backcountry_skiing: "ski",
  strength_training: "gym", pilates: "gym", indoor_cardio: "gym", indoor_rowing: "gym", yoga: "gym", breathwork: "gym",
  lap_swimming: "swim", open_water_swimming: "swim",
};
const TYPE_DE = {
  golf: "Golf", tennis_v2: "Tennis", running: "Laufen", resort_skiing_snowboarding_ws: "Ski/Snowboard",
  strength_training: "Krafttraining", virtual_ride: "Virtuelles Radfahren", resort_skiing: "Skifahren",
  road_biking: "Rennrad", hiking: "Wandern", pilates: "Pilates", cycling: "Radfahren", indoor_cardio: "Indoor-Cardio",
  lap_swimming: "Schwimmbad", walking: "Gehen", indoor_rowing: "Rudergerät", skate_skiing_ws: "Skating (Langlauf)",
  indoor_cycling: "Indoor-Radfahren", other: "Sonstiges", volleyball: "Volleyball", backcountry_skiing_snowboarding_ws: "Skitour",
  transition_v2: "Wechsel", mountain_biking: "Mountainbike", multi_sport: "Multisport", yoga: "Yoga",
  open_water_swimming: "Freiwasser", paddelball: "Padel", treadmill_running: "Laufband", surfing_v2: "Surfen",
  virtual_run: "Virtueller Lauf", backcountry_skiing: "Skitour", breathwork: "Atemübung",
};
const groupOf = t => GROUP_OF[t] || "other";
const typeName = t => TYPE_DE[t] || t.replace(/_v2|_ws/g, "").replace(/_/g, " ");
const groupByKey = Object.fromEntries(GROUPS.map(g => [g.key, g]));
const BALL = /tennis|padel|paddel|volley|squash|badminton/;
const typeIc = a => BALL.test(a.type) ? "tennis" : a.type === "hiking" || a.type === "walking" ? "pulse" : (groupByKey[a.g] || groupByKey.other).ic;
// Sport-Symbol in der Sportfarbe (Identität nie nur über Farbe)
const spi = (k, ic) => { const g = groupByKey[k] || groupByKey.other; return `<span class="spi" style="--c:${g.color}" aria-hidden="true">${IC[ic || SPORT_IC[k] || g.ic] || IC.pulse}</span>`; };

// ---------- Formatierung ----------
// Tausender mit schmalem Leerzeichen („15 000“), einheitlich in Kacheln, Achsen und Tooltips
const nf = (v, d = 0) => v == null || isNaN(v) ? "–" : v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\./g, "\u202f");
const compact = v => Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + " Mio." : nf(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
// Zentrale Achsenformate: ganze Zahlen ohne „,0“, Tausender „15 000“, Stunden als h:mm
const axN = v => nf(v, Math.abs(v) < 1000 && Math.round(v) !== v ? (Math.round(v * 10) === v * 10 ? 1 : 2) : 0);
const axH = v => { const h = Math.floor(v + 1e-9), m = Math.round((v - h) * 60); return m ? `${h}:${String(m).padStart(2, "0")} h` : `${h} h`; };
const fH = axH;
// Singular/Plural: pl(1, "Tag", "Tage") → „1 Tag“
const pl = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
const hm = min => { if (min == null) return "–"; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}:${String(m).padStart(2, "0")} h` : `${m} min`; };
const clock = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.round(sec % 60); return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const t = s => Date.parse(s + "T00:00:00Z");
const MON_S = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
const fmtDate = ms => { const d = new Date(ms); return `${d.getUTCDate()}. ${MON_S[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fmtMonth = ms => { const d = new Date(ms); return `${MON_S[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dayShortDe = ms => { const d = new Date(ms); return `${WD[(d.getUTCDay() + 6) % 7]}., ${d.getUTCDate()}. ${MON_S[d.getUTCMonth()]}`; };  // „Di., 3. Nov.“
// ISO-Daten in Texten vom Backend (Hinweise, Begründungen …) deutsch anzeigen: „2026-11-03“ → „3. Nov. 2026“
const deIso = s => String(s ?? "").replace(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?\b/g, (m, y, mo, d, hh) =>
  +mo >= 1 && +mo <= 12 ? `${+d}. ${MON_S[+mo - 1]} ${y}${hh ? `, ${hh} Uhr` : ""}` : m);
const mean = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sum = a => a.reduce((s, x) => s + (x || 0), 0);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tx = s => esc(deIso(s));  // Text vom Backend: escapen + ISO-Daten eindeutschen

// ---------- Zeitraum ----------
let LAST, FIRST, years, RANGES;
function initRanges() {
  LAST = t(G.daily.date[G.daily.date.length - 1]);
  FIRST = Math.min(t(G.daily.date[0]), t(G.activities[0].date));
  years = [];
  for (let y = new Date(LAST).getUTCFullYear(); y >= new Date(FIRST).getUTCFullYear(); y--) years.push(y);
  RANGES = [
    { id: "4w", label: "4 Wochen", from: LAST - 27 * DAY, to: LAST },
    { id: "3m", label: "3 Monate", from: LAST - 90 * DAY, to: LAST },
    { id: "12m", label: "12 Monate", from: LAST - 365 * DAY, to: LAST },
    { id: "all", label: "Gesamt", from: FIRST, to: LAST },
    ...years.map(y => ({ id: String(y), label: String(y), from: Date.UTC(y, 0, 1), to: Math.min(Date.UTC(y, 11, 31), LAST) })),
  ];
}
initRanges();
const QS = new URLSearchParams(location.search);
let range = RANGES.find(r => r.id === QS.get("r")) || RANGES[1];  // Standard: 3 Monate
if (QS.get("theme")) document.documentElement.dataset.theme = QS.get("theme");
if (+QS.get("fs") > 0) document.documentElement.style.fontSize = 17 * +QS.get("fs") / 100 + "px";  // Test: Dynamic Type, z. B. ?fs=150
const inRange = ms => ms >= range.from && ms <= range.to;

// ---------- Tooltip ----------
const tip = document.getElementById("tip");
function showTip(e, title, rows) {
  tip.innerHTML = `<div class="t">${esc(title)}</div>` + rows.map(r =>
    `<div class="row"><span class="k">${r.color ? `<i style="background:${r.color}"></i>` : ""}${esc(r.k)}</span><b>${esc(r.v)}</b></div>`).join("");
  tip.style.display = "block";
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x, y;
  if (e.pointerType === "touch" || e.pointerType === "pen") {
    // Finger verdeckt sonst den Tooltip: oberhalb des Diagramms, mittig zum Finger – sonst klar über bzw. unter dem Finger
    const box = (e.target && e.target.closest && (e.target.closest(".chart") || e.target.closest("svg")) || e.target).getBoundingClientRect();
    x = e.clientX - w / 2;
    y = box.top - h - 8;
    if (y < 8) y = e.clientY - h - 56;
    if (y < 8) y = e.clientY + 56;
  } else {
    x = e.clientX + 14; y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  }
  x = Math.max(8, Math.min(x, innerWidth - w - 8)); y = Math.max(8, Math.min(y, innerHeight - h - 8));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.style.display = "none"; };
// Diagramm-Interaktion wie bei der Leistungskurve: Maus UND Finger – Fadenkreuz/Tooltip folgen beim Ziehen,
// vertikales Scrollen bleibt erhalten (touch-action: pan-y); Wischen zwischen Tabs ist in Diagrammen ohnehin aus.
function scrub(el, fn) {
  el.addEventListener("pointermove", fn);
  el.addEventListener("pointerdown", fn);
  if (el.style) el.style.touchAction = "pan-y";
}
// Touch bindet den Finger sonst an das zuerst berührte Element – in Diagrammen freigeben,
// damit beim Ziehen immer die Säule/der Punkt unter dem Finger reagiert (gilt auch für perf.js).
document.addEventListener("pointerdown", e => {
  const t = e.target;
  if (e.pointerType === "touch" && t && t.closest && t.closest("svg") && t.hasPointerCapture && t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
}, true);
function unscrub(el, fn) {
  el.addEventListener("pointerleave", fn);
  el.addEventListener("pointercancel", fn);
}
addEventListener("scroll", hideTip, { passive: true });  // iPhone: Tooltip bleibt nach Tippen sonst stehen

// ---------- SVG-Helfer ----------
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; min = min - 1; }
  const step0 = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
// Balken: 4px gerundetes Datenende, eckig an der Basislinie
function barPath(x, y, w, h, horizontal) {
  const r = Math.min(4, (horizontal ? h : w) / 2, horizontal ? w : h);
  if (h <= 0 || w <= 0) return "";
  if (horizontal) return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`;
  return `M${x},${y + h}v-${h - r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}
function legend(host, items, kind = "box") {
  if (items.length < 2) return;
  const d = document.createElement("div"); d.className = "legend";
  d.innerHTML = items.map(i => `<span>${i.ic && IC[i.ic] ? `<span class="spi" style="--c:${i.color}" aria-hidden="true">${IC[i.ic]}</span>` : `<i class="${kind === "line" ? "line" : ""}" style="background:${i.color}"></i>`}${esc(i.name)}</span>`).join("");
  host.appendChild(d);
}
function empty(host, msg = "Keine Daten im gewählten Zeitraum") {
  host.innerHTML = `<div class="empty">${msg}</div>`;
}
const timeTicks = (from, to, w) => {
  const span = (to - from) / DAY, maxTicks = Math.max(2, Math.floor(w / 80));
  const out = [];
  const d0 = new Date(from);
  if (span <= 70) {  // kurze Zeiträume: Wochenstriche (montags)
    const stepW = Math.max(1, Math.ceil(span / 7 / maxTicks));
    let x = from + ((8 - new Date(from).getUTCDay()) % 7) * DAY;
    for (; x <= to; x += stepW * 7 * DAY) { const d = new Date(x); out.push({ x, l: `${d.getUTCDate()}.${d.getUTCMonth() + 1}.` }); }
  } else if (span > 500) {
    const stepY = Math.max(1, Math.ceil(span / 365 / maxTicks));
    for (let y = d0.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= to; y += stepY) out.push({ x: Date.UTC(y, 0, 1), l: String(y) });
  } else {
    const stepM = Math.max(1, Math.ceil(span / 30.4 / maxTicks));
    for (let m = d0.getUTCMonth() + 1, y = d0.getUTCFullYear(); ; m += stepM) {
      const x = Date.UTC(y, m, 1); if (x > to) break;
      const d = new Date(x); out.push({ x, l: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS[d.getUTCMonth()] });
    }
  }
  return out;
};

// ---------- Liniendiagramm (eine Y-Achse, Fadenkreuz-Tooltip) ----------
// label: Titel für die Textzusammenfassung (aria-label) · weniger als 3 echte Messpunkte → Werte statt Diagramm
function lineChart(host, { series, height = 200, yFmt = axN, tipFmt, yZero = false, xFmt = fmtDate, dots = false, goal, connect = false,
  include = [], bands = [], zeroLine = false, endLabels = true, noLegend = false, endFmt, label = "", unit = "", minPts = 3, minSpan = 0, pointDots = false }) {
  host.innerHTML = "";
  series = series.filter(s => s.pts.length);
  if (!series.length) return empty(host);
  const vf = v => (endFmt || tipFmt || yFmt)(v);
  const real = series.flatMap(s => s.pts.filter(p => !p.carry));
  if (real.length < minPts && !series.some(s => s.pts.some(p => p.carry))) return fewValues(host, series, vf, xFmt, unit, label);
  if (!noLegend) legend(host, series, "line");
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const lab = (series.length === 1 || endLabels) && series.length <= 4;
  const keyed = lab && series.length > 1;  // mehrere Endwerte: kurzer Farbstrich als Schlüssel vor der Zahl
  const W = box.clientWidth || 500, H = height, m = { l: 40, r: bands.length ? 92 : lab ? (keyed ? 60 : 48) : 12, t: 8, b: 22 };
  const all = series.flatMap(s => s.pts);
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  if (x0 === x1) { x0 -= 15 * DAY; x1 += 15 * DAY; }
  let ys = all.map(p => p.y).concat(include); if (goal != null) ys.push(goal);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (yZero) y0 = Math.min(0, y0);
  // Mindestfenster (z. B. Ruhepuls ±5 bpm um den Mittelwert): kleine Schwankungen nicht dramatisieren
  const widened = !!minSpan && y1 - y0 < minSpan;
  if (widened) { const c = mean(all.map(p => p.y)); y0 = Math.min(y0, c - minSpan / 2); y1 = Math.max(y1, c + minSpan / 2); if (y1 - y0 < minSpan) { const d = minSpan - (y1 - y0); y0 -= d / 2; y1 += d / 2; } }
  const ticks = niceTicks(y0, y1, widened ? 3 : 4);
  y0 = ticks[0]; y1 = ticks[ticks.length - 1];
  const X = x => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = y => m.t + (1 - (y - y0) / (y1 - y0)) * (H - m.t - m.b);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" }, box);
  // Zonen (z. B. Form): leicht getönte Bänder, Grenzlinie als Haarlinie, Name am rechten Rand – nie über der Linie
  bands.forEach((b, i) => {
    const lo = Math.max(b.lo ?? -Infinity, y0), hi = Math.min(b.hi ?? Infinity, y1);
    if (hi <= lo) return;
    if (i % 2) el("rect", { x: m.l, y: Y(hi), width: W - m.l - m.r, height: Y(lo) - Y(hi), class: "bandfill" }, svg);
    // Grenze als gestrichelte Haarlinie bis unter den Namen → Name sitzt sichtbar in „seinem“ Band
    if (b.lo != null && b.lo > y0 && b.lo < y1) el("line", { x1: m.l, x2: W - 4, y1: Y(b.lo), y2: Y(b.lo), class: "bandline" }, svg);
    if (Y(lo) - Y(hi) >= 14) el("text", { x: W - m.r + 8, y: (Y(lo) + Y(hi)) / 2 + 4, class: "bandlabel" }, svg).textContent = b.label;
  });
  ticks.forEach(v => {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === y0 || (zeroLine && v === 0) ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = yFmt(v);
  });
  if (zeroLine && y0 < 0 && y1 > 0 && !ticks.includes(0)) el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--axis)", "stroke-width": 1 }, svg);
  timeTicks(x0, x1, W).forEach(tk => { el("text", { x: X(tk.x), y: H - 6, "text-anchor": "middle" }, svg).textContent = tk.l; });
  if (goal != null) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(goal), y2: Y(goal), stroke: "var(--text-muted)", "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
    el("text", { x: m.l + 4, y: Y(goal) - 5, class: "goallabel" }, svg).textContent = "Ziel " + yFmt(goal);
  }
  series.forEach(s => {
    const pts = s.pts.slice().sort((a, b) => a.x - b.x);
    const steps = pts.slice(1).map((p, i) => p.x - pts[i].x).sort((a, b) => a - b);
    const gap = Math.max((steps[Math.floor(steps.length / 2)] || DAY) * 3.5, 10 * DAY);
    let d = "";
    pts.forEach((p, i) => { d += (i && (connect || p.x - pts[i - 1].x <= gap) ? "L" : "M") + X(p.x).toFixed(1) + "," + Y(p.y).toFixed(1); });
    if (pointDots && !dots) {
      // Stufenlinie: gehaltener Wert (Übertrag bis zur nächsten Messung) gestrichelt, Messwerte/Sprünge durchgezogen
      let dS = "", dH = "";
      pts.forEach((p, i) => { if (!i) return; const a = pts[i - 1], seg = `M${X(a.x).toFixed(1)},${Y(a.y).toFixed(1)}L${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
        if (p.carry && a.y === p.y) dH += seg; else dS += seg; });
      if (dH) el("path", { d: dH, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": "2 4", "stroke-linecap": "round", opacity: .85 }, svg);
      if (dS) el("path", { d: dS, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    } else if (!dots) el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    if (dots || pointDots || (pts.length < 3 && !connect)) pts.forEach(p => !p.carry && el("circle", { cx: X(p.x), cy: Y(p.y), r: pointDots && !dots ? 3.5 : 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2 }, svg));
    s._pts = pts;
  });
  // Endwerte direkt beschriften (≤ 4 Serien): bei Kollision auseinanderschieben (mind. 14 px)
  const ends = series.map(s => ({ s, p: s._pts[s._pts.length - 1] }));
  ends.forEach(({ s, p }) => el("circle", { cx: X(p.x), cy: Y(p.y), r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2 }, svg));
  if (lab && !bands.length) {
    const L = ends.map(e => ({ ...e, y: Y(e.p.y) + 4 })).sort((a, b) => a.y - b.y);
    const gapY = 17;
    for (let k = 0; k < 6; k++) L.forEach((e, i) => { if (i && e.y - L[i - 1].y < gapY) { const mid = (e.y + L[i - 1].y) / 2; L[i - 1].y = mid - gapY / 2; e.y = mid + gapY / 2; } });
    const lo = m.t + 8, hi = H - m.b;
    // an den Rändern zurückschieben, ohne Abstand zu verlieren
    L.forEach((e, i) => { e.y = Math.max(lo + i * gapY, Math.min(hi - (L.length - 1 - i) * gapY, e.y)); });
    L.forEach((e, i) => { if (i && e.y - L[i - 1].y < 13) e.skip = true; });
    L.forEach(e => {
      if (e.skip) return;
      const x = X(e.p.x) + 8;
      if (keyed) el("line", { x1: x, x2: x + 9, y1: e.y - 4, y2: e.y - 4, stroke: e.s.color, "stroke-width": 2.5, "stroke-linecap": "round" }, svg);
      el("text", { x: keyed ? x + 13 : x, y: e.y, class: "endlabel" }, svg).textContent = (endFmt || yFmt)(e.p.y);
    });
  }
  svg.setAttribute("aria-label", chartSummary(label, series, vf, unit, x0, x1));
  // Hover-Ebene
  const xs = [...new Set(series.flatMap(s => s._pts.map(p => p.x)))].sort((a, b) => a - b);
  const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
  const marks = series.map(s => el("circle", { r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg));
  const hit = el("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }, svg);
  scrub(hit, e => {
    const r = svg.getBoundingClientRect(), mx = x0 + (e.clientX - r.left - m.l) / (W - m.l - m.r) * (x1 - x0);
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; xs[mid] < mx ? lo = mid : hi = mid; }
    const x = Math.abs(xs[lo] - mx) < Math.abs(xs[hi] - mx) ? xs[lo] : xs[hi];
    cross.setAttribute("x1", X(x)); cross.setAttribute("x2", X(x)); cross.setAttribute("visibility", "visible");
    const rows = [];
    series.forEach((s, i) => {
      const p = s._pts.find(p => p.x === x);
      if (p) { marks[i].setAttribute("cx", X(p.x)); marks[i].setAttribute("cy", Y(p.y)); marks[i].setAttribute("visibility", "visible"); rows.push({ k: s.name, v: (tipFmt || yFmt)(p.y, p), color: s.color }); }
      else marks[i].setAttribute("visibility", "hidden");
      if (p && p.extra) rows.push(...p.extra);
    });
    showTip(e, xFmt(x), rows);
  });
  unscrub(hit, () => { hideTip(); cross.setAttribute("visibility", "hidden"); marks.forEach(c => c.setAttribute("visibility", "hidden")); });
}
// Kurze Textzusammenfassung je Diagramm, z. B. „Ruhepuls, 5. Aug. 2026 bis 3. Nov. 2026: von 46 auf 44 bpm gefallen“
function chartSummary(label, series, vf, unit, x0, x1) {
  const u = unit ? " " + unit : "";
  const parts = series.map(s => {
    const P = (s._pts || s.pts).filter(p => !p.carry), a = P[0] || s.pts[0], b = P[P.length - 1] || s.pts[s.pts.length - 1];
    const word = b.y > a.y ? "gestiegen" : b.y < a.y ? "gefallen" : "unverändert";
    return `${series.length > 1 || !label ? s.name + " " : ""}von ${vf(a.y)} auf ${vf(b.y)}${u} ${word}`;
  });
  return `${label || series.map(s => s.name).join(" und ")}${x0 != null ? `, ${fmtDate(x0)} bis ${fmtDate(x1)}` : ""}: ${parts.join("; ")}`;
}
// Unter 3 Messpunkten: die Werte als Kennzahl statt eines fast leeren Diagramms
function fewValues(host, series, vf, xFmt, unit, label) {
  const rows = series.flatMap(s => s.pts.filter(p => !p.carry).slice(-2).map(p => ({ s, p })));
  host.innerHTML = `<div class="singles" role="group" aria-label="${esc(label || series.map(s => s.name).join(", "))}">${rows.map(({ s, p }) => `<div class="single">
    <div class="v">${esc(vf(p.y))}${unit ? `<small>${esc(unit)}</small>` : ""}</div><div class="l">${series.length > 1 ? `<i class="lkey" style="--c:${s.color}"></i>${esc(s.name)} · ` : ""}${esc(xFmt(p.x))}</div></div>`).join("")}
    <p class="note" style="font-size:13px;margin-top:6px">Für einen Verlauf braucht es mindestens 3 Messungen im Zeitraum.</p></div>`;
}

// ---------- Säulen über die Zeit (optional gestapelt) ----------
function columnChart(host, { buckets, keys, height = 240, yFmt = axN, tipFmt = yFmt, labelFmt = fmtMonth, goal, maxBw = 24, label = "" }) {
  host.innerHTML = "";
  if (!buckets.length || !buckets.some(b => keys.some(k => b.v[k.key]))) return empty(host);
  legend(host, keys);
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 600, H = height, m = { l: 40, r: 8, t: 8, b: 22 };
  const totals = buckets.map(b => sum(keys.map(k => b.v[k.key])));
  const ticks = niceTicks(0, Math.max(...totals, goal || 0));
  const y1 = ticks[ticks.length - 1];
  const band = (W - m.l - m.r) / buckets.length;
  const bw = Math.max(2, Math.min(maxBw, band - 2));
  const Y = y => m.t + (1 - y / y1) * (H - m.t - m.b);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" }, box);
  const top = totals.indexOf(Math.max(...totals));
  svg.setAttribute("aria-label", `${label || keys.map(k => k.name).join(", ")}: ${buckets.length} Zeitabschnitte, zusammen ${tipFmt(sum(totals))}, höchster Wert ${tipFmt(totals[top])} (${buckets[top].label || labelFmt(buckets[top].x)})${goal != null ? `, Ziel ${yFmt(goal)}` : ""}`);
  ticks.forEach(v => {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = yFmt(v);
  });
  const every = Math.ceil(buckets.length / Math.max(2, Math.floor(W / 70)));
  buckets.forEach((b, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    let base = 0;
    const segs = keys.filter(k => b.v[k.key] > 0);
    segs.forEach((k, j) => {
      const v = b.v[k.key], yTop = Y(base + v), yBot = Y(base);
      const gap = j > 0 ? 2 : 0, h = yBot - yTop - gap;
      if (h > 0.3) {
        if (j === segs.length - 1) el("path", { d: barPath(x, yTop, bw, h), fill: k.color }, svg);
        else el("rect", { x, y: yTop, width: bw, height: h, fill: k.color }, svg);
      }
      base += v;
    });
    if (i % every === 0) el("text", { x: cx, y: H - 6, "text-anchor": "middle" }, svg).textContent = b.short || labelFmt(b.x);
    const hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: H - m.t - m.b, fill: "transparent" }, svg);
    scrub(hit, e => {
      const rows = keys.filter(k => b.v[k.key]).map(k => ({ k: k.name, v: tipFmt(b.v[k.key]), color: k.color })).reverse();
      if (keys.length > 1) rows.push({ k: "Gesamt", v: tipFmt(totals[i]) });
      if (b.extra) rows.push(...b.extra);
      showTip(e, b.label || labelFmt(b.x), rows);
    });
    unscrub(hit, hideTip);
  });
  // Ziel über den Säulen: gestrichelte Linie mit Beschriftung am rechten Rand
  if (goal != null) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(goal), y2: Y(goal), stroke: "var(--text-secondary)", "stroke-width": 1, "stroke-dasharray": "4 3", "pointer-events": "none" }, svg);
    el("text", { x: W - m.r, y: Y(goal) - 5, "text-anchor": "end", class: "goallabel" }, svg).textContent = "Ziel " + yFmt(goal);
  }
}

// ---------- Horizontale Balken ----------
// Nur ein Eintrag → Kennzahl statt eines einzelnen Balkens
function hBars(host, { items, fmt = v => nf(v), color = "var(--s1)", tipRows, label = "" }) {
  host.innerHTML = "";
  items = items.filter(i => i.value > 0);
  if (!items.length) return empty(host);
  if (items.length === 1) { const it = items[0]; host.innerHTML = singleStat({ label: it.label, value: fmt(it.value), icon: it.ic, color: it.color }); return; }
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 400, rowH = 26, lab = 150, valW = 70;
  const H = items.length * rowH;
  const max = Math.max(...items.map(i => i.value)), barW = Math.min(W - lab - valW, 520);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label ? label + ": " : ""}${items.map(i => `${i.label} ${fmt(i.value)}`).join(", ")}` }, box);
  items.forEach((it, i) => {
    const y = i * rowH, bh = 14, w = barW * it.value / max;
    el("text", { x: 0, y: y + rowH / 2 + 4, style: "fill:var(--text-secondary)" }, svg).textContent = it.label;
    el("path", { d: barPath(lab, y + (rowH - bh) / 2, Math.max(w, 2), bh, true), fill: it.color || color }, svg);
    el("text", { x: lab + w + 6, y: y + rowH / 2 + 4, style: "fill:var(--text-primary)" }, svg).textContent = fmt(it.value);
    const hit = el("rect", { x: 0, y, width: W, height: rowH, fill: "transparent" }, svg);
    scrub(hit, e => showTip(e, it.label, tipRows ? tipRows(it) : [{ k: "Wert", v: fmt(it.value) }]));
    unscrub(hit, hideTip);
  });
}
const singleStat = ({ label, value, icon, color, foot }) => `<div class="single">${icon ? `<span class="spi" style="--c:${color || "var(--s1)"}">${IC[icon] || icon}</span>` : ""}<div><div class="v">${value}</div><div class="l">${esc(label)}</div></div>${foot ? `<div class="f">${foot}</div>` : ""}</div>`;

// ---------- Kalender-Heatmap (sequenziell, ein Farbton) ----------
function calendar(host, values, bins, binFmt) {
  host.innerHTML = "";
  const to = range.to, from = Math.max(range.from, to - 364 * DAY);
  const start = from - ((new Date(from).getUTCDay() + 6) % 7) * DAY;
  const weeks = Math.ceil((to - start + DAY) / (7 * DAY));
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 800, lab = 24;
  // volle Breite: Spalten strecken, Zeilenhöhe begrenzt (kurze Zeiträume sonst sehr hoch)
  const cellW = Math.max(6, (W - lab) / weeks - 2), stepX = cellW + 2;
  const cell = Math.max(6, Math.min(22, Math.floor(cellW))), step = cell + 2;
  const H = 18 + 7 * step + 50;
  const desc = host.parentElement && host.parentElement.querySelector(".desc");
  if (desc) desc.textContent = `Jeder Kasten ist ein Tag, ${fmtDate(from)} – ${fmtDate(to)} · kräftigere Farbe = mehr Schritte`;
  const vals = [...values].filter(([d]) => d >= from && d <= to).map(([, v]) => v);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Schritte pro Tag, ${fmtDate(from)} bis ${fmtDate(to)}: Ø ${nf(mean(vals))} Schritte an ${pl(vals.length, "Tag", "Tagen")}` }, box);
  const color = v => v == null ? "var(--q0)" : `var(--q${bins.findIndex(b => v < b) === -1 ? 6 : bins.findIndex(b => v < b) + 1})`;
  [0, 2, 4].forEach(d => { el("text", { x: 0, y: 18 + d * step + cell - 1 }, svg).textContent = WD[d]; });
  let lastM = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = start + (w * 7 + d) * DAY;
      if (day < from || day > to) continue;
      const v = values.get(day);
      const dt = new Date(day);
      if (d === 0 || day === from) {
        if (dt.getUTCMonth() !== lastM && dt.getUTCDate() <= 7) { el("text", { x: lab + w * stepX, y: 11 }, svg).textContent = MONTHS[dt.getUTCMonth()]; lastM = dt.getUTCMonth(); }
      }
      const r = el("rect", { x: lab + w * stepX, y: 18 + d * step, width: cellW, height: cell, rx: 3, fill: color(v) }, svg);
      scrub(r, e => showTip(e, `${WD[d]}, ${fmtDate(day)}`, [{ k: "Schritte", v: v == null ? "keine Daten" : nf(v) }]));
      unscrub(r, hideTip);
    }
  }
  // Skalenlegende
  const ly = 18 + 7 * step + 14;
  el("text", { x: lab, y: ly + 9 }, svg).textContent = "weniger";
  for (let i = 0; i <= bins.length; i++) {
    el("rect", { x: lab + 50 + i * 14, y: ly, width: 11, height: 11, rx: 2, fill: `var(--q${i + 1})` }, svg);
  }
  el("text", { x: lab + 50 + (bins.length + 1) * 14 + 4, y: ly + 9 }, svg).textContent = "mehr";
  el("text", { x: lab, y: ly + 27 }, svg).textContent = `Stufen: ${bins.map(binFmt).join(" · ")}`;
}

// ---------- Tabellen ----------
function table(tbl, cols, rows, sort = { i: 0, dir: -1 }) {
  const render = () => {
    const c = cols[sort.i];
    const sorted = rows.slice().sort((a, b) => {
      const va = c.sort ? c.sort(a) : c.v(a), vb = c.sort ? c.sort(b) : c.v(b);
      if (va == null) return 1; if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
    tbl.innerHTML = `<thead><tr>${cols.map((c, i) => `<th class="${c.n ? "n" : ""}" data-i="${i}">${c.h}${i === sort.i ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>` +
      `<tbody>${sorted.map(r => `<tr>${cols.map(c => `<td class="${c.n ? "n" : ""}">${c.html ? c.html(r) : esc(c.f ? c.f(c.v(r), r) : c.v(r) ?? "–")}</td>`).join("")}</tr>`).join("") ||
      `<tr><td colspan="${cols.length}" class="empty">Keine Einträge</td></tr>`}</tbody>`;
    tbl.querySelectorAll("th").forEach(th => th.onclick = () => {
      const i = +th.dataset.i; sort = { i, dir: sort.i === i ? -sort.dir : -1 }; render();
    });
  };
  render();
}

// ---------- Aggregation ----------
let daily = G.daily.date.map((d, i) => {
  const o = { x: t(d) };
  for (const k in G.daily) if (k !== "date") o[k] = G.daily[k][i];
  return o;
});
// Mehrtägige Einträge (z. B. Segeltörn) verzerren Trainingsstunden → dort nicht mitzählen
let acts = G.activities.map(a => ({ ...a, x: t(a.date), g: groupOf(a.type), multi: a.dur > 1440 }));
const trainMin = a => a.multi ? 0 : a.dur;
const bucketOf = (x, unit) => {
  const d = new Date(x);
  if (unit === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (unit === "day") return x;
  return x - ((d.getUTCDay() + 6) % 7) * DAY; // Montag der Woche
};
const nextBucket = (x, unit) => unit === "month" ? Date.UTC(new Date(x).getUTCFullYear(), new Date(x).getUTCMonth() + 1, 1) : x + (unit === "day" ? 1 : 7) * DAY;
const spanDays = () => (range.to - range.from) / DAY;
const unitFor = () => spanDays() > 200 ? "month" : spanDays() > 45 ? "week" : "day";
const bucketLabel = (x, unit) => unit === "month" ? fmtMonth(x) : unit === "day" ? `${WD[(new Date(x).getUTCDay() + 6) % 7]}, ${fmtDate(x)}` : "Woche ab " + fmtDate(x);
const bucketShort = (x, unit) => { const d = new Date(x); return unit === "month" ? (d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS[d.getUTCMonth()]) : `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`; };
function series(rows, key, { agg = mean, unit = unitFor() } = {}) {
  const map = new Map();
  rows.forEach(r => { if (r[key] == null || !inRange(r.x)) return; const b = bucketOf(r.x, unit); (map.get(b) || map.set(b, []).get(b)).push(r[key]); });
  return [...map].map(([x, v]) => ({ x, y: agg(v) })).sort((a, b) => a.x - b.x);
}
const unitLabel = () => ({ month: "Monatsmittel", week: "Wochenmittel", day: "Tageswerte" })[unitFor()];
const xLabel = () => { const u = unitFor(); return x => bucketLabel(x, u); };

// ---------- Renderer ----------
function tile(label, value, unit = "", foot = "") {
  return `<div class="card tile"><div class="label">${esc(label)}</div><div class="value">${value}<span class="unit">${esc(unit)}</span></div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;
}
function delta(cur, prev, upGood, fmt) {
  if (cur == null || prev == null) return "";
  const d = cur - prev; if (Math.abs(d) < 1e-9) return "unverändert zum Vorzeitraum";
  const good = (d > 0) === upGood;
  return `<span class="${good ? "delta-up" : "delta-down"}">${d > 0 ? "▲ +" : "▼ "}${fmt(d)}</span> zum Vorzeitraum`;
}

let ZC = G.zones && G.zones.current || null;
const curFtp = () => ZC && ZC.ftp != null ? ZC.ftp : G.profile.ftp;
const curLthr = () => ZC && ZC.lthr != null ? ZC.lthr : G.profile.lthr;
function renderHero() {
  const p = G.profile;
  const age = Math.floor((LAST - t(p.birthDate)) / (365.25 * DAY));
  const vo2 = (G.vo2.RUNNING || []).slice(-1)[0];
  const hero = document.getElementById("hero");
  hero.innerHTML = `
    <img src="${window.PHOTO || "profile.png"}" alt="Profilbild">
    <div>
      <h3>${esc(p.firstName)} ${esc(p.lastName)}</h3>
      <div class="meta">${age} Jahre · ${p.height ? nf(p.height) + " cm" : ""} · ${p.weight ? nf(p.weight, 1) + " kg" : ""} · BMI ${nf(p.bmi, 1)} · Garmin-Daten seit ${fmtMonth(FIRST)}</div>
    </div>
      <div class="chips">
        <span class="chip">Fitnessalter ${nf(p.fitnessAge, 1)} (tatsächlich ${age})</span>
        <span class="chip">Ruhepuls ${nf(p.rhr)} bpm</span>
        <span class="chip">VO2max Laufen ${vo2 ? nf(vo2.vo2MaxValue) : "–"}</span>
        <span class="chip">FTP ${nf(curFtp())} W</span>
        <span class="chip">Laktatschwelle ${nf(curLthr())} bpm</span>
        <span class="chip">${nf(G.activities.length)} Aktivitäten</span>
      </div>`;
  hero.querySelector("img").addEventListener("error", e => { e.target.style.display = "none"; hero.style.gridTemplateColumns = "1fr"; });
}

function renderOverview() {
  const len = range.to - range.from;
  const prevIn = x => x >= range.from - len - DAY && x < range.from;
  const A = acts.filter(a => inRange(a.x)), P = acts.filter(a => prevIn(a.x));
  const D = daily.filter(d => inRange(d.x)), DP = daily.filter(d => prevIn(d.x));
  const hours = sum(A.map(trainMin)) / 60, hoursP = sum(P.map(trainMin)) / 60;
  const DIST = new Set(["run", "bike", "swim"]), isDist = a => DIST.has(a.g) || a.type === "hiking" || a.type === "walking";
  const km = sum(A.filter(isDist).map(a => a.dist));
  const stepsAvg = mean(D.map(d => d.steps)), stepsP = mean(DP.map(d => d.steps));
  const showDelta = range.id !== "all" && P.length;
  document.getElementById("rangeLabel").textContent = `${range.label}: ${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  document.getElementById("overviewTiles").innerHTML = [
    tile("Aktivitäten", nf(A.length), "", showDelta ? delta(A.length, P.length, true, v => nf(v)) : ""),
    tile("Trainingszeit", nf(hours, 0), " h", showDelta ? delta(hours, hoursP, true, v => nf(v, 0) + " h") : ""),
    tile("Distanz", nf(km), " km", "Laufen, Rad, Schwimmen, Wandern"),
    tile("Kalorien Training", nf(sum(A.map(a => a.kcal))), " kcal"),
    tile("Höhenmeter", nf(sum(A.filter(isDist).map(a => a.elev))), " m", "ohne Ski (Lift)"),
    tile("Ø Schritte / Tag", nf(stepsAvg), "", showDelta && DP.length ? delta(stepsAvg, stepsP, true, v => nf(v)) : ""),
    tile("Schritte gesamt", compact(sum(D.map(d => d.steps))), ""),
    tile("Ø Ruhepuls", nf(mean(D.map(d => d.rhr))), " bpm"),
  ].join("");
  calendar(document.getElementById("calendar"), new Map(daily.filter(d => d.steps != null).map(d => [d.x, d.steps])), [3000, 6000, 9000, 12000, 16000], v => compact(v));
}

function renderActivities() {
  const A = acts.filter(a => inRange(a.x));
  // Trainingszeit je Woche/Monat: eine Komponente im Fortschritt (Link oben auf der Seite)

  // Stunden je Sportart (Einzeltyp, eingefärbt nach Gruppe)
  const byType = {};
  A.forEach(a => { const o = byType[a.type] ||= { label: typeName(a.type), value: 0, n: 0, km: 0, kcal: 0, color: groupByKey[a.g].color, ic: typeIc(a) }; o.value += trainMin(a) / 60; o.n++; o.km += a.dist || 0; o.kcal += a.kcal || 0; });
  const types = Object.values(byType).sort((a, b) => b.value - a.value);
  const host = document.getElementById("actBySport");
  hBars(host, { label: "Stunden nach Sportart", items: types.slice(0, 12), fmt: v => nf(v, 0) + " h", tipRows: it => [{ k: "Dauer", v: hm(it.value * 60) }, { k: "Aktivitäten", v: nf(it.n) }, { k: "Distanz", v: nf(it.km, 0) + " km" }, { k: "Kalorien", v: nf(it.kcal) + " kcal" }] });
  if (types.length) { const lg = document.createElement("div"); legend(lg, GROUPS.filter(g => types.slice(0, 12).some(t => t.color === g.color))); host.prepend(...lg.childNodes); }
  hBars(document.getElementById("distBySport"), {
    items: Object.values(byType).filter(t => t.km > 5 && !/Golf|Tennis|Ski|Padel|Volley|Surfen/.test(t.label)).sort((a, b) => b.km - a.km).map(t => ({ ...t, value: t.km })),
    label: "Distanz nach Sportart", fmt: v => nf(v, 0) + " km", tipRows: it => [{ k: "Distanz", v: nf(it.km, 1) + " km" }, { k: "Aktivitäten", v: nf(it.n) }, { k: "Ø pro Aktivität", v: nf(it.km / it.n, 1) + " km" }],
  });
  // Wochentage
  const wd = WD.map(l => ({ label: l, value: 0, h: 0 }));
  A.forEach(a => { const i = (new Date(a.x).getUTCDay() + 6) % 7; wd[i].value++; wd[i].h += trainMin(a) / 60; });
  hBars(document.getElementById("actWeekday"), { label: "Aktivitäten je Wochentag", items: wd, fmt: v => nf(v), tipRows: it => [{ k: "Aktivitäten", v: nf(it.value) }, { k: "Stunden", v: nf(it.h, 0) + " h" }] });
  // HF-Zonen (geordnet → Ordinal-Rampe)
  const z = [0, 0, 0, 0, 0]; A.forEach(a => a.zones && a.zones.forEach((v, i) => z[i] += v));
  hBars(document.getElementById("actZones"), {
    label: "Zeit in Herzfrequenz-Zonen", items: z.map((v, i) => ({ label: `Zone ${i + 1}`, value: v, color: `var(--q${i + 2})` })),
    fmt: v => hm(v), tipRows: it => [{ k: "Zeit", v: hm(it.value) }, { k: "Anteil", v: nf(100 * it.value / sum(z), 0) + " %" }],
  });
  renderActTable();
}

const pace = a => a.speed == null || !a.dist ? null : a.g === "run" || a.type === "hiking" || a.type === "walking" ? clock(3600 / a.speed) + " /km" : a.g === "swim" ? clock(360 / a.speed) + " /100m" : nf(a.speed, 1) + " km/h";
const rpeTxt = a => [a.rpe != null ? `Anstrengung ${a.rpe}/10` : "", a.feel ? `Gefühl: ${a.feel}` : ""].filter(Boolean).join(" · ");
let actShown = 60;
function renderActTable() {
  const q = document.getElementById("actSearch").value.toLowerCase();
  const ty = document.getElementById("actType").value;
  const rows = acts.filter(a => inRange(a.x) && (!ty || a.g === ty) && (!q || `${a.name} ${a.loc} ${typeName(a.type)} ${a.feel || ""}`.toLowerCase().includes(q)));
  const hasRpe = acts.some(a => a.rpe != null || a.feel);
  document.getElementById("actDesc").textContent = `${pl(rows.length, "Eintrag", "Einträge")} · neueste zuerst` + (hasRpe ? " · Anstrengung/Gefühl aus Garmin Connect" : "");
  // iPhone: kompakte Liste
  const sorted = rows.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  document.getElementById("actList").innerHTML = sorted.slice(0, actShown).map(a => `<li>
      <div class="ttl">${spi(a.g, typeIc(a))}<span>${esc(a.name)}</span></div>
      <div class="r">${hm(a.dur)}${a.dist ? `<small>${nf(a.dist, 1)} km</small>` : ""}</div>
      <div class="meta">${fmtDate(a.x)}, ${a.time} · ${esc(typeName(a.type))}${a.hr ? ` · Ø ${nf(a.hr)} bpm` : ""}${rpeTxt(a) ? `<br><span class="sec">${esc(rpeTxt(a))}</span>` : ""}</div></li>`).join("") ||
    `<li><div class="empty">Keine Einträge</div></li>`;
  const more = document.getElementById("actMore");
  more.hidden = sorted.length <= actShown;
  more.textContent = `Weitere anzeigen (${nf(sorted.length - actShown)})`;
  // Desktop: sortierbare Tabelle
  table(document.getElementById("actTable"), [
    { h: "Datum", v: a => a.date + " " + a.time, f: (v, a) => `${fmtDate(a.x)}, ${a.time}` },
    { h: "Name", html: a => `${spi(a.g, typeIc(a))}${esc(a.name)}`, v: a => a.name },
    { h: "Sportart", v: a => typeName(a.type) },
    { h: "Dauer", n: 1, v: a => a.dur, f: hm },
    { h: "Distanz", n: 1, v: a => a.dist || null, f: v => v == null ? "–" : nf(v, 2) + " km" },
    { h: "Ø Tempo", n: 1, v: a => a.speed, f: (v, a) => pace(a) || "–" },
    { h: "Höhe", n: 1, v: a => a.elev, f: v => v == null ? "–" : nf(v) + " m" },
    { h: "Ø HF", n: 1, v: a => a.hr, f: v => v == null ? "–" : nf(v) },
    { h: "Max HF", n: 1, v: a => a.maxHr, f: v => v == null ? "–" : nf(v) },
    { h: "kcal", n: 1, v: a => a.kcal, f: v => nf(v) },
    { h: "Aerob TE", n: 1, v: a => a.te, f: v => v == null ? "–" : nf(v, 1) },
    { h: "Belastung", n: 1, v: a => a.load, f: v => v == null ? "–" : nf(v) },
    ...(hasRpe ? [{ h: "RPE", n: 1, v: a => a.rpe ?? null, f: v => v == null ? "–" : v + "/10" }, { h: "Gefühl", v: a => a.feel || null, f: v => v ?? "–" }] : []),
    { h: "Ort", v: a => a.loc },
  ], rows);
}

function renderHealth() {
  const D = daily.filter(d => inRange(d.x));
  document.getElementById("healthSub").textContent = `Täglich gemessene Werte · Diagramme zeigen ${unitLabel()}`;
  const goalDays = D.filter(d => d.steps != null && d.stepGoal && d.steps >= d.stepGoal).length, stepDays = D.filter(d => d.steps != null).length;
  const minRhr = D.filter(d => d.rhr).sort((a, b) => a.rhr - b.rhr)[0];
  document.getElementById("healthTiles").innerHTML = [
    tile("Ø Ruhepuls", nf(mean(D.map(d => d.rhr))), " bpm", minRhr ? `Tiefstwert ${minRhr.rhr} am ${fmtDate(minRhr.x)}` : ""),
    tile("Ø Stress", nf(mean(D.map(d => d.stress))), "", "0–25 Ruhe · 26–50 niedrig · 51–75 mittel"),
    tile("Ø Body Battery max", nf(mean(D.map(d => d.bbHigh))), ""),
    tile("Schrittziel erreicht", stepDays ? nf(100 * goalDays / stepDays) : "–", " %", `${nf(goalDays)} von ${pl(stepDays, "Tag", "Tagen")}`),
    tile("Ø Etagen / Tag", nf(mean(D.map(d => d.floors))), ""),
    tile("Ø Schritte / Tag", nf(mean(D.map(d => d.steps))), "", "Ziel meist 10 000"),
    tile("Ø Atemfrequenz", nf(mean(D.map(d => d.resp)), 1), " /min", "im Wachzustand"),
    tile("Ø Kalorien / Tag", nf(mean(D.map(d => d.kcal))), " kcal", `davon aktiv ${nf(mean(D.map(d => d.activeKcal)))}`),
  ].join("");
  const xf = xLabel();
  lineChart(document.getElementById("stepsChart"), { series: [{ name: "Schritte", color: "var(--s1)", pts: series(daily, "steps") }], tipFmt: v => nf(v), yZero: true, xFmt: xf, goal: 10000, label: "Schritte pro Tag", endFmt: v => nf(v) });
  lineChart(document.getElementById("stressChart"), { series: [{ name: "Stress", color: "var(--s1)", pts: series(daily, "stress") }], tipFmt: v => nf(v, 1), endFmt: v => nf(v), yZero: true, xFmt: xf, label: "Stress" });
  lineChart(document.getElementById("bbChart"), {
    series: [{ name: "Höchstwert", color: "var(--s1)", pts: series(daily, "bbHigh") }, { name: "Tiefstwert", color: "var(--neutral)", pts: series(daily, "bbLow") }],
    tipFmt: v => nf(v, 0), endFmt: v => nf(v), yZero: true, xFmt: xf, label: "Body Battery",
  });
  // Intensitätsminuten immer pro Woche summiert
  const imMap = new Map();
  D.forEach(d => { const b = bucketOf(d.x, "week"); imMap.set(b, (imMap.get(b) || 0) + (d.im || 0)); });
  const im = [...imMap].sort((a, b) => a[0] - b[0]).map(([x, v]) => ({ x, v: { im: v }, label: "Woche ab " + fmtDate(x), short: `${new Date(x).getUTCDate()}.${new Date(x).getUTCMonth() + 1}.` }));
  if (im.length > 60) { // bei langen Zeiträumen: Monatsmittel der Wochensumme
    const mm = new Map(); im.forEach(w => { const b = bucketOf(w.x, "month"); (mm.get(b) || mm.set(b, []).get(b)).push(w.v.im); });
    columnChart(document.getElementById("imChart"), { buckets: [...mm].map(([x, v]) => ({ x, v: { im: mean(v) }, short: new Date(x).getUTCMonth() === 0 ? String(new Date(x).getUTCFullYear()) : MONTHS[new Date(x).getUTCMonth()] })), keys: [{ key: "im", name: "Ø Minuten pro Woche", color: "var(--s1)" }], tipFmt: v => nf(v) + " min", goal: 150, maxBw: 14, label: "Intensitätsminuten, Monatsmittel pro Woche" });
  } else {
    columnChart(document.getElementById("imChart"), { buckets: im, keys: [{ key: "im", name: "Minuten", color: "var(--s1)" }], tipFmt: v => nf(v) + " min", goal: 150, maxBw: 14, label: "Intensitätsminuten pro Woche" });
  }
  const w = G.weights.map(x => ({ x: t(x.date), y: x.kg })).filter(p => inRange(p.x));
  lineChart(document.getElementById("weightChart"), { series: [{ name: "Gewicht", color: "var(--s1)", pts: w }], yFmt: axN, tipFmt: v => nf(v, 1) + " kg", endFmt: v => nf(v, 1), dots: true, label: "Gewicht", unit: "kg" });
  if (!w.length && G.weights.length) empty(document.getElementById("weightChart"), `Kein Eintrag im Zeitraum · letzter Wert ${nf(G.weights.at(-1).kg, 1)} kg am ${fmtDate(t(G.weights.at(-1).date))}`);
  const acc = document.getElementById("hAcclim") || Object.assign(document.createElement("div"), { id: "hAcclim" });
  if (!acc.isConnected) document.querySelector("#gesundheit .grid").after(acc);
  acc.innerHTML = acclimCard("hAcclimCard");  // Randinfo Hitze/Höhe (nur mit Werten)
}

function renderSleep() {
  const S = daily.filter(d => inRange(d.x) && d.sDeep != null);
  const tot = d => d.sDeep + d.sLight + d.sRem;
  document.getElementById("sleepSub").textContent = `${pl(S.length, "Nacht", "Nächte")} erfasst · Diagramme zeigen ${unitLabel()}`;
  const best = S.filter(d => d.sScore).sort((a, b) => b.sScore - a.sScore)[0];
  document.getElementById("sleepTiles").innerHTML = [
    tile("Ø Schlafdauer", S.length ? hm(mean(S.map(tot)) * 60) : "–", ""),
    tile("Ø Schlafwert", nf(mean(S.map(d => d.sScore))), "", best ? `Bester: ${best.sScore} am ${fmtDate(best.x)}` : ""),
    tile("Ø Tiefschlaf", S.length ? hm(mean(S.map(d => d.sDeep)) * 60) : "–", ""),
    tile("Ø REM", S.length ? hm(mean(S.map(d => d.sRem)) * 60) : "–", ""),
    tile("Ø Leichtschlaf", S.length ? hm(mean(S.map(d => d.sLight)) * 60) : "–", ""),
    tile("Ø Wach", S.length ? hm(mean(S.map(d => d.sAwake)) * 60) : "–", ""),
    tile("Nächte ≥ 7 h", S.length ? nf(100 * S.filter(d => tot(d) >= 7).length / S.length) : "–", " %"),
    tile("Ø Schlafstress", nf(mean(S.map(d => d.sStress))), ""),
  ].join("");
  const unit = unitFor(), map = new Map();
  S.forEach(d => { const b = bucketOf(d.x, unit); (map.get(b) || map.set(b, []).get(b)).push(d); });
  const keys = [
    { key: "deep", name: "Tief", color: "var(--sl-deep)" },  // ein Farbton, abgestuft (validiert) · Wach neutral
    { key: "rem", name: "REM", color: "var(--sl-rem)" },
    { key: "light", name: "Leicht", color: "var(--sl-light)" },
    { key: "awake", name: "Wach", color: "var(--sl-awake)" },
  ];
  const buckets = [...map].sort((a, b) => a[0] - b[0]).map(([x, ds]) => ({
    x, label: bucketLabel(x, unit), short: bucketShort(x, unit),
    v: { deep: mean(ds.map(d => d.sDeep)), rem: mean(ds.map(d => d.sRem)), light: mean(ds.map(d => d.sLight)), awake: mean(ds.map(d => d.sAwake)) },
    extra: [{ k: "Nächte", v: nf(ds.length) }],
  }));
  columnChart(document.getElementById("sleepStages"), { buckets, keys, yFmt: axH, tipFmt: v => hm(v * 60), label: "Schlafphasen pro Nacht" });
  lineChart(document.getElementById("sleepScore"), { series: [{ name: "Schlafwert", color: "var(--s1)", pts: series(daily, "sScore") }], tipFmt: v => nf(v, 0), endFmt: v => nf(v), xFmt: xLabel(), label: "Schlafwert" });
}

const STATUS_DE = {
  PRODUCTIVE: "Produktiv", MAINTAINING: "Erhaltend", RECOVERY: "Erholung", DETRAINING: "Leistungsabbau", UNPRODUCTIVE: "Unproduktiv",
  PEAKING: "Höchstform", OVERREACHING: "Überlastung", NO_STATUS: "Kein Status", STRAINED: "Angespannt",
};
const STATUS_COLOR = { PRODUCTIVE: "var(--good)", PEAKING: "var(--good)", MAINTAINING: "var(--q3)", RECOVERY: "var(--q3)", DETRAINING: "var(--warning)", UNPRODUCTIVE: "var(--serious)", STRAINED: "var(--serious)", OVERREACHING: "var(--critical)" };

const PR_DE = { "Most Steps in a Day": "Meiste Schritte (Tag)", "Most Steps in a Week": "Meiste Schritte (Woche)", "Most Steps in a Month": "Meiste Schritte (Monat)", "Current Goal Streak": "Aktuelle Ziel-Serie", "Longest Goal Streak": "Längste Ziel-Serie", "Best 1km Run": "Schnellster 1 km", "Best 1mile Run": "Schnellste Meile", "Best 5km Run": "Schnellste 5 km", "Best 10km Run": "Schnellste 10 km", "Farthest Run": "Längster Lauf", "Farthest Cycle": "Längste Radfahrt", "Best 40km Cycle": "Schnellste 40 km Rad", "Max Elevation Gain": "Meiste Höhenmeter", "Max Avg Power (20 min)": "Beste 20-min-Leistung", "Longest Pool Swim": "Längstes Schwimmen", "Max Rep Weight (Barbell Squat)": "Max. Gewicht Kniebeuge", "Max Rep Weight (Barbell Deadlift)": "Max. Gewicht Kreuzheben" };
function renderPerformance() {
  const run = [...(G.vo2.null || []), ...(G.vo2.RUNNING || [])].map(v => ({ x: t(v.date), y: v.vo2MaxValue })).sort((a, b) => a.x - b.x);
  const bike = (G.vo2.CYCLING || []).map(v => ({ x: t(v.date), y: v.vo2MaxValue }));
  const R = G.race.at(-1), cyc = G.cycling.at(-1), st = G.trainingStatus.at(-1), ac = G.acute.at(-1);
  document.getElementById("perfTiles").innerHTML = [
    tile("VO2max Laufen", run.length ? nf(run.at(-1).y) : "–", "", run.length ? `Höchstwert ${nf(Math.max(...run.map(p => p.y)))}` : ""),
    tile("VO2max Rad", bike.length ? nf(bike.at(-1).y) : "–", ""),
    tile("Prognose 5 km", R ? clock(R.raceTime5K) : "–", ""),
    tile("Prognose 10 km", R ? clock(R.raceTime10K) : "–", ""),
    tile("Prognose Halbmarathon", R ? clock(R.raceTimeHalf) : "–", ""),
    tile("Prognose Marathon", R ? clock(R.raceTimeMarathon) : "–", ""),
    tile("Trainingsstatus", st ? `<span class="status"><i style="background:${STATUS_COLOR[st.trainingStatus] || "var(--text-muted)"}"></i>${STATUS_DE[st.trainingStatus] || st.trainingStatus}</span>` : "–", "", st ? `Stand ${fmtDate(t(st.date))}` : ""),
    tile("Rad-Profil", cyc ? cyc.profileType.charAt(0) + cyc.profileType.slice(1).toLowerCase() : "–", "", cyc ? `Ausdauer ${cyc.aerobicEndurance} · Kapazität ${cyc.aerobicCapacity} · Anaerob ${cyc.anaerobicCapacity}` : ""),
  ].join("");
  // VO2max und Belastung: Hauptdiagramme im Fortschritt (Link oben)
  // Einzelne Export-Ausreißer (unplausibel schnelle Prognosen) verwerfen
  const r10all = G.race.filter(r => r.raceTime10K).map(r => ({ x: t(r.date), y: r.raceTime10K / 60 }));
  const r10med = r10all.map(p => p.y).sort((a, b) => a - b)[r10all.length >> 1];
  const r10 = r10all.filter(p => inRange(p.x) && p.y > r10med * 0.75);
  // unter 3 Werten im Zeitraum: kein eigenes Diagramm – der Wert steht schon in der Kachel „Prognose 10 km“
  const c10 = document.getElementById("race10"), few10 = r10.length < 3;
  c10.closest(".card").hidden = few10;
  c10.closest(".grid").classList.toggle("g2", !few10);
  if (!few10) lineChart(c10, { series: [{ name: "10 km", color: "var(--s1)", pts: r10 }], yFmt: v => clock(v * 60), tipFmt: v => clock(v * 60), label: "Prognose 10 km", unit: "min" });
  const counts = {};
  G.trainingStatus.filter(s => inRange(t(s.date))).forEach(s => counts[s.trainingStatus] = (counts[s.trainingStatus] || 0) + 1);
  const host = document.getElementById("statusBars");
  hBars(host, { label: "Trainingsstatus, Tage je Status", items: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: STATUS_DE[k] || k, value: v, color: STATUS_COLOR[k] || "var(--s1)" })), fmt: v => pl(v, "Tag", "Tage") });
  // Bestleistungen
  const prFmt = p => {
    const tp = p.type;
    if (/Steps/.test(tp)) return nf(p.value) + " Schritte";
    if (/Streak/.test(tp)) return pl(p.value, "Tag", "Tage");
    if (/Farthest|Longest/.test(tp)) return /Swim/.test(tp) ? nf(p.value) + " m" : nf(p.value / 1000, 2) + " km";
    if (/Elevation/.test(tp)) return nf(p.value) + " m";
    if (/Weight/.test(tp)) return nf(p.value / 1000) + " kg";
    if (/Power/.test(tp)) return nf(p.value) + " W";
    return clock(p.value);
  };
  table(document.getElementById("prTable"), [
    { h: "Rekord", v: p => PR_DE[p.type] || p.type.replace("Best ", "Schnellste ").replace("Pool Swim", "Schwimmen") },
    { h: "Wert", n: 1, v: p => p.value, f: (v, p) => prFmt(p) },
    { h: "Datum", n: 1, v: p => p.date, f: v => fmtDate(t(v)) },
  ], G.prs, { i: 2, dir: -1 });
}

function renderGolf() {
  let all = G.golf.filter(g => inRange(t(g.date))), note = "";
  if (!all.length && G.golf.length) {  // keine Runden im Zeitraum → automatisch das letzte Jahr mit Runden
    const y = G.golf.map(g => g.date).sort().at(-1).slice(0, 4);
    all = G.golf.filter(g => g.date.startsWith(y));
    note = `Im gewählten Zeitraum keine Runde – gezeigt: ${y}`;
  }
  document.querySelector("#golf > .sub").textContent = note || "Runden mit mindestens 9 gespielten Löchern";
  const r18 = all.filter(g => g.holes >= 18);
  const best = r18.slice().sort((a, b) => a.strokes - b.strokes)[0];
  const hcp = G.golf.filter(g => g.hcp != null).at(-1);
  document.getElementById("golfTiles").innerHTML = [
    tile("Runden", nf(all.length), "", `${nf(r18.length)} × 18 Loch · ${nf(all.length - r18.length)} × 9 Loch`),
    tile("Beste 18-Loch-Runde", best ? nf(best.strokes) : "–", " Schläge", best ? `${esc(best.course)} · ${fmtDate(t(best.date))}` : ""),
    tile("Ø Schläge (18 Loch)", nf(mean(r18.map(g => g.strokes)), 1), ""),
    tile("Fairway-Treffer", nf(mean(all.map(g => g.fairways))), " %"),
    tile("Plätze", nf(new Set(all.map(g => g.course)).size), ""),
    tile("Handicap (zuletzt)", hcp ? nf(hcp.hcp) : "–", "", hcp ? `Stand ${fmtDate(t(hcp.date))}` : ""),
  ].join("");
  lineChart(document.getElementById("golfChart"), {
    series: [{ name: "Schläge", color: "var(--s1)", pts: r18.map(g => ({ x: t(g.date), y: g.strokes, extra: [{ k: "Platz", v: g.course }, { k: "Über Par", v: g.overPar == null ? "–" : (g.overPar > 0 ? "+" : "") + g.overPar }] })) }],
    dots: true, label: "Schläge je 18-Loch-Runde", unit: "Schläge", xFmt: fmtDate,
  });
  table(document.getElementById("golfTable"), [
    { h: "Datum", v: g => g.date, f: v => fmtDate(t(v)) },
    { h: "Platz", v: g => g.course },
    { h: "Löcher", n: 1, v: g => g.holes },
    { h: "Schläge", n: 1, v: g => g.strokes },
    { h: "Fairways", n: 1, v: g => g.fairways, f: v => v == null ? "–" : v + " %" },
  ], all);
}

function renderProfile() {
  const p = G.profile;
  const kv = [
    ["Geburtsdatum", fmtDate(t(p.birthDate))], ["Größe", p.height ? nf(p.height) + " cm" : "–"], ["Gewicht", p.weight ? nf(p.weight, 1) + " kg" : "–"],
    ["BMI", nf(p.bmi, 1)], ["Fitnessalter", nf(p.fitnessAge, 1) + " Jahre"], ["Ruhepuls", nf(p.rhr) + " bpm"],
    ["Max. Herzfrequenz", p.hrZones[0] ? nf(p.hrZones[0].maxHeartRateUsed) + " bpm" : "–"],
    ["Laktatschwelle", nf(curLthr()) + " bpm"], ["FTP (Rad)", nf(curFtp()) + " W"],
    ["FTP je kg", curFtp() && p.weight ? nf(curFtp() / p.weight, 2) + " W/kg" : "–"],
  ];
  document.getElementById("kv").innerHTML = kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const z = p.hrZones.find(z => z.sport === "DEFAULT") || p.hrZones[0];
  if (z) {
    document.getElementById("hrzDesc").textContent = `Basis: max. HF ${z.maxHeartRateUsed} bpm`;
    const fl = [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor, z.maxHeartRateUsed];
    const names = ["Aufwärmen", "Leicht", "Aerob", "Schwelle", "Maximum"];
    document.getElementById("hrz").innerHTML = names.map((n, i) => `<span>Z${i + 1} ${n}</span><div class="bar" style="width:${100 * fl[i + 1] / fl[5]}%;background:var(--q${i + 2})"></div><span style="font-variant-numeric:tabular-nums">${fl[i]}–${fl[i + 1]}</span>`).join("");
  }
  renderZones();
  const DEV = { "010-02890-21": "Edge-Radcomputer", "S10-02159-25": "Garmin-Uhr" };
  document.getElementById("gear").innerHTML = `<dl class="kv">` +
    G.gear.map(g => `<dt>${g.type === "Shoes" ? "Schuhe" : g.type === "Bike" ? "Fahrrad" : esc(g.type)}</dt><dd>${esc(g.name)} <span style="color:var(--text-muted);font-weight:400">${g.status === "active" ? "aktiv" : "ausgemustert"} · seit ${fmtDate(t(g.since))}</span></dd>`).join("") +
    p.devices.map(d => `<dt>Gerät</dt><dd>${DEV[d.partNumber] || d.partNumber} <span style="color:var(--text-muted);font-weight:400">registriert ${esc(isNaN(Date.parse(d.registrationDate)) ? deIso(d.registrationDate) : fmtDate(Date.UTC(new Date(Date.parse(d.registrationDate)).getFullYear(), new Date(Date.parse(d.registrationDate)).getMonth(), new Date(Date.parse(d.registrationDate)).getDate())))}</span></dd>`).join("") + `</dl>`;
  document.getElementById("footer").textContent = `Quelle: Garmin-Connect-Datenexport · Daten bis ${fmtDate(LAST)} · aufbereitet am ${deIso(G.generated)}`;
}

function dayline(host, C, R) {
  host.innerHTML = "";
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 800, H = 92, m = { l: 8, r: 8 }, h0 = 6, h1 = 22;
  const X = hhmm => { const [h, mm] = hhmm.split(":").map(Number); return m.l + (Math.min(Math.max(h + mm / 60, h0), h1) - h0) / (h1 - h0) * (W - m.l - m.r); };
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Tagesablauf: ${[...(C.busy || []).map(b => `${b.label || "Termin"} ${b.start}–${b.end}`), R.start ? `Training ${R.start}–${R.end}` : ""].filter(Boolean).join(", ") || "keine Termine"}` }, box);
  for (let h = h0; h <= h1; h += 2) {
    el("line", { x1: X(h + ":00"), x2: X(h + ":00"), y1: 18, y2: 62, stroke: "var(--grid)" }, svg);
    el("text", { x: X(h + ":00"), y: 78, "text-anchor": "middle" }, svg).textContent = String(h).padStart(2, "0") + ":00";
  }
  const block = (s, e, y, hgt, fill, title, rows) => {
    const x = X(s), w = Math.max(2, X(e) - x);
    const r = el("rect", { x, y, width: w, height: hgt, rx: 4, fill }, svg);
    scrub(r, ev => showTip(ev, title, rows || [{ k: "Zeit", v: `${s}–${e}` }]));
    unscrub(r, hideTip);
    return { x, w };
  };
  (C.free || []).forEach(([s, e]) => block(s, e, 22, 36, "var(--q0)", "Frei", [{ k: "Zeit", v: `${s}–${e}` }]));
  (C.busy || []).forEach(b => block(b.start, b.end, 22, 36, b.kind === "work" ? "var(--axis)" : "var(--text-muted)", b.label));
  if (R.start) {
    const p = block(R.start, R.end, 26, 28, "var(--s1)", R.title, [{ k: "Zeit", v: `${R.start}–${R.end}` }, { k: "Dauer", v: R.duration + " min" }]);
    // Beschriftung am Block, aber nie über den Rand: messen, einrücken, notfalls kürzen
    const lab = el("text", { x: p.x, y: 12, class: "endlabel" }, svg), full = `${R.start} ${R.title}`, room = W - m.l - m.r;
    lab.textContent = full;
    let len = lab.getComputedTextLength ? lab.getComputedTextLength() : 0;
    for (let n = full.length - 1; len > room && n > 8; n--) { lab.textContent = full.slice(0, n).trimEnd() + "…"; len = lab.getComputedTextLength(); }
    lab.setAttribute("x", Math.max(m.l, Math.min(p.x, W - m.r - len)));
  }
  const lg = document.createElement("div"); host.prepend(lg);
  legend(lg, [{ name: "Training", color: "var(--s1)" }, { name: "Arbeit (inkl. Weg)", color: "var(--axis)" }, { name: "Termin", color: "var(--text-muted)" }, { name: "Frei", color: "var(--q0)" }]);
}


// ---------- Symbole (Linien-Icons, keine externen Dateien) ----------
const svgI = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IC = {
  info: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  warning: svgI('<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
  critical: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>'),
  clock: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  timer: svgI('<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 2h6"/>'),
  pin: svgI('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  sun: svgI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  home: svgI('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'),
  cloud: svgI('<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z"/>'),
  pen: svgI('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  list: svgI('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  heart: svgI('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  moon: svgI('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  bolt: svgI('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
  flag: svgI('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  user: svgI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  grid: svgI('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  chev: svgI('<path d="M9 5l7 7-7 7"/>'),
  watch: svgI('<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 9.5V12l1.5 1"/>'),
  trend: svgI('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  pulse: svgI('<path d="M3 12h4l3-7 4 14 3-7h4"/>'),
  up: svgI('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  check: svgI('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  face: svgI('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16a3.5 3.5 0 0 0 5 0"/>'),
  key: svgI('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
  run: svgI('<circle cx="15" cy="4.5" r="2"/><path d="M5 12l3.5-3.5 4.5 1 2.5 4 3.5 1"/><path d="M13 9.5l-2.5 6 3.5 2.5V22"/><path d="M10.5 15.5L8 20H4"/>'),
  bike: svgI('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2.5 7H6M13.5 5.5H16l-1 3.5"/>'),
  swim: svgI('<path d="M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M3 20.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><circle cx="17" cy="8" r="2"/><path d="M5.5 13.5l4.5-4.5 3.5 3 1.5-1"/>'),
  gym: svgI('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  tennis: svgI('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>'),
  ski: svgI('<path d="M3 20l6-10 4 6 2-3 6 7z"/>'),
  target: svgI('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  medal: svgI('<circle cx="12" cy="15" r="5.5"/><path d="M8.5 3.5l2.5 6.2M15.5 3.5L13 9.7M12 12.8v4.4"/>'),
  balance: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9"/>'),
  plus: svgI('<path d="M12 5v14M5 12h14"/>'),
  missed: svgI('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
};
const SPORT_IC = { run: "run", bike: "bike", swim: "swim", gym: "gym", golf: "flag", tennis: "tennis", ski: "ski", other: "pulse" };
const sportIcon = sp => IC[SPORT_IC[sp] || "pulse"];
// Zahlen groß, Einheiten klein: 1 h 10 min
const durHtml = min => { if (min == null) return "–"; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}:${String(m).padStart(2, "0")}<small>h</small>` : `${m}<small>min</small>`; };  // „1:30 h“
const WDL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const MONTHS_L = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const wdi = ms => (new Date(ms).getUTCDay() + 6) % 7;
const relDay = (iso, ref) => { const d = (ref - t(iso)) / DAY; return d === 0 ? "Heute" : d === 1 ? "Gestern" : dayShortDe(t(iso)); };

// ---------- Heute ----------
// Intensität: ordinale Abstufung eines Farbtons (--lv1…--lv5, validiert hell & dunkel) – Textlabel bleibt; Ruhetag neutral
const LEVEL = {
  rest: { name: "Ruhetag", color: "var(--lv0)" }, done: { name: "Training geschafft", color: "var(--good)" }, easy: { name: "Locker", color: "var(--lv1)" },
  long: { name: "Lang & locker", color: "var(--lv2)" }, moderate: { name: "Mittel", color: "var(--lv3)" },
  hard: { name: "Intensiv", color: "var(--lv4)" }, race: { name: "Wettkampf", color: "var(--lv5)" },
};
const badge = lv => `<span class="badge"><i style="background:${(LEVEL[lv] || LEVEL.easy).color}"></i>${(LEVEL[lv] || LEVEL.easy).name}</span>`;
const lvTag = lv => { const L = LEVEL[lv] || LEVEL.easy; return `<span class="tag lv" style="--c:${L.color}"><i></i>${L.name}</span>`; };

// ---------- Fitness & Form (GARMIN.fitness: date, load, ctl, atl, tsb) ----------
const fitOf = G => G.fitness && G.fitness.date && G.fitness.date.length ? G.fitness.date.map((d, i) => ({
  x: t(d), load: G.fitness.load[i], ctl: G.fitness.ctl[i], atl: G.fitness.atl[i], tsb: G.fitness.tsb[i],
})) : [];
let FIT = fitOf(G);
const FORM_ZONES = [
  { hi: null, lo: 5, w: "frisch", c: "var(--q4)", ic: "up", d: "Ausgeruht – gut für Wettkampf oder einen harten Tag." },
  { hi: 5, lo: -10, w: "ausgeglichen", c: "var(--good)", ic: "check", d: "Belastung und Erholung halten sich die Waage." },
  { hi: -10, lo: -30, w: "im Training", c: "var(--warning)", ic: "bolt", d: "Du baust Fitness auf – Erholung im Blick behalten." },
  { hi: -30, lo: null, w: "überlastet", c: "var(--critical)", ic: "warning", d: "Deutlich mehr Belastung als gewohnt – Ruhetage einplanen." },
];
const formZone = v => v > 5 ? FORM_ZONES[0] : v >= -10 ? FORM_ZONES[1] : v >= -30 ? FORM_ZONES[2] : FORM_ZONES[3];
const signed = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(Math.abs(v), d);
const fitNf = v => nf(v, Math.abs(v) < 10 ? 1 : 0);
const SPORT = { run: "Laufen", bike: "Radfahren", swim: "Schwimmen", gym: "Kraft", golf: "Golf", tennis: "Tennis", ski: "Ski", other: "Sonstiges" };
const meterColor = v => v >= 75 ? "var(--good)" : v >= 55 ? "var(--q4)" : v >= 35 ? "var(--warning)" : "var(--critical)";
const readyWord = v => v >= 75 ? "Gut erholt" : v >= 55 ? "Ordentlich erholt" : v >= 35 ? "Eher müde" : "Erholung nötig";
const ALERT = {
  info: { name: "Hinweis", color: "var(--q4)", icon: IC.info },
  warning: { name: "Achtung", color: "var(--warning)", icon: IC.warning },
  critical: { name: "Wichtig", color: "var(--critical)", icon: IC.critical },
};
const isOutdoor = (place, title) => /draußen|outdoor|freibad|freiwasser|see\b/i.test(`${place || ""} ${title || ""}`) && !/rolle|zwift|laufband|halle/i.test(title || "");
function placeFact(place, title) {
  if (!place) return "";
  return isOutdoor(place, title) ? fact(IC.sun, "Draußen") : fact(IC.home, place === "drinnen" ? "Drinnen" : `${esc(place)} · drinnen`, true);
}
const fact = (icon, text, raw) => text ? `<span class="fact">${icon}${raw ? text : esc(text)}</span>` : "";
const shortWeather = w => {
  if (!w) return "";
  const parts = String(w).split(",").map(x => x.trim());
  const temp = parts[0].replace(/\s*\(gefühlt[^)]*\)/, "");
  const rain = parts.find(x => /^Regen/.test(x));
  return [temp, rain && rain.replace(/\s*\([^)]*\)/, "")].filter(Boolean).join(" · ");
};

// Ausgeblendete Hinweise/Mitteilungen (nur auf diesem Gerät, 60 Tage gemerkt)
const DISMISS_KEY = "garvis.dismissed";
const dismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}"); } catch (e) { return {}; } };
function dismiss(ids) {
  const d = dismissed(), now = Date.now();
  [].concat(ids).forEach(id => { d[id] = now; });
  Object.keys(d).forEach(k => { if (now - d[k] > 60 * DAY) delete d[k]; });
  localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
}
const keyOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return "a" + (h >>> 0).toString(36); };
function alertCard(level, title, text, extra = "") {
  const A = ALERT[level] || ALERT.info;
  const k = keyOf(`${level}|${title}|${text}`);
  if (dismissed()[k]) return "";
  return `<div class="card alert" role="${level === "info" ? "status" : "alert"}" style="--c:${A.color}" data-k="${k}">
    <button type="button" class="x" aria-label="Hinweis ausblenden" data-dismiss="${k}">✕</button>
    <span class="aic">${A.icon}</span>
    <div><span class="lvl">${A.name}</span><b>${tx(title)}</b>${text ? `<p>${tx(text)}</p>` : ""}${extra}</div></div>`;
}
function renderAlerts(T) {
  const out = [];
  const ill = T && T.illness;
  if (ill && (ill.risk === "possible" || ill.risk === "likely")) {
    const likely = ill.risk === "likely";
    out.push({ lv: likely ? "critical" : "warning", html: alertCard(likely ? "critical" : "warning",
      likely ? "Wahrscheinlich krank – heute kein Training" : "Mögliche Erkrankung – heute nur locker oder Pause",
      `Krankheits-Score ${ill.score ?? "–"}/100. Bei Fieber, Halsschmerzen oder Abgeschlagenheit: pausieren statt durchziehen.`,
      ((ill.signals || []).length ? `<ul>${ill.signals.map(s => `<li><span>${tx(s.name)}</span><span>${tx(s.value)}</span>${s.note ? `<small>${tx(s.note)}</small>` : ""}</li>`).join("")}</ul>` : "")
      + `<button type="button" class="txtbtn" data-ac="adj" data-step="sick" style="margin-top:10px">Krank melden</button>`) });  // actions.js: Blatt „Passt heute nicht?“ › Krank
  }
  // Plan von gestern: der Banner sagt schon „Uhr nicht synchronisiert“ → doppelten Hinweis weglassen
  const dupSync = a => planStale() && /synchronisiert|nicht aktuell/i.test(a.title || "");
  ((T && T.alerts) || []).filter(a => !dupSync(a)).forEach(a => out.push({ lv: a.level, html: alertCard(a.level, a.title, a.text) }));
  if (T && T.readiness && T.readiness.stale > 1 && !planStale() && !(T.alerts || []).some(a => /synchronisiert/.test(a.title || "")))
    out.push({ lv: "info", html: alertCard("info", "Garmin-Daten nicht aktuell", `Neueste Daten vom ${dayShortDe(t(T.readiness.dataDate))} – Uhr mit Garmin Connect synchronisieren, damit der Plan stimmt.`) });
  const rank = { critical: 0, warning: 1, info: 2 };
  const host = document.getElementById("hAlerts");
  host.innerHTML = staleBanner(T) + out.sort((a, b) => (rank[a.lv] ?? 3) - (rank[b.lv] ?? 3)).map(o => o.html).join("");
  host.hidden = !host.innerHTML.trim();
  if (!host.dataset.bound) {
    host.dataset.bound = "1";
    host.addEventListener("click", async e => {
      const f = e.target.closest("[data-fetch-now]");
      if (f) {  // Plan von gestern → Garmin-Abruf in der Cloud anstoßen (45-s-Bündelung in dispatchReplan)
        if (f.disabled) return;
        f.disabled = true; f.textContent = "Wird abgerufen …";
        const ok = await fetchGarmin({ manual: true });
        if (!ok) toast("Abruf gerade nicht möglich – Garvis prüft stündlich selbst", IC.clock);
        f.textContent = "Erneut abrufen"; setTimeout(() => { if (f.isConnected) f.disabled = false; }, 45000);
        return;
      }
      const b = e.target.closest("[data-dismiss]"); if (!b) return;
      dismiss(b.dataset.dismiss);
      const c = b.closest(".alert"); if (c) c.remove();
      host.hidden = !host.querySelector(".alert");
    });
  }
  renderBell();
}
// ---------- Mitteilungen (Glocke): nur in der App, jede einzeln entfernbar ----------
function inboxItems() {
  const T = window.TODAY, d = dismissed(), out = ((T && T.notifications) || []).slice();
  const left = tokenDaysLeft(), x = tokenExp();
  if (left != null && left <= 7) out.unshift({ id: `tokenexp-${x.date}-${left <= 1 ? "1" : "7"}`, title: left < 0 ? "GitHub-Schlüssel ist abgelaufen" : left === 0 ? "GitHub-Schlüssel läuft heute ab" : `GitHub-Schlüssel läuft in ${left === 1 ? "1 Tag" : left + " Tagen"} ab`,
    body: `Ablaufdatum ${dayShortDe(t(x.date))}. Auf github.com › Settings › Fine-grained tokens einen neuen Schlüssel erzeugen (Contents: Read and write für garvis-data, Actions: Read and write für garvis) und unter Mehr › GitHub-Schlüssel › „Neu eingeben“ eintragen.`, date: localIso() });
  return out.filter(n => !d[n.id]);
}
function renderBell() {
  const n = inboxItems().length, b = document.getElementById("bellN"), btn = document.getElementById("bell");
  if (!b || !btn) return;
  b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
  btn.setAttribute("aria-label", n ? `Mitteilungen (${n} neu)` : "Mitteilungen");
}
function renderInbox() {
  const list = document.getElementById("inboxList"), items = inboxItems();
  list.innerHTML = items.length ? items.map(n => `<div class="note-it"><b>${tx(n.title)}</b>
      <button type="button" class="x" aria-label="Mitteilung entfernen" data-id="${esc(n.id)}">✕</button>
      ${n.body ? `<p>${tx(n.body)}</p>` : ""}${n.date ? `<small>${dayShortDe(t(n.date))}</small>` : ""}</div>`).join("")
    : `<p class="muted" style="margin:24px 4px">Keine neuen Mitteilungen.</p>`;
  document.getElementById("inboxAll").hidden = !items.length;
}
(() => {
  const box = document.getElementById("inbox"), bell = document.getElementById("bell");
  if (!box || !bell) return;
  const close = () => { box.hidden = true; bell.focus(); };
  bell.addEventListener("click", () => { renderInbox(); box.hidden = false; document.getElementById("inboxClose").focus(); });
  document.getElementById("inboxClose").addEventListener("click", close);
  box.addEventListener("click", e => { if (e.target === box) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) close(); });
  document.getElementById("inboxList").addEventListener("click", e => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    dismiss(b.dataset.id); renderInbox(); renderBell();
  });
  document.getElementById("inboxAll").addEventListener("click", () => { dismiss(inboxItems().map(n => n.id)); renderInbox(); renderBell(); });
})();

// Ablauf als Intensitätsprofil: Höhe = Intensität (geordnet → eine Farbrampe), Breite = Minuten
const INT = [
  { name: "locker", color: "var(--lv1)" }, { name: "mittel", color: "var(--lv3)" },  // gleiche Rampe wie die Intensität (validiert)
  { name: "zügig", color: "var(--lv4)" }, { name: "hart", color: "var(--lv5)" },
];
const stepLevel = s => {
  const x = `${s.label} ${s.target || ""}`.toLowerCase();
  if (/intervall|vo2|sprint|maximal|zone 5|\bz5\b|steigerung|all.?out/.test(x)) return 3;
  if (/schwelle|tempo|zügig|sweet.?spot|zone 4|\bz4\b|wettkampf|1[6-9]\d.?bpm/.test(x)) return 2;
  if (/einlauf|auslauf|einfahr|ausfahr|aufwärm|abwärm|ausschwimm|einschwimm|locker|erholung|pause|lockern|dehnen|mobil|cool|warm/.test(x)) return 0;
  return 1;
};
function workoutProfile(host, steps) {
  host.innerHTML = "";
  const total = sum(steps.map(s => s.min));
  if (!total) return;
  const used = [...new Set(steps.map(stepLevel))].sort();
  legend(host, used.map(i => INT[i]));
  const box = document.createElement("div"); box.className = "chart"; host.appendChild(box);
  const W = box.clientWidth || 340, H = 96, m = { l: 2, r: 2, t: 6, b: 20 }, ph = H - m.t - m.b;
  const X = v => m.l + v / total * (W - m.l - m.r);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Ablauf: " + steps.map(s => `${s.min} min ${s.label}`).join(", ") }, box);
  el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: "var(--axis)", "stroke-width": 1 }, svg);
  let acc = 0;
  steps.forEach(s => {
    const lv = stepLevel(s), h = ph * (lv + 1) / 4;
    const x = X(acc) + (acc ? 1 : 0), w = X(acc + s.min) - X(acc) - (acc ? 2 : 0) - (acc + s.min < total ? 1 : 0);  // 2px Fläche zwischen Blöcken
    el("path", { d: barPath(x, H - m.b - h, Math.max(w, 2), h), fill: INT[lv].color }, svg);
    const hit = el("rect", { x: X(acc), y: m.t, width: X(acc + s.min) - X(acc), height: ph, fill: "transparent" }, svg);
    scrub(hit, e => showTip(e, s.label, [{ k: "Dauer", v: s.min + " min" }, { k: "Intensität", v: INT[lv].name, color: INT[lv].color }, ...(s.target ? [{ k: "Ziel", v: s.target }] : [])]));
    unscrub(hit, hideTip);
    acc += s.min;
  });
  const step = total > 75 ? 30 : total > 30 ? 15 : 10;
  for (let v = 0; v <= total; v += step) {
    const anchor = v === 0 ? "start" : (X(v) > W - 16 ? "end" : "middle");
    el("text", { x: X(v), y: H - 5, "text-anchor": anchor }, svg).textContent = v + "′";
  }
}

// Zwift-Workout (Rolleneinheiten) und Hinweis auf das automatisch angelegte Garmin-Workout
// zc = eigenes Garvis-Workout in Zwift ({name, path, synced}) – vorrangig; das eingebaute bleibt als Alternative
function zwiftBox(z, full = true, zc = null) {
  const own = zc && (zc.name || zc.path) ? `<div class="zw">${IC.bike}<span><span class="zl">In Zwift</span> ${esc(zc.path || "")}${zc.path && zc.name ? " · " : ""}<b>${esc(zc.name || "")}</b>${zc.synced === false ? ` <span class="muted">· noch nicht übertragen</span>` : ""}</span></div>` : "";
  if (!z || !z.zwift_path && !z.name || own && !full) return own;
  const head = `<span class="zl">${own ? "Alternativ" : "In Zwift"}</span> ${esc(z.zwift_path || z.name)}${z.duration_min ? ` · ${z.duration_min} min` : ""}`;
  if (!full || !(z.structure || z.why)) return own + `<div class="zw">${IC.bike}<span>${head}</span></div>`;
  return own + `<details class="zw zwd"><summary>${IC.bike}<span>${head}</span></summary>
    ${z.structure ? `<p>${esc(z.structure)}</p>` : ""}${z.why ? `<p class="muted">${esc(z.why)}</p>` : ""}</details>`;
}
const watchNote = R => R.workout && /^(run|bike|swim)$/.test(R.workout.sport || R.sport || "")
  ? `<div class="zw">${IC.watch}<span>Workout liegt in Garmin Connect – auf deiner Uhr unter <b>Training › Trainingskalender</b></span></div>` : "";
const fitem = (icon, label, value, isNum) => value ? `<div class="fitem">${icon}<div><div class="fl">${label}</div><div class="fv${isNum ? " num" : ""}">${value}</div></div></div>` : "";
function renderPlan(T) {
  const host = document.getElementById("hPlan");
  if (!T || !T.recommendation) {
    host.innerHTML = `<div class="kicker">Training heute</div><div class="plan-title" style="margin:10px 0">Noch kein Plan</div>
      <p class="note">Die Empfehlung entsteht beim nächsten Garmin-Abgleich. Bis dahin: nach Gefühl locker bewegen.</p>`;
    return;
  }
  const R = T.recommendation, done = R.level === "done", rest = R.level === "rest" || done;
  const DA = R.done_activity;
  const loc = T.location;
  const out = isOutdoor(R.place, R.title);
  const place = R.place ? (out ? "Draußen" : R.place === "drinnen" ? "Drinnen" : esc(R.place)) : "";
  host.innerHTML = `
    <div class="plan-head"><span class="sic">${done ? IC.check : rest ? IC.moon : sportIcon(R.sport)}</span><div class="plan-title">${esc(R.title)}</div></div>
    <div class="tags">${lvTag(R.level)}${R.sport && SPORT[R.sport] ? `<span class="tag">${SPORT[R.sport]}</span>` : ""}${R.place && !rest ? `<span class="tag">${out ? "Draußen" : "Drinnen"}</span>` : ""}${R.provisional ? `<span class="tag">Vorläufig</span>` : ""}</div>
    ${done ? `<p class="note" style="margin-top:0">Stark – ${DA ? `<b>${esc(DA.name)}</b>${DA.time ? ` um ${esc(DA.time)}` : ""}${DA.duration ? ` · ${DA.duration} min` : ""}${DA.rpe ? ` · Anstrengung ${DA.rpe}/10` : ""}` : "dein Training ist erledigt"}. Rest des Tages: Erholung, essen, trinken, gut schlafen.</p>`
      : rest ? `<p class="note" style="margin-top:0">Heute keine Einheit – Erholung ist Teil des Trainings. Spazieren, Dehnen oder Mobility sind okay.</p>` : `
    <div class="fgrid">
      ${fitem(IC.timer, "Dauer", R.duration ? durHtml(R.duration) : "", true)}
      ${fitem(IC.clock, "Uhrzeit", R.start ? `${R.start}<small>–</small>${R.end}` : "", true)}
      ${fitem(out ? IC.sun : IC.home, "Ort", place)}
      ${fitem(IC.cloud, "Wetter", R.weather ? esc(shortWeather(R.weather)) : "")}
      ${loc && loc.travel ? fitem(IC.pin, "Unterwegs", esc(loc.name)) : ""}
    </div>`}
    ${rest ? "" : zwiftBox(R.zwift, true, R.zwift_custom) + watchNote(R)}
    ${(R.steps || []).length ? `<div class="wprof" id="hProfile"></div>
      <details class="more"><summary>Ablauf <span class="n">· ${pl(R.steps.length, "Abschnitt", "Abschnitte")}</span></summary>
      <ol class="steps">${R.steps.map(s => `<li><span class="min">${s.min}′</span><div><div class="lab">${esc(s.label)}</div>${s.target ? `<div class="tgt">${esc(s.target)}</div>` : ""}</div></li>`).join("")}</ol></details>` : ""}
    <details class="more"><summary>Warum heute das?</summary>
      <ul class="why">${(R.why || []).map(w => `<li>${tx(w)}</li>`).join("")}</ul>
      ${R.weather ? `<p class="note">Wetter: ${esc(R.weather)}</p>` : ""}
      ${R.slot ? `<p class="note">Freies Fenster laut Kalender: ${R.slot[0]}–${R.slot[1]} Uhr</p>` : ""}
      ${loc ? `<p class="note">Ort: ${esc(loc.name)} (${esc(loc.source)})${(loc.equipment || []).length ? ` · verfügbar: ${loc.equipment.map(esc).join(", ")}` : ""}</p>` : ""}
    </details>
    ${R.alternative ? `<p class="note" style="margin-top:12px">Wenig Zeit oder Lust? <b style="color:var(--text-primary);font-weight:600">${esc(R.alternative.title)}</b> (${R.alternative.duration} min)</p>` : ""}
    ${otherLoadHint(T)}`;
  if ((R.steps || []).length) workoutProfile(document.getElementById("hProfile"), R.steps);
  extHook("plan", host, T);  // Zusatzmodule (z. B. strength.js: Übungsliste)
}

function formRow() {
  const f = FIT.at(-1);
  if (!f || f.tsb == null) return "";
  const z = formZone(f.tsb);
  return `<a class="formrow" href="#fortschritt" style="--c:${z.c}"><span class="fic">${IC[z.ic]}</span>
    <span><b>Form ${signed(f.tsb)}</b> · ${z.w}<br><span class="sec">Fitness ${fitNf(f.ctl)} · Ermüdung ${fitNf(f.atl)}</span></span><svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></a>`;
}
function renderReady(T) {
  const host = document.getElementById("hReady");
  const rd = T && T.readiness;
  let score = rd ? rd.score : null, src = rd ? rd.source : "Garmin-Trainingsbereitschaft";
  if (score == null) { const last = daily.filter(d => d.readiness != null).at(-1); score = last ? last.readiness : null; if (last) src += ` · ${fmtDate(last.x)}`; }
  host.hidden = score == null && !FIT.length;
  if (score == null) { host.innerHTML = `<div class="kicker">Erholung</div>${formRow()}`; return; }
  const factors = (rd && rd.factors) || [];
  // Keine frischen Uhrdaten (stale > 1 Tag) oder nur angenommener Wert → zurückhaltend darstellen, nicht wie ein Messwert
  const assumed = !!rd && rd.score != null && !factors.length && /neutral|keine aktuellen/i.test(rd.source || "");
  const stale = !!rd && rd.score != null && (assumed || rd.stale > 1);
  const ddIso = rd && rd.dataDate && isIsoDay(String(rd.dataDate).slice(0, 10)) ? String(rd.dataDate).slice(0, 10) : null;
  if (stale && ddIso) src = `${assumed ? "Neutral angenommen" : src} · Uhrdaten vom ${dayShortDe(t(ddIso))}`;
  host.classList.toggle("stale", stale);
  const c = stale ? "var(--text-muted)" : meterColor(score), ill = T && T.illness;
  const wk = T && T.recommendation && T.recommendation.week;
  host.innerHTML = `
    <div class="kicker">Erholung</div>
    <div class="ready" style="margin-top:8px">
      <div class="hero-v">${nf(score)}<small>/100</small></div>
      <div><div class="word"><span class="sdot" style="--c:${c}"></span>${assumed ? "Ohne aktuelle Daten" : readyWord(score)}</div><div class="src">${esc(src)}</div></div>
    </div>
    <div class="meter" style="--mc:${c};margin-top:12px"><div style="width:${Math.max(0, Math.min(100, score))}%"></div></div>
    ${formRow()}
    ${factors.length || ill || wk ? `<details class="more"><summary>Einflussfaktoren <span class="n">· ${factors.length}</span></summary>
      ${factors.map(f => `<div class="factor"><span>${esc(f.name)}</span>
        <div class="meter" style="--mc:${meterColor(f.score)}"><div style="width:${f.score}%"></div></div><b>${f.score}</b>
        <small>${esc(f.value)}${f.note ? " · " + esc(f.note) : ""}</small></div>`).join("")}
      ${ill && ill.risk === "none" ? `<p class="note" style="font-size:13px">Keine Krankheitsanzeichen erkannt${ill.score != null ? ` (Score ${ill.score}/100)` : ""}.</p>` : ""}
      ${wk ? `<p class="note" style="font-size:13px">Letzte 7 Tage: ${Object.entries(wk).map(([k, v]) => `${esc(k)} ${v} min`).join(" · ")}</p>` : ""}
    </details>` : ""}`;
}

function renderFeedback(T) {
  const host = document.getElementById("hFeedback");
  const F = T && T.feedback;
  const ref = T ? t(T.date) : LAST;
  let recent = F && F.recent;
  if (!recent) {  // ohne Feld: letzte Einheiten aus den Garmin-Daten
    recent = acts.filter(a => !a.multi).slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 3)
      .map(a => ({ date: a.date, title: a.name, rpe: a.rpe ?? null, feel: a.feel || null, planned: null }));
  }
  const missing = F ? (F.missing || []) : recent.filter(r => r.rpe == null && !r.feel).map(r => r.title);
  host.innerHTML = `
    <h3>Wie war dein letztes Training?</h3>
    <p class="desc" style="margin-bottom:0">Anstrengung (1–10) und Gefühl aus Garmin Connect</p>
    ${recent.length ? `<ul class="fb">${recent.slice(0, 3).map(r => `<li>
      <span class="ttl">${esc(r.title)}</span>
      <span class="rpe">${r.rpe != null ? `<span class="rpe-v">${r.rpe}<small>/10</small></span>` : `<span class="pill">offen</span>`}${r.feel ? `<span class="rpe-feel">${esc(r.feel)}</span>` : ""}</span>
      <span class="meta">${relDay(r.date, ref)}${r.planned ? ` · geplant: ${esc(r.planned)}` : ""}</span></li>`).join("")}</ul>` : `<p class="note">Noch keine Einheiten erfasst.</p>`}
    ${F && F.fatigue ? `<div class="hint" style="--c:var(--warning)"><span class="aic" style="width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--warning) 25%,var(--surface-2))">${IC.warning}</span><span><b>Ermüdung erkennbar.</b> Deine Bewertungen waren zuletzt hoch – Garvis plant vorsichtiger.</span></div>` : ""}
    ${F && F.note ? `<p class="note">${tx(F.note)}</p>` : ""}
    ${missing.length ? `<div class="hint">${IC.pen}<span>${`<b>Noch ohne Bewertung:</b> ${missing.slice(0, 3).map(esc).join(", ")}${missing.length > 3 ? " …" : ""}. `}In Garmin Connect bzw. auf der Uhr Anstrengung &amp; Gefühl eintragen – Garvis übernimmt das beim nächsten Abgleich.</span></div>` : ""}`;
}

let dayDrawn = false;
function renderDay(T) {
  const card = document.getElementById("hDay");
  const C = T && T.calendar;
  if (!C || !T.recommendation) { card.hidden = true; return; }
  card.hidden = false;
  const free = (C.free || []).map(f => `${f[0]}–${f[1]}`).join(", ");
  document.getElementById("dayDesc").textContent = (C.source === "apple" ? "Aus deinem Apple Kalender" : "Kein Kalenderzugriff – Standard-Arbeitszeit angenommen") +
    (free ? ` · frei: ${free}` : "") + ((C.notes || []).length ? " · " + C.notes.join(" · ") : "");
  const det = document.getElementById("dayMore");
  const draw = () => { if (det.open) dayline(document.getElementById("dayline"), C, T.recommendation); };
  if (!dayDrawn) { det.addEventListener("toggle", draw); dayDrawn = true; }
  draw();
}

const dayRow = (w, i, full = true) => {
  const d = t(w.date), done = w.type === "done", rest = w.type === "rest";
  const isT = w.date === localIso(), past = w.date < localIso();  // nach echtem Datum (Plan von gestern: „Heute“ wandert weiter)
  const meta = rest ? "" : [w.start && `${w.start} Uhr`, w.duration && `${w.duration} min`, w.place && (isOutdoor(w.place, w.title) ? "draußen" : w.place), w.travel && w.location].filter(Boolean).map(esc).join(" · ");
  return `<div class="drow${isT ? " today" : ""}${rest ? " rest" : ""}${past ? " past" : ""}">
    <div class="dt"><span>${isT ? "Heute" : WD[wdi(d)]}</span><b>${new Date(d).getUTCDate()}</b></div>
    <article class="card day">
      <div class="dh">${done ? IC.check : rest ? IC.moon : sportIcon(w.sport)}<a class="ttl dlink" href="#woche/${esc(w.date)}">${esc(w.title)}<span class="vh"> – ${isT ? "heute" : WDL[wdi(d)]}${past ? " (vorbei)" : ""}, ganzen Tag ansehen</span></a>${IC.chev}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${rest || done ? "" : zwiftBox(w.zwift, full, w.zwift_custom)}
      ${full && w.weather ? `<div class="why2">${esc(shortWeather(w.weather))}${w.why ? " · " + tx(w.why) : ""}</div>` : ""}
      ${rest ? "" : badge(w.type)}
    </article></div>`;
};
function renderNext(T) {
  const host = document.getElementById("hNext");
  const W = T && T.week;
  if (!W || W.length < 2) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = `<h3 class="chead" style="margin-bottom:12px">${IC.list}Als Nächstes</h3><div class="days nested">${W.slice(1, 3).map((w, i) => dayRow(w, i + 1, false)).join("")}</div>
    <a class="linkrow" href="#woche" style="margin-top:12px">Ganze Woche ansehen ${IC.chev}</a>`;
}

// „Plan 19:19 · Uhrdaten von Di., 3. Nov.“ (TODAY.generated, TODAY.readiness.dataDate)
function standLine(T) {
  const g = String(T.generated || "").match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/);
  const plan = g ? (g[1] === localIso() ? `Plan ${g[2]}` : `Plan vom ${dayShortDe(t(g[1]))}, ${g[2]}`) : "Dein Plan für heute";
  const dd = T.readiness && T.readiness.dataDate;
  // veraltete Uhrdaten: steht schon im Hinweis „Uhr nicht synchronisiert“ und in der Erholungskarte
  const watch = T.readiness && T.readiness.stale > 1 ? "" : dd && isIsoDay(String(dd).slice(0, 10)) ? (String(dd).slice(0, 10) === localIso() ? "Uhrdaten von heute" : `Uhrdaten von ${dayShortDe(t(String(dd).slice(0, 10)))}`) : "";
  return [plan, watch].filter(Boolean).join(" · ");
}
// Plan von gestern (TODAY.date < Telefondatum): für „Heute“ den vorläufigen Eintrag aus dem Wochenplan nehmen,
// Kalender/Ort von gestern ausblenden. Ohne Eintrag für heute: „Noch kein Plan“.
function todayView(T) {
  if (!T || !planStale()) return T;
  const real = localIso(), w = (T.week || []).find(x => x.date === real);
  let rec = null;
  if (w) {
    const { d } = dayModel(w, null);
    rec = { level: d.type, sport: d.sport, title: d.title, place: d.place, start: d.start, end: d.end, duration: d.duration, weather: d.weather,
      zwift: d.zwift, zwift_custom: d.zwift_custom, workout: d.workout, strength: d.strength, steps: d.steps || [], why: d.reasons || [],
      alternative: d.alternative || null, provisional: true };
  }
  return { ...T, date: real, recommendation: rec, calendar: null, location: null, week: (T.week || []).filter(x => x.date >= real), stale: T.date };
}
function staleBanner(T) {
  if (!T || !planStale()) return "";
  const n = Math.round((t(localIso()) - t(T.date)) / DAY);
  const web = window.GARVIS && window.GARVIS.web;
  return `<div class="card alert stale" role="status" style="--c:var(--warning)" id="staleBanner"><span class="aic">${IC.clock}</span>
    <div><span class="lvl">Hinweis</span><b>${n === 1 ? "Plan von gestern" : `Plan vom ${esc(dayShortDe(t(T.date)))}`} – die Uhr hat heute noch nicht synchronisiert.</b>
      <p>Neuer Plan kommt nach dem Sync. ${(T.week || []).some(x => x.date === localIso()) ? "Bis dahin siehst du den vorläufigen Plan aus dem Wochenplan." : ""}</p>
      ${web ? `<button type="button" class="txtbtn" data-fetch-now style="margin-top:8px">Jetzt abrufen</button>` : ""}</div></div>`;
}
function renderToday() {
  const T = window.TODAY, TV = todayView(T);
  const d = T ? t(localIso()) : LAST, dt = new Date(d);
  const h = new Date().getHours();
  document.getElementById("hDate").textContent = `${WDL[wdi(d)]}, ${dt.getUTCDate()}. ${MONTHS_L[dt.getUTCMonth()]}`;
  document.getElementById("hGreet").textContent = (h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend") + (G.profile.firstName ? `, ${G.profile.firstName}` : "");
  document.getElementById("hSub").textContent = T ? standLine(T) : `Garmin-Daten bis ${fmtDate(LAST)}`;
  renderAlerts(T); renderGoalTop(T); renderReviewToday(T); renderPlan(TV); renderReady(T); renderFeedback(TV); renderDay(TV); renderNext(TV);
  extHook("today", T);  // Zusatzmodule (z. B. nutrition.js: Kachel „Ernährung heute“)
}

// ---------- Woche ----------
function renderWeekView() {
  const T = window.TODAY, W = T && T.week;
  renderWeekTop(T);
  const list = document.getElementById("wList");
  if (!W || !W.length) {
    document.getElementById("wSum").hidden = true;
    list.innerHTML = `<div class="card"><div class="empty">Noch kein Wochenplan – er entsteht beim nächsten Garmin-Abgleich.</div></div>`;
  } else {
    document.getElementById("wRange").textContent = `${fmtDate(t(W[0].date))} – ${fmtDate(t(W.at(-1).date))}`;
    const train = W.filter(w => w.type !== "rest");
    const bySport = {};
    train.forEach(w => { const k = w.sport || "other"; (bySport[k] ||= { min: 0, n: 0 }); bySport[k].min += w.duration || 0; bySport[k].n++; });
    const order = ["swim", "bike", "run", "gym", "golf", "tennis", "ski", "other"].filter(k => bySport[k]);
    const sum_ = document.getElementById("wSum");
    sum_.hidden = false;
    sum_.innerHTML = `<h3 class="chead">${IC.timer}Geplanter Umfang</h3>
      <div class="wsports">${order.map(k => { const g = groupByKey[k] || groupByKey.other; return `<div class="wsp">
        <div class="ring" style="--c:${g.color};--p:100">${sportIcon(k)}</div>
        <div class="num">${durHtml(bySport[k].min)}</div><div class="l">${SPORT[k] || g.name}<span class="wn">${bySport[k].n}×</span></div></div>`; }).join("")}</div>
      <div class="wtot">Gesamt <span class="num">${durHtml(sum(train.map(w => w.duration)))}</span> · ${pl(train.length, "Einheit", "Einheiten")} · ${pl(W.length - train.length, "Ruhetag", "Ruhetage")}</div>`;
    const mon = new Date(t(W[0].date));
    list.innerHTML = `<div class="mhead" style="grid-column:1/-1">${MONTHS_L[mon.getUTCMonth()]} ${mon.getUTCFullYear()}</div>` + W.map((w, i) => dayRow(w, i)).join("");
    extHook("week", list, W);  // Zusatzmodule: .drow-Elemente in Reihenfolge von W
  }
  if (cur.day) syncDay();
  // Was in den letzten 7 Tagen tatsächlich passiert ist
  const from = LAST - 6 * DAY, by = {};
  acts.filter(a => a.x >= from && a.x <= LAST).forEach(a => { by[a.g] = (by[a.g] || 0) + trainMin(a); });
  // „Absolviert in den letzten 7 Tagen“ ist Teil des Wochenrückblicks (eine Karte); ohne Rückblick eigene Karte
  const rows7 = GROUPS.filter(g => by[g.key]).map(g => ({ name: g.name, k: g.key, planned: null, done: by[g.key] }));
  const tot7 = sum(rows7.map(r => r.done));
  const done = document.getElementById("wDone"), rv = document.getElementById("wReview"), R = T && T.review;
  const last7 = rows7.length ? `<div class="subhead">Letzte 7 Tage · ${hm(tot7)}</div>${sportRows(rows7, false)}` : "";
  rv.hidden = !R; done.hidden = !!R;
  rv.innerHTML = R ? reviewCard(R, last7) : "";
  if (R) bindReview(rv);
  else done.innerHTML = `<h3 class="chead">${IC.check}Absolviert in den letzten 7 Tagen</h3>${rows7.length ? `<p class="desc">Gesamt ${hm(tot7)}</p>${sportRows(rows7, false)}` : `<div class="empty">Keine Aktivitäten in den letzten 7 Tagen</div>`}`, bindReview(done);
}

// ---------- Woche › Tagesansicht (#woche/YYYY-MM-DD): alles, was an einem Tag geplant ist ----------
// Mobil: Blatt über die ganze Höhe, Desktop: Seitenpanel. Schließen per „‹ Woche“, Escape, Hintergrund oder Zurück-Geste.
// Alle Felder von TODAY.week[i] sind optional (ältere today.js: nur Titel/Zeit/Ort/Wetter/Grund).
const isIsoDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const DS = { pushed: false, from: "woche", shown: null, ret: null };
const longDay = iso => { const d = new Date(t(iso)); return `${WDL[wdi(t(iso))]}, ${d.getUTCDate()}. ${MONTHS_L[d.getUTCMonth()]}`; };
const shortDay = iso => { const d = new Date(t(iso)); return `${WD[wdi(t(iso))]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`; };
const chevL = svgI('<path d="M15 5l-7 7 7 7"/>');
const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// freie Fenster ≥ 30 min zwischen 06 und 22 Uhr (für Tage ohne berechnete Fenster)
function freeGaps(busy) {
  const b = (busy || []).filter(x => x.start && x.end).map(x => [toMin(x.start), toMin(x.end)]).sort((a, c) => a[0] - c[0]);
  let c = 360; const out = [];
  b.forEach(([s, e]) => { if (s - c >= 30) out.push([fromMin(c), fromMin(Math.min(s, 1320))]); c = Math.max(c, e); });
  if (1320 - c >= 30) out.push([fromMin(c), "22:00"]);
  return out.filter(([s, e]) => toMin(e) - toMin(s) >= 30);
}
// Ablauf aus workout.segments (nur falls steps fehlen); Wiederholungen ausgeschrieben
const SEGK = { warmup: "Aufwärmen", cooldown: "Ausklang", work: "Belastung", recovery: "Pause", steady: "Gleichmäßig" };
function segTarget(g) {
  if (!g || !g.type || g.type === "none" || g.low == null) return "";
  const r = f => g.high == null || g.low === g.high ? f(g.low) : `${f(g.low)}–${f(g.high)}`;
  return g.type === "power" ? r(v => nf(v)) + " W" : g.type === "pace" ? r(clock) + "/km" : g.type === "swim_pace" ? r(clock) + "/100 m" : /hr|heart/.test(g.type) ? r(v => nf(v)) + " bpm" : "";
}
function segSteps(wo) {
  const out = [];
  const walk = list => (list || []).forEach(sg => {
    if (sg.kind === "repeat") { for (let k = 0; k < (sg.count || 1); k++) walk(sg.segments); return; }
    if (sg.sec) out.push({ label: sg.note || SEGK[sg.kind] || "Abschnitt", min: Math.round(sg.sec / 6) / 10, target: segTarget(sg.target) });
  });
  walk(wo && wo.segments);
  return out;
}
// Woche-Eintrag + (heute) vollständige Empfehlung zusammenführen
function dayModel(w, T) {
  const today = !!T && w.date === T.date, R = today ? T.recommendation : null, d = { ...w };  // Empfehlung gehört zu TODAY.date
  if (R) {
    if (R.level) d.type = R.level;
    ["title", "sport", "start", "end", "duration", "place", "weather", "zwift", "zwift_custom", "workout", "strength"].forEach(k => { if (R[k] != null) d[k] = R[k]; });
    if ((R.steps || []).length) d.steps = R.steps;
    if ((R.why || []).length) d.reasons = R.why;
    d.alternative = R.alternative; d.slot = R.slot;
  }
  if (!(d.reasons || []).length) d.reasons = d.why ? [d.why] : [];
  if (d.start && !d.end && d.duration && /^\d{1,2}:\d{2}$/.test(d.start)) d.end = fromMin(Math.min(toMin(d.start) + d.duration, 1439));  // ältere today.js ohne end
  if (!(d.steps || []).length && d.workout) d.steps = segSteps(d.workout);
  const real = localIso();
  return { d, today: w.date === real, future: w.date > real, stale: !!T && w.date === real && T.date < real };
}
const stepsHtml = steps => `<ol class="steps">${steps.map(s => `<li><span class="min">${nf(s.min, s.min % 1 ? 1 : 0)}′</span><div><div class="lab">${esc(s.label)}</div>${s.target ? `<div class="tgt">${esc(s.target)}</div>` : ""}</div></li>`).join("")}</ol>`;
// Tagesablauf als Liste: Arbeit, Termine, Training (Farben wie in der Zeitleiste)
function agenda(d, C, evs) {
  const rows = [], same = (a, b) => String(a || "").trim() === String(b || "").trim();
  let ev = evs.length ? evs : (C.busy || []).filter(b => b.kind !== "work").map(b => ({ title: b.label, start: b.start, end: b.end }));
  (C.busy || []).filter(b => b.kind === "work").forEach(b => {  // Dienst aus dem Kalender: Terminzeit statt Zeit inkl. Weg, nicht doppelt
    const x = ev.find(e => !e.allDay && same(e.title, b.label));
    if (x) ev = ev.filter(e => e !== x);
    rows.push({ s: x ? x.start : b.start, e: x ? x.end : b.end, l: b.label, c: "var(--axis)" });
  });
  ev.forEach(x => rows.push({ s: x.allDay ? "" : x.start, e: x.allDay ? "" : x.end, l: x.title, c: "var(--text-muted)", all: !!x.allDay }));
  if (d.start && d.type !== "rest") rows.push({ s: d.start, e: d.end, l: d.title, c: "var(--s1)", tr: true });
  rows.sort((a, b) => (a.all ? -1 : 0) - (b.all ? -1 : 0) || String(a.s).localeCompare(String(b.s)));
  return rows.length ? `<ul class="ds-ag">${rows.map(r => `<li${r.tr ? ' class="tr"' : ""}><span class="tm">${r.all ? "ganztägig" : `${esc(r.s || "")}${r.e ? "–" + esc(r.e) : ""}`}</span><i style="background:${r.c}"></i><span class="lb">${esc(r.l || "Termin")}</span></li>`).join("")}</ul>` : "";
}
function dayHtml(w, T) {
  const M = dayModel(w, T), { d, today, future, stale } = M, planDay = !!T && w.date === T.date;
  const done = d.type === "done", rest = d.type === "rest", race = d.type === "race";
  const out = isOutdoor(d.place, d.title);
  const place = d.place ? (out ? "Draußen" : d.place === "drinnen" ? "Drinnen" : `${esc(d.place)}`) : "";
  const loc = planDay && T.location ? T.location : { name: d.location, travel: d.travel };
  const steps = d.steps || [];
  const total = sum(steps.map(s => s.min));
  const head = `<article class="card ds-head">
    <div class="kicker">${today ? "Heute · " : ""}${longDay(w.date)}</div>
    <div class="plan-head" style="margin-top:8px"><span class="sic">${done ? IC.check : rest ? IC.moon : race ? IC.medal : sportIcon(d.sport)}</span><h2 class="plan-title" id="dsTitle" tabindex="-1">${esc(d.title || (rest ? "Ruhetag" : "Training"))}</h2></div>
    <div class="tags">${lvTag(d.type)}${!rest && SPORT[d.sport] ? `<span class="tag">${SPORT[d.sport]}</span>` : ""}${d.place && !rest ? `<span class="tag">${out ? "Draußen" : "Drinnen"}</span>` : ""}${loc.travel && loc.name ? `<span class="tag">Unterwegs</span>` : ""}</div>
    ${rest ? `<p class="note" style="margin:0 0 14px">Keine Einheit geplant – Erholung ist Teil des Trainings. Spazieren, Dehnen oder lockere Mobility sind okay.</p>` : ""}
    ${done ? `<p class="note" style="margin:0 0 14px">Training geschafft – Rest des Tages: Erholung, essen, trinken, gut schlafen.</p>` : ""}
    ${race ? `<p class="note" style="margin:0 0 14px">Wettkampftag: gewohntes Frühstück 2–3 h vorher, früh genug da sein, locker einlaufen bzw. einrollen und nur das Fueling nutzen, das du im Training geübt hast.</p>` : ""}
    <div class="fgrid">
      ${rest ? "" : fitem(IC.timer, "Dauer", d.duration ? durHtml(d.duration) : "", true)}
      ${rest ? "" : fitem(IC.clock, "Uhrzeit", d.start ? `${esc(d.start)}${d.end ? `<small>–</small>${esc(d.end)}` : ""}` : "", true)}
      ${rest ? "" : fitem(out ? IC.sun : IC.home, "Ort", place)}
      ${fitem(IC.cloud, "Wetter", d.weather ? esc(shortWeather(d.weather)) : "")}
      ${loc.travel && loc.name ? fitem(IC.pin, "Reiseort", esc(loc.name)) : ""}
    </div>
    ${d.weather ? `<p class="note">Wetter: ${esc(d.weather)}</p>` : ""}
    ${future ? `<div class="hint">${IC.info}<span><b>Vorläufig</b> – wird am Morgen des Tages an deine Erholung angepasst.</span></div>` : ""}
    ${stale ? `<div class="hint">${IC.clock}<span><b>Vorläufig</b> – die Uhr hat heute noch nicht synchronisiert. Der neue Plan kommt nach dem Sync.</span></div>` : ""}
  </article>`;
  const zw = rest ? "" : zwiftBox(d.zwift, true, d.zwift_custom) + watchNote(d);
  const plan = rest ? (steps.length ? `<article class="card"><h3 class="chead">${IC.moon}Optional: Mobility${total ? `<span class="r muted num">${hm(total)}</span>` : ""}</h3>
      <p class="desc">Wenn du Lust hast – kurz und locker, zählt nicht als Training.</p>${stepsHtml(steps)}</article>` : "")
    : steps.length || zw ? `<article class="card"><h3 class="chead">${IC.pulse}${race ? "Ablauf am Wettkampftag" : "Ablauf"}${total ? `<span class="r muted num">${hm(total)}</span>` : ""}</h3>
      ${zw}${steps.length ? `<div class="wprof" id="dsProfile"></div>${stepsHtml(steps)}` : ""}</article>` : "";
  const why = d.reasons.length || d.slot || d.alternative ? `<article class="card"><h3 class="chead">${IC.info}Warum dieser Tag so geplant ist</h3>
    ${d.reasons.length ? `<ul class="why">${d.reasons.map(r => `<li>${tx(r)}</li>`).join("")}</ul>` : ""}
    ${d.slot ? `<p class="note">Freies Fenster laut Kalender: ${esc(d.slot[0])}–${esc(d.slot[1])} Uhr</p>` : ""}
    ${d.alternative ? `<p class="note">Wenig Zeit oder Lust? <b style="color:var(--text-primary);font-weight:600">${esc(d.alternative.title)}</b>${d.alternative.duration ? ` (${d.alternative.duration} min)` : ""}</p>` : ""}</article>` : "";
  const TC = planDay && T.calendar ? T.calendar : null;
  const known = !!TC || Array.isArray(w.busy) || Array.isArray(w.events);  // ältere today.js: keine Termine je Tag
  const C = TC || { busy: w.busy || [], free: known ? freeGaps(w.busy) : [] };
  const evs = (TC ? TC.events : w.events) || [];
  const ag = agenda(d, C, evs), line = known && ((C.busy || []).length || (d.start && !rest));
  const free = (C.free || []).map(f => `${f[0]}–${f[1]}`).join(", ");
  const cal = ag || line ? `<article class="card"><h3 class="chead">${IC.clock}Dein Tag</h3>
    <p class="desc">${TC ? (TC.source === "apple" ? "Aus deinem Apple Kalender" : "Kein Kalenderzugriff – Standard-Arbeitszeit angenommen") : known ? "Laut Kalender" : "Termine für diesen Tag liegen noch nicht vor"}${free ? ` · frei: ${esc(free)}` : ""}</p>
    ${ag}${line ? `<div class="ds-line" id="dsLine"></div>` : ""}</article>` : "";
  const html = head + plan + `<article class="card ds-sx" data-slot="strength" hidden></article>` + why + cal +
    (today ? `<article class="card" data-slot="nutrition" hidden></article><a class="card ds-link" href="#heute">${IC.sun}<span><b>Zur Heute-Ansicht</b><small>Erholung, Feedback und Tagesplan</small></span>${IC.chev}</a>` : "");
  return { html, M, C };
}
function dsEl() {
  let s = document.getElementById("daySheet");
  if (s) return s;
  s = document.createElement("div"); s.id = "daySheet"; s.className = "ds"; s.hidden = true;
  s.innerHTML = `<div class="ds-dim" data-ds="close"></div>
    <div class="ds-panel" role="dialog" aria-modal="true" aria-labelledby="dsTitle">
      <div class="ds-bar"><button type="button" class="ds-backbtn" data-ds="close">${chevL}<span id="dsBackL">Woche</span></button>
        <span class="ds-bt" id="dsBarDay" aria-hidden="true"></span>
        <span class="ds-nav"><button type="button" class="iconbtn" data-ds="prev">${chevL}</button><button type="button" class="iconbtn" data-ds="next">${IC.chev}</button></span></div>
      <div class="ds-body" id="dsBody"></div></div>`;
  document.body.appendChild(s);
  bindDaySwipe();  // Wischen = vorheriger/nächster Tag (siehe „Wischen zwischen den Tabs“)
  s.addEventListener("click", e => {
    const b = e.target.closest("[data-ds]");
    if (!b || b.disabled) return;
    if (b.dataset.ds === "close") return closeDay();
    const W = (window.TODAY && window.TODAY.week) || [], i = W.findIndex(w => w.date === cur.day), j = i + (b.dataset.ds === "next" ? 1 : -1);
    if (W[j]) location.replace("#woche/" + W[j].date);  // ohne neuen Verlaufseintrag: Zurück führt direkt zur Woche
  });
  s.querySelector(".ds-panel").addEventListener("scroll", hideTip, { passive: true });
  return s;
}
function closeDay() { if (DS.pushed) history.back(); else location.replace("#woche"); }
addEventListener("keydown", e => {
  if (!cur.day) return;
  const nu = document.getElementById("nuSheet");
  if (nu && !nu.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); closeDay(); }
});
function renderDaySheet(iso) {
  const T = window.TODAY, W = (T && T.week) || [], i = W.findIndex(w => w.date === iso);
  const s = dsEl(), body = document.getElementById("dsBody");
  document.getElementById("dsBackL").textContent = DS.pushed && DS.from === "heute" ? "Heute" : "Woche";
  document.getElementById("dsBarDay").textContent = i < 0 ? "" : iso === localIso() ? "Heute" : shortDay(iso);
  const [pb, nb] = s.querySelectorAll(".ds-nav button");
  pb.disabled = i <= 0; nb.disabled = i < 0 || i >= W.length - 1;
  pb.setAttribute("aria-label", W[i - 1] ? `Vorheriger Tag: ${longDay(W[i - 1].date)}` : "Vorheriger Tag");
  nb.setAttribute("aria-label", W[i + 1] ? `Nächster Tag: ${longDay(W[i + 1].date)}` : "Nächster Tag");
  if (i < 0) {
    body.innerHTML = `<article class="card"><div class="kicker">${isIsoDay(iso) ? longDay(iso) : ""}</div><h2 class="plan-title" id="dsTitle" tabindex="-1" style="margin-top:8px">Kein Plan für diesen Tag</h2>
      <p class="note">Der Wochenplan umfasst die nächsten 7 Tage ab heute. Er entsteht beim Garmin-Abgleich.</p></article>`;
    if (isIsoDay(iso)) extHook("day", body, { date: iso }, { today: false, future: false, unplanned: true });  // actions.js: Rückblick vergangener Tage
    return;
  }
  const { html, M, C } = dayHtml(W[i], T);
  body.innerHTML = html;
  body.querySelectorAll("details.zwd").forEach(x => { x.open = true; });
  const prof = document.getElementById("dsProfile");
  if (prof) workoutProfile(prof, M.d.steps);
  const ln = document.getElementById("dsLine");
  if (ln) dayline(ln, C, M.d.type === "rest" ? {} : M.d);
  extHook("day", body, M.d, { today: M.today, future: M.future });  // strength.js: Übungen · nutrition.js: Fueling (heute)
}
function syncDay() {
  let s = document.getElementById("daySheet");
  const lock = on => { document.documentElement.classList.toggle("ds-lock", on); document.querySelectorAll("header.topbar, main.wrap").forEach(n => { n.inert = on; }); };
  if (!cur.day) {
    if (s && !s.hidden) {
      s.hidden = true; lock(false); hideTip();
      const back = document.querySelector(`#wList a.dlink[href="#woche/${DS.shown}"]`) || DS.ret;
      if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
    }
    DS.shown = null; return;
  }
  s = s || dsEl();
  const first = s.hidden, panel = s.querySelector(".ds-panel"), same = DS.shown === cur.day;
  if (first) DS.ret = document.activeElement;
  s.hidden = false; lock(true);
  const top = same ? panel.scrollTop : 0, lost = same && (!document.activeElement || document.activeElement === document.body);
  const hadFocus = same && document.activeElement && document.getElementById("dsBody").contains(document.activeElement);
  renderDaySheet(cur.day);
  panel.scrollTop = top;
  if (!same || hadFocus || lost) { const h = document.getElementById("dsTitle"); if (h) h.focus({ preventScroll: true }); }
  DS.shown = cur.day;
}

// ---------- Fortschritt ----------
// Fitness & Form: Kennzahlen + Linien Fitness/Ermüdung (eine Achse) + Form als eigenes Diagramm (Nulllinie)
const fitIn = () => FIT.filter(f => inRange(f.x) || (f.x > LAST && range.to === LAST));
function fitnessCard() {
  if (!FIT.length) return "";
  const F = fitIn(), now = FIT.at(-1);
  const startV = F.length ? F[0] : null;
  const z = formZone(now.tsb);
  const dCtl = startV && range.id !== "all" ? now.ctl - startV.ctl : null;
  return `<div class="card pcard wide" id="pFit">
    <h3 class="chead">${IC.trend}Fitness &amp; Form<span class="r muted" style="font-size:12px">Stand ${fmtDate(now.x)}</span></h3>
    <div class="fstats">
      <div class="fstat"><div class="fl">Fitness</div>
        <div class="v">${fitNf(now.ctl)}</div>
        <div class="foot">${dCtl == null ? "42-Tage-Schnitt der Belastung" : `<span class="${dCtl >= 0 ? "delta-up" : "delta-down"}">${dCtl >= 0 ? "▲" : "▼"} ${signed(dCtl)}</span> seit ${fmtDate(startV.x)}`}</div></div>
      <div class="fstat"><div class="fl">Form</div>
        <div class="v sm">${signed(now.tsb)}</div>
        <div class="st" style="--c:${z.c}"><span class="fic">${IC[z.ic]}</span>${z.w}</div></div>
    </div>
    <p class="pf" style="margin:6px 0 12px">Ermüdung ${fitNf(now.atl)} · Tagesbelastung heute ${nf(now.load)}${F.length ? ` · Ø ${nf(mean(F.map(f => f.load)), 0)} pro Tag im Zeitraum` : ""}</p>
    <div id="pFitChart"></div>
    <div class="subchart"><h4 class="chead">Form <span class="muted" style="font-weight:400;font-size:13px">· Fitness − Ermüdung</span></h4><div id="pFormChart" style="margin-top:6px"></div></div>
    <details class="more explain"><summary>Was bedeutet das?</summary>
      <p><b>Fitness</b> ist der Schnitt deiner Tagesbelastung (Garmin Training Load) der letzten ~6 Wochen – sie steigt langsam, wenn du regelmäßig trainierst, und sinkt in Pausen.</p>
      <p><b>Ermüdung</b> ist derselbe Schnitt über ~7 Tage – sie reagiert schnell auf harte Tage und baut sich nach Ruhetagen wieder ab.</p>
      <p><b>Form</b> = Fitness − Ermüdung (vom Vortag). Positiv heißt ausgeruht, negativ heißt: gerade belastet.</p>
      <dl>${FORM_ZONES.map(zz => `<dt><span class="fic" style="--c:${zz.c};width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;background:color-mix(in srgb,var(--c) 22%,var(--surface-2))">${IC[zz.ic].replace('class="ic"', 'class="ic" style="width:13px;height:13px"')}</span>${zz.w}</dt><dd>${zz.lo == null ? `unter ${zz.hi}` : zz.hi == null ? `über +${zz.lo}` : `${zz.lo > 0 ? "+" : ""}${zz.lo} bis ${zz.hi > 0 ? "+" : ""}${zz.hi}`} · ${zz.d}</dd>`).join("")}</dl>
      <p>Die Zahlen hängen davon ab, wie Garmin die Belastung je Einheit misst – wichtiger als der absolute Wert ist der Verlauf.</p>
    </details>
    <details class="more"><summary>Werte als Tabelle <span class="n">· Wochenende</span></summary><div class="tscroll" style="max-height:300px;margin-top:10px"><table id="pFitTable"></table></div></details>
  </div>`;
}
function drawFitness() {
  if (!FIT.length) return;
  const F = fitIn();
  const weekly = spanDays() > 400;
  const pts = key => weekly ? series(FIT, key, { unit: "week" }) : F.filter(f => f[key] != null).map(f => ({ x: f.x, y: f[key] }));
  const byX = new Map(F.map(f => [f.x, f]));
  const xf = weekly ? x => "Woche ab " + fmtDate(x) : x => `${WD[wdi(x)]}, ${fmtDate(x)}`;
  const atl = pts("atl").map(p => { const f = byX.get(p.x); return f && !weekly ? { ...p, extra: [{ k: "Form", v: signed(f.tsb) }, { k: "Tagesbelastung", v: nf(f.load) }] } : p; });
  lineChart(document.getElementById("pFitChart"), {
    series: [{ name: "Fitness", color: "var(--s1)", pts: pts("ctl") }, { name: "Ermüdung", color: "var(--neutral)", pts: atl }],
    height: 190, yZero: true, tipFmt: v => nf(v, 1), endFmt: fitNf, xFmt: xf, label: "Fitness und Ermüdung",
  });
  lineChart(document.getElementById("pFormChart"), {
    series: [{ name: "Form", color: "var(--s1)", pts: pts("tsb") }],
    height: 140, label: "Form", yFmt: v => signed(v, 0).replace("±", ""), tipFmt: v => signed(v) + " · " + formZone(v).w, endFmt: v => signed(v), xFmt: xf,
    include: [-15, 10], zeroLine: true, bands: FORM_ZONES.map(z => ({ lo: z.lo, hi: z.hi, label: z.w })),
  });
  // Tabelle: Wochenwerte (Sonntag) im Zeitraum
  const rows = F.filter(f => wdi(f.x) === 6 || f === F.at(-1));
  table(document.getElementById("pFitTable"), [
    { h: "Datum", v: f => f.x, f: v => fmtDate(v) },
    { h: "Fitness", n: 1, v: f => f.ctl, f: v => nf(v, 1) },
    { h: "Ermüdung", n: 1, v: f => f.atl, f: v => nf(v, 1) },
    { h: "Form", n: 1, v: f => f.tsb, f: v => signed(v) },
    { h: "Zustand", v: f => formZone(f.tsb).w },
  ], rows);
}

function renderProgress() {
  document.getElementById("pRangeLabel").textContent = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const len = range.to - range.from;
  const prevIn = x => x >= range.from - len - DAY && x < range.from;
  const showDelta = range.id !== "all";
  const A = acts.filter(a => inRange(a.x)), P = acts.filter(a => prevIn(a.x));
  const D = daily.filter(d => inRange(d.x)), DP = daily.filter(d => prevIn(d.x));
  const weeks = Math.max(1, (len / DAY + 1) / 7);
  const hours = sum(A.map(trainMin)) / 60, hoursP = sum(P.map(trainMin)) / 60;
  const rhr = mean(D.map(d => d.rhr)), rhrP = mean(DP.map(d => d.rhr));
  const sTot = d => d.sDeep == null ? null : (d.sDeep + d.sLight + d.sRem);
  const sl = mean(D.map(sTot)), slP = mean(DP.map(sTot));
  const run = [...(G.vo2.null || []), ...(G.vo2.RUNNING || [])].map(v => ({ x: t(v.date), y: v.vo2MaxValue })).sort((a, b) => a.x - b.x);
  const bike = (G.vo2.CYCLING || []).map(v => ({ x: t(v.date), y: v.vo2MaxValue })).sort((a, b) => a.x - b.x);
  const runIn = run.filter(p => inRange(p.x)), vo2Now = run.at(-1), vo2Prev = run.filter(p => p.x < range.from).at(-1);
  // VO2max gilt bis zur nächsten Messung → letzten Stand vor/nach dem Zeitraum als Übertrag an die Ränder setzen
  const carry = pts => {
    const inn = pts.filter(p => inRange(p.x)), before = pts.filter(p => p.x < range.from).at(-1);
    const out = before ? [{ x: range.from, y: before.y, carry: true }] : [];
    inn.forEach(p => { if (out.length && out.at(-1).y !== p.y) out.push({ x: p.x - 1, y: out.at(-1).y, carry: true }); out.push(p); });  // Stufen statt Schräge
    if (out.length && out.at(-1).x < range.to) out.push({ x: range.to, y: out.at(-1).y, carry: true });
    return out;
  };
  // Belastung aus den Aktivitäten (Garmin-Load je Einheit): akut = Summe 7 Tage, chronisch = Ø-Woche der letzten 28 Tage
  const loadDay = new Map();
  acts.forEach(a => { if (a.load) loadDay.set(a.x, (loadDay.get(a.x) || 0) + a.load); });
  const acute = [];
  for (let x = range.from; x <= range.to; x += DAY) {
    let s7 = 0, s28 = 0;
    for (let k = 0; k < 28; k++) { const v = loadDay.get(x - k * DAY) || 0; s28 += v; if (k < 7) s7 += v; }
    acute.push({ x, a: s7, c: s28 / 4 });
  }
  const ac = acute.at(-1);
  const dl = (cur, prev, upGood, fmt) => showDelta ? delta(cur, prev, upGood, fmt) : "";
  const card = (id, icon, kicker, value, unit, foot, desc) => `<div class="card pcard"><h3 class="chead">${icon}${kicker}</h3>
    <div class="pv"><b>${value}</b><span>${unit}</span></div><div class="pf">${foot || "&nbsp;"}</div>${desc ? `<p class="desc">${desc}</p>` : ""}<div id="${id}"></div></div>`;
  const tu = spanDays() > 400 ? "month" : spanDays() > 45 ? "week" : "day";
  document.getElementById("pCards").innerHTML = fitnessCard() + [
    card("pTrain", IC.timer, "Trainingszeit", nf(hours, hours < 10 ? 1 : 0), "Stunden", [`Ø ${nf(hours / weeks, 1)} h pro Woche`, dl(hours, hoursP, true, v => nf(v, 1) + " h")].filter(Boolean).join(" · "), `Stunden pro ${({ month: "Monat", week: "Woche", day: "Tag" })[tu]} nach Sportart`),
    card("pRhr", IC.heart, "Ruhepuls", nf(rhr), "bpm Ø", dl(rhr, rhrP, false, v => nf(v, 1) + " bpm") || (D.length ? `zuletzt ${nf(D.filter(d => d.rhr).at(-1)?.rhr)} bpm` : ""), `Schläge pro Minute · ${unitLabel()} · niedriger = besser erholt`),
    card("pSleep", IC.moon, "Schlaf", sl == null ? "–" : hm(sl * 60), "pro Nacht Ø", [`Ø Schlafwert ${nf(mean(D.map(d => d.sScore)))}`, dl(sl, slP, true, v => nf(v * 60, 0) + " min")].filter(Boolean).join(" · "), `Stunden pro Nacht · ${unitLabel()}`),
    card("pVo2", IC.pulse, "VO2max Laufen", vo2Now ? nf(vo2Now.y) : "–", "ml/kg/min", vo2Now && vo2Prev && showDelta ? delta(vo2Now.y, vo2Prev.y, true, v => nf(v)).replace("zum Vorzeitraum", `seit ${fmtDate(range.from)}`) : (runIn.length ? `${pl(runIn.length, "Messung", "Messungen")} im Zeitraum` : "keine neue Messung im Zeitraum"), "Garmin-Schätzung · Punkt = Messung, gestrichelt = Wert gilt bis zur nächsten Messung"),
    card("pLoad", IC.bolt, "Trainingsbelastung", ac ? nf(ac.a) : "–", "letzte 7 Tage", ac ? `Ø-Woche der letzten 4 Wochen ${nf(ac.c)} · ` + (ac.c >= 100 ? `Verhältnis ${nf(ac.a / ac.c, 2)}` : "Verhältnis erst ab mehr Trainingsbasis aussagekräftig") : "", "Summe der Garmin-Belastung je Einheit · Verhältnis über 1,5 erhöht das Verletzungsrisiko"),
  ].join("") + acclimCard("pAcclim");  // Randinfo Hitze/Höhe (nur mit Werten)
  drawFitness();
  // Diagramme (Hilfsfunktionen von oben)
  const map = new Map();
  for (let x = bucketOf(range.from, tu); x <= range.to; x = nextBucket(x, tu)) map.set(x, { x, v: {}, n: 0 });
  A.forEach(a => { const b = map.get(bucketOf(a.x, tu)); if (b) { b.v[a.g] = (b.v[a.g] || 0) + trainMin(a) / 60; b.n++; } });
  columnChart(document.getElementById("pTrain"), {
    buckets: [...map.values()].map(b => ({ ...b, label: bucketLabel(b.x, tu), short: bucketShort(b.x, tu), extra: [{ k: "Aktivitäten", v: nf(b.n) }] })),
    keys: GROUPS.filter(g => A.some(a => a.g === g.key)), height: 200, yFmt: axH, tipFmt: v => hm(v * 60), label: "Trainingszeit nach Sportart",
  });
  const xf = xLabel();
  lineChart(document.getElementById("pRhr"), { series: [{ name: "Ruhepuls", color: "var(--s1)", pts: series(daily, "rhr") }], height: 180, tipFmt: v => nf(v, 1) + " bpm", endFmt: v => nf(v), xFmt: xf, label: "Ruhepuls", unit: "bpm", minSpan: 10 });
  lineChart(document.getElementById("pSleep"), { series: [{ name: "Schlafdauer", color: "var(--s1)", pts: series(daily.map(d => ({ x: d.x, sTot: sTot(d) })), "sTot") }], height: 180, yFmt: axH, tipFmt: v => hm(v * 60), xFmt: xf, label: "Schlafdauer" });
  lineChart(document.getElementById("pVo2"), { series: [{ name: "Laufen", color: "var(--sp-run)", pts: carry(run) }, { name: "Radfahren", color: "var(--sp-bike)", pts: carry(bike) }], height: 180, connect: true, pointDots: true, label: "VO2max" });
  lineChart(document.getElementById("pLoad"), {
    series: [{ name: "Letzte 7 Tage", color: "var(--s1)", pts: series(acute, "a") }, { name: "Ø-Woche (28 Tage)", color: "var(--neutral)", pts: series(acute, "c") }],
    height: 180, tipFmt: v => nf(v, 0), endFmt: v => nf(v), yZero: true, xFmt: xf, label: "Trainingsbelastung",
  });
  extHook("progress", document.getElementById("pCards"), range);  // Zusatzmodule (perf.js: Leistungs- & Pace-Kurve)
}

// ---------- Ziel & Fokus, Wochenrückblick, Abweichungen, Zonen ----------
// Alle Felder sind optional (TODAY.goal/review/missed/other_load, GARMIN.zones) – ohne sie bleibt die App wie gehabt.
const $id = id => document.getElementById(id);
const GOAL_TYPES = [
  { key: "balanced", name: "Ausgeglichen", d: "Vielseitig fit – Ausdauer, Kraft und Erholung im Gleichgewicht", ic: "balance" },
  { key: "race", name: "Wettkampf", d: "Auf einen Termin hin – mit Phasen bis zum Tag X", ic: "medal" },
  { key: "performance", name: "Leistungsziel", d: "Einen Wert verbessern, z. B. FTP oder 10-km-Zeit", ic: "trend" },
  { key: "strength", name: "Kraft", d: "Kraft aufbauen, Ausdauer ergänzend", ic: "gym" },
];
const GOAL_TYPE = Object.fromEntries(GOAL_TYPES.map(g => [g.key, g]));
const GOAL_SPORTS = [
  { key: "triathlon", name: "Triathlon", ic: "pulse" }, { key: "run", name: "Laufen", ic: "run" },
  { key: "bike", name: "Rad", ic: "bike" }, { key: "swim", name: "Schwimmen", ic: "swim" },
];
const GOAL_SPORT = Object.fromEntries(GOAL_SPORTS.map(g => [g.key, g]));
const GOAL_SUGG = {
  race: { triathlon: ["Sprintdistanz", "Olympische Distanz", "Mitteldistanz (70.3)", "Langdistanz"], run: ["5 km", "10 km", "Halbmarathon", "Marathon"],
    bike: ["Radmarathon", "Zeitfahren 40 km", "Gran Fondo", "Bergrennen"], swim: ["1500 m Freiwasser", "3,8 km Freiwasser", "Schwimm-Meile", "400 m Becken"] },
  performance: { triathlon: ["FTP 260 W", "10 km unter 45 min", "CSS 1:45 /100 m"], run: ["5 km unter 21 min", "10 km unter 45 min", "VO2max 60"],
    bike: ["FTP 260 W", "4 W/kg", "20 min mit 280 W"], swim: ["CSS 1:40 /100 m", "1500 m unter 25 min"] },
};
const PHASES = ["Grundlage", "Aufbau", "Spitze", "Tapering", "Wettkampfwoche"];
// wie recommend.py goal_profile: Phase aus den verbleibenden Tagen, jede 4. Woche in Grundlage/Aufbau Entlastung
const PHASE_SHORT = { Grundlage: "Basis", Tapering: "Taper", Wettkampfwoche: "WK" };  // schmale Abschnitte der Zeitleiste
const phaseAt = daysLeft => { const wl = Math.floor(daysLeft / 7); return daysLeft <= 7 ? "Wettkampfwoche" : wl <= 2 ? "Tapering" : wl <= 6 ? "Spitze" : wl <= 16 ? "Aufbau" : "Grundlage"; };
const isDeload = daysLeft => { const wl = Math.floor(daysLeft / 7), ph = phaseAt(daysLeft); return (ph === "Grundlage" || ph === "Aufbau") && wl % 4 === 0; };
const PHASE_COL = ["var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)", "var(--q6)"];  // geordnet → eine Farbrampe
const SET_KEY = "garvis.settings", DISPATCH_KEY = "garvis.dispatch";
const API = "https://api.github.com";
const DATA_REPO = (window.GARVIS && window.GARVIS.dataRepo) || "PaulJustenhoven/garvis-data";
const CODE_REPO = "PaulJustenhoven/garvis";
const SETTINGS_URL = `${API}/repos/${DATA_REPO}/contents/settings.json`;
const DISPATCH_URL = `${API}/repos/${CODE_REPO}/actions/workflows/daily.yml/dispatches`;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const todayRef = () => window.TODAY && window.TODAY.date ? t(window.TODAY.date) : LAST;
// Echtes Datum laut Telefon (nicht TODAY.date). Plan „von gestern“: Uhr hat heute noch nicht synchronisiert.
const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const planStale = () => !!(window.TODAY && isIsoDay(window.TODAY.date) && window.TODAY.date < localIso());
// Wird gerade getippt? (Neu zeichnen würde die iOS-Tastatur schließen und Eingaben verlieren)
const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(TEXTAREA|SELECT)$/.test(a.tagName) || (a.tagName === "INPUT" && !/^(button|submit|reset|radio|checkbox|range|file|color|image)$/.test(a.type))); };
const weeksTxt = n => n == null ? "" : n <= 0 ? "diese Woche" : n === 1 ? "noch 1 Woche" : `noch ${n} Wochen`;
const shortDate = iso => { const d = new Date(t(iso)); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`; };
const readLocal = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat/voll */ } };
const sportKey = name => {
  const n = String(name || "").toLowerCase();
  if (GROUP_OF[n] || groupByKey[n]) return GROUP_OF[n] || n;
  return /lauf|run/.test(n) ? "run" : /rad|bike|zwift|rolle/.test(n) ? "bike" : /schwimm|swim/.test(n) ? "swim" : /kraft|gym|stabi/.test(n) ? "gym"
    : /golf/.test(n) ? "golf" : /tennis|padel|volley/.test(n) ? "tennis" : /ski|langlauf/.test(n) ? "ski" : "other";
};

// Aktuelles Ziel: TODAY.goal – außer es wurde danach lokal etwas Neueres gespeichert (dann gilt das bis zum nächsten Planungslauf)
function currentGoal() {
  const T = window.TODAY, tg = T && T.goal, loc = readLocal(SET_KEY);
  const genMs = T && T.generated ? Date.parse(T.generated.replace(" ", "T")) : 0;
  if (loc && loc.goal && loc.goal.type && (!tg || Date.parse(loc.updated || 0) > genMs)) {
    const g = loc.goal, dl = g.date ? Math.round((t(g.date) - todayRef()) / DAY) : null, ev = g.type === "race" || g.type === "performance";
    return { ...g, weeks_left: dl != null && dl >= 0 ? Math.floor(dl / 7) : null, phase: ev ? (dl != null && dl >= 0 ? phaseAt(dl) : "Aufbau") : null,
      focus_text: "Neu gespeichert – wird beim nächsten Planungslauf berücksichtigt.", pending: true, strength_days: loc.strength_days };
  }
  return tg && tg.type ? tg : null;
}
const goalName = g => g.type === "balanced" ? "Ausgeglichen" : g.title || g.event || (g.type === "strength" ? "Kraft" : (GOAL_SPORT[g.sport] || {}).name) || (GOAL_TYPE[g.type] || {}).name || "Ziel";
function goalText(g) {
  if (g.type === "balanced") return "Fokus: Ausgeglichen";
  const parts = [weeksTxt(g.date ? g.weeks_left : null), g.phase && `Phase ${g.phase}`, g.type === "strength" && g.strength_days && `${g.strength_days}× pro Woche`].filter(Boolean);
  return [`Ziel: ${goalName(g)}`, ...parts].join(" · ");
}
const goalIcon = g => g.sport && g.sport !== "triathlon" && GOAL_SPORT[g.sport] ? IC[GOAL_SPORT[g.sport].ic] : IC[(GOAL_TYPE[g.type] || GOAL_TYPE.race).ic];

// Phasen-Zeitleiste bis zum Datum: ein Kästchen je Woche, gruppiert nach Phase (Regeln wie im Planer)
function phaseWeeks(dateIso) {
  const dl0 = Math.round((t(dateIso) - todayRef()) / DAY);
  if (!(dl0 >= 0) || dl0 > 7 * 80) return null;
  const groups = [];
  for (let k = 0, dl = dl0; dl >= 0; k++, dl -= 7) {
    const ph = phaseAt(dl), last = groups.at(-1), wk = { k, deload: isDeload(dl), from: todayRef() + k * 7 * DAY };
    if (last && last.name === ph) last.weeks.push(wk); else groups.push({ name: ph, weeks: [wk] });
    if (dl <= 7) break;  // Wettkampfwoche = letzte Woche
  }
  return groups;
}
function phaseTimeline(g) {
  const groups = g.date && phaseWeeks(g.date);
  if (!groups) return "";
  const deload = groups.some(x => x.weeks.some(w => w.deload));
  const wk = n => `${n} Wo.`, total = sum(groups.map(x => x.weeks.length));
  return `<div class="ptl" role="img" aria-label="Phasen bis ${esc(fmtDate(t(g.date)))}: ${groups.map(x => `${x.name} ${pl(x.weeks.length, "Woche", "Wochen")}`).join(", ")}">
    <div class="bar">${groups.map((x, gi) => `<div class="grp" style="flex:${x.weeks.length}">${x.weeks.map(w => `<div class="${w.k === 0 ? "cur " : ""}${w.deload ? "dl" : ""}" style="--c:${PHASE_COL[PHASES.indexOf(x.name)]}" data-ph="${esc(x.name)}" data-from="${w.from}" data-dl="${w.deload ? 1 : ""}"></div>`).join("")}</div>`).join("")}</div>
    <div class="labs">${groups.map((x, gi) => `<div class="${gi === 0 ? "cur" : ""}" style="flex:${x.weeks.length}" title="${esc(x.name)}">${esc(x.weeks.length / total < 0.2 ? PHASE_SHORT[x.name] || x.name : x.name)}<small>${wk(x.weeks.length)}</small></div>`).join("")}</div>
    <div class="ends"><span>Diese Woche</span><span>${esc(fmtDate(t(g.date)))}</span></div></div>
    ${deload ? `<p class="note" style="font-size:12px;margin-top:6px">Blasse Kästchen = Entlastungswoche (weniger Umfang).</p>` : ""}`;
}
function bindTimeline(host) {
  host.querySelectorAll(".ptl .grp > div").forEach(d => {
    scrub(d, e => showTip(e, "Woche ab " + fmtDate(+d.dataset.from), [{ k: "Phase", v: d.dataset.ph, color: d.style.getPropertyValue("--c") },
      ...(d.dataset.dl ? [{ k: "Entlastung", v: "ja" }] : []), ...(d.classList.contains("cur") ? [{ k: "", v: "diese Woche" }] : [])]));
    unscrub(d, hideTip);
  });
}
function goalHeader(g, timeline = true) {
  const meta = [g.sport && GOAL_SPORT[g.sport] && GOAL_SPORT[g.sport].name, g.date && fmtDate(t(g.date)), g.date && weeksTxt(g.weeks_left), g.target && `Ziel ${g.target}`,
    g.type === "strength" && g.strength_days && `${g.strength_days}× Kraft pro Woche`].filter(Boolean).map(esc).join(" · ");
  const tags = [g.type === "balanced" ? "" : `<span class="tag">${esc((GOAL_TYPE[g.type] || {}).name || g.type)}</span>`, g.phase ? `<span class="tag lv" style="--c:${PHASE_COL[PHASES.indexOf(g.phase)] || "var(--q3)"}"><i></i>Phase ${esc(g.phase)}</span>` : "",
    g.deload ? `<span class="tag">Entlastungswoche</span>` : ""].join("");
  return `<div class="ghead"><span class="sic">${goalIcon(g)}</span><div>
      <div class="kicker">${g.type === "balanced" ? "Fokus" : "Dein Ziel"}</div>
      <div class="gt">${esc(goalName(g))}</div>${meta ? `<div class="gm">${meta}</div>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}</div></div>
    ${g.focus_text ? `<p class="gfocus">${tx(g.focus_text)}</p>` : ""}
    ${timeline ? phaseTimeline(g) : ""}`;
}

// Heute: dezente Zielzeile bzw. „Ziel festlegen“, dazu frische Zonen-Änderungen als Chip
const ZNAME = {
  ftp: { l: "FTP", f: v => nf(v) + " W", up: true }, lthr: { l: "Laktatschwelle (Puls)", f: v => nf(v) + " bpm", up: true },
  lt_pace: { l: "Laktatschwelle (Tempo)", f: v => clock(v) + " /km", up: false }, css: { l: "CSS", f: v => clock(v) + " /100 m", up: false },
  hrmax: { l: "HFmax", f: v => nf(v) + " bpm", up: true }, hr_zones: { l: "HF-Zonen", f: v => Array.isArray(v) ? v.join("/") : String(v), up: true },
};
const zKey = n => { const k = String(n || "").toLowerCase().replace(/[\s-]/g, "_"); return ZNAME[k] ? k : /pace|tempo/.test(k) ? "lt_pace" : /lthr|laktat|schwelle/.test(k) ? "lthr" : /max/.test(k) ? "hrmax" : /zone/.test(k) ? "hr_zones" : k; };
const zFmt = (name, v) => v == null ? "–" : ZNAME[zKey(name)] ? ZNAME[zKey(name)].f(v) : esc(String(v));
const zLabel = name => (ZNAME[zKey(name)] || { l: name }).l;
const prFmtLabel = (label, v) => /Farthest/.test(label) ? nf(v / 1000, 1) + " km" : /Elevation/.test(label) ? nf(v) + " m" : /Power/.test(label) ? nf(v) + " W" : clock(v);
const hLabel = h => h.name === "record" ? "Bestwert: " + (PR_DE[h.label] || String(h.label || "")) : zLabel(h.name);
const hFmt = (h, v) => h.name === "record" ? (v == null ? "–" : prFmtLabel(String(h.label || ""), v)) : zFmt(h.name, v);
function recentZoneChanges(days = 7) {
  const H = G.zones && G.zones.history;
  if (!Array.isArray(H)) return [];
  const ref = todayRef();
  return H.filter(h => h && h.date && h.name !== "record" && ref - t(String(h.date).slice(0, 10)) <= days * DAY && ref - t(String(h.date).slice(0, 10)) >= -DAY)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function renderGoalTop(T) {
  const host = $id("hGoal"), g = currentGoal();
  const chev = `<svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
  let html = g ? `<a class="goalline" href="#mehr/ziel">${goalIcon(g)}<span>${esc(goalText(g)).replace(/^(Ziel|Fokus): ([^·]+?)( ·|$)/, "$1: <b>$2</b>$3")}</span>${chev}</a>`
    : `<a class="goalline set" href="#mehr/ziel">${IC.plus}<span>Ziel festlegen</span>${chev}</a>`;
  const seen = new Set();
  recentZoneChanges().forEach(h => {
    const k = zKey(h.name); if (seen.has(k) || seen.size >= 3) return; seen.add(k);
    const v = Array.isArray(h.new) ? "" : `: <b>${esc(zFmt(h.name, h.new))}</b>`;
    html += `<a class="goalline chg" href="#mehr/profil" title="${esc(`${zLabel(h.name)} ${zFmt(h.name, h.old)} → ${zFmt(h.name, h.new)}${h.source ? " · " + h.source : ""}`)}">${IC.trend}<span>Neue ${esc(zLabel(h.name))}${v}</span></a>`;
  });
  host.innerHTML = html;
}

// Wochenrückblick
function reviewRows(R) {
  // by_sport: {Name: min erledigt} (oder {planned, done}); planned_by: {Name: min geplant}
  const PB = R.planned_by && typeof R.planned_by === "object" && Object.keys(R.planned_by).length ? R.planned_by : null;
  const names = [...new Set([...Object.keys(R.by_sport || {}), ...Object.keys(PB || {})])];
  const rows = names.map(name => {
    const v = (R.by_sport || {})[name], o = v != null && typeof v === "object" ? v : { done: v };
    let planned = o.planned ?? o.plan ?? o.planned_min ?? null;
    if (planned == null && PB) planned = PB[name] ?? 0;
    const done = o.done ?? o.done_min ?? o.min ?? 0;
    return { name, k: sportKey(name), planned, done: done || 0 };
  }).filter(r => r.done || r.planned);
  const ord = ["swim", "bike", "run", "gym", "golf", "tennis", "ski", "other"];
  return rows.sort((a, b) => ord.indexOf(a.k) - ord.indexOf(b.k));
}
// Zeilen „Plan/Erledigt je Sportart“ – bei nur einer Sportart eine Kennzahl statt eines einzelnen Balkens
function sportRows(rows, hasPlan) {
  if (rows.length === 1 && !hasPlan) { const r = rows[0], g = groupByKey[r.k] || groupByKey.other; return singleStat({ label: r.name, value: durHtml(r.done), icon: SPORT_IC[r.k] || g.ic, color: g.color }); }
  const max = Math.max(1, ...rows.map(r => Math.max(r.done, r.planned || 0)));
  return `<div class="pvd">${rows.map(r => {
    const g = groupByKey[r.k] || groupByKey.other;
    const pW = r.planned != null ? 100 * r.planned / max : 0, dW = 100 * r.done / max;
    return `<div class="row" style="--c:${g.color}" data-n="${esc(r.name)}" data-p="${r.planned ?? ""}" data-d="${r.done}">
      <span class="l">${spi(r.k)}<span>${esc(r.name)}</span></span>
      <div class="trk">${r.planned != null ? `<i class="p" style="width:${pW}%"></i>` : ""}${r.done ? `<i class="d${hasPlan ? "" : " solo"}" style="width:${Math.max(dW, 1.5)}%"></i>` : ""}</div>
      <span class="val"><b>${hm(r.done)}</b>${r.planned != null ? ` / ${hm(r.planned)}` : ""}</span></div>`;
  }).join("")}</div>`;
}
function reviewCard(R, extra = "") {
  const rows = reviewRows(R), hasPlan = rows.some(r => r.planned);
  const pct = R.planned_min ? Math.round(100 * (R.done_min || 0) / R.planned_min) : null;
  const sleepH = R.sleep_avg == null ? null : R.sleep_avg > 24 ? R.sleep_avg / 60 : R.sleep_avg;
  const fz = R.form != null ? { ...formZone(R.form), ...(R.form_label ? { w: R.form_label } : {}) } : null;
  const stat = (l, v, foot) => `<div class="rstat"><div class="fl">${l}</div><div class="v">${v}</div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;
  const stats = [
    stat("Trainingszeit", R.done_min != null ? durHtml(R.done_min) : "–", R.planned_min ? `von ${hm(R.planned_min)} geplant${pct != null ? ` · ${pct} %` : ""}` : ""),
    R.sessions_planned != null || R.sessions_done != null ? stat("Einheiten", `${nf(R.sessions_done)}${R.sessions_planned ? `<small>von ${nf(R.sessions_planned)}</small>` : ""}`, R.sessions_planned ? "" : "ohne Plan für diese Woche") : "",
    R.fitness_delta != null ? stat("Fitness", signed(R.fitness_delta), "Veränderung zur Vorwoche") : "",
    fz ? stat("Form", signed(R.form), `<span class="sdot" style="--c:${fz.c};width:8px;height:8px;margin-right:4px"></span>${fz.w}`) : "",
  ].join("");
  const sub = [R.load != null && `Belastung ${nf(R.load)}`, R.rhr_avg != null && `Ruhepuls Ø ${nf(R.rhr_avg)} bpm`, sleepH != null && `Schlaf Ø ${hm(sleepH * 60)}`].filter(Boolean).join(" · ");
  const other = (R.other || []).filter(o => o && o.title);
  return `<article class="card" id="reviewCard">
    <h3 class="chead">${IC.check}Wochenrückblick<span class="r muted" style="font-size:0.765rem;font-variant-numeric:tabular-nums">${esc(R.week || "")}${R.from && R.to ? ` · ${shortDate(R.from)}–${shortDate(R.to)}` : ""}</span></h3>
    <div class="rstats">${stats}</div>
    ${sub ? `<p class="pf" style="margin:8px 0 0;font-size:13px;color:var(--text-secondary)">${esc(sub)}</p>` : ""}
    ${rows.length ? `<div class="subhead">${hasPlan ? "Plan und Erledigt je Sportart" : "Erledigt je Sportart"}</div>
      ${hasPlan ? `<div class="legend" style="margin:10px 0 0"><span><i class="lgbox" style="--c:var(--text-secondary)"></i>Erledigt</span><span><i class="lgbox p" style="--c:var(--text-secondary)"></i>Geplant</span></div>` : ""}
      ${sportRows(rows, hasPlan)}` : ""}
    ${other.length ? `<div class="subhead">Außerdem</div><ul class="rlist">${other.map(o => `<li><span>${esc(o.title)}<div class="meta">${o.load != null ? `Belastung ${nf(o.load)}` : ""}</div></span><span class="num" style="font-size:14px">${o.min != null ? hm(o.min) : ""}</span></li>`).join("")}</ul>` : ""}
    ${extra}
    ${R.nutrition ? `<div class="subhead">Ernährung</div><p class="pf" style="margin:8px 0 0;font-size:13px;color:var(--text-secondary)">${esc([
      `${R.nutrition.logged_days}/7 Tage eingetragen`, R.nutrition.fueling_n ? `Fueling ${R.nutrition.fueling_yes}/${R.nutrition.fueling_n}` : "",
      R.nutrition.full_days ? `KH-Minimum ${R.nutrition.carbs_ok}/${R.nutrition.full_days} · Eiweiß ${R.nutrition.protein_ok}/${R.nutrition.full_days}` : R.nutrition.protein_meals_avg != null ? `Eiweiß Ø ${nf(R.nutrition.protein_meals_avg, 1)} Mahlzeiten` : "",
      R.nutrition.water_l_avg != null ? `Trinken Ø ${nf(R.nutrition.water_l_avg, 1)} l` : ""].filter(Boolean).join(" · "))}</p>
      ${R.nutrition.tip ? `<div class="hint" style="margin-top:8px">${IC.info}<span>${esc(R.nutrition.tip)}</span></div>` : ""}` : ""}
    ${(R.highlights || []).length ? `<div class="subhead">Highlights</div><ul class="why" style="margin-top:8px">${R.highlights.map(h => `<li>${tx(h)}</li>`).join("")}</ul>` : ""}
    ${R.next_focus ? `<div class="hint" style="margin-top:14px">${IC.trend}<span><b>Nächste Woche:</b> ${tx(R.next_focus)}</span></div>` : ""}
  </article>`;
}
function bindReview(host) {
  host.querySelectorAll(".pvd .row").forEach(r => {
    const p = r.dataset.p === "" ? null : +r.dataset.p, d = +r.dataset.d, c = r.style.getPropertyValue("--c");
    scrub(r, e => showTip(e, r.dataset.n, [{ k: "Erledigt", v: hm(d), color: c }, ...(p != null ? [{ k: "Geplant", v: hm(p) }, { k: "Anteil", v: p ? nf(100 * d / p) + " %" : "–" }] : [])]));
    unscrub(r, hideTip);
  });
}
function renderReviewToday(T) {
  const host = $id("hReview"), R = T && T.review;
  const show = !!R && [6, 0].includes(wdi(todayRef()));  // Sonntag/Montag oben auf Heute, sonst unter dem Wochenplan
  host.hidden = !show;
  host.innerHTML = show ? reviewCard(R) : "";
  if (show) bindReview(host);
}

// Verpasste Einheiten & andere Aktivitäten
const COUNTS = { locker: "easy", mittel: "moderate", intensiv: "hard" };
const countsBadge = c => { const L = LEVEL[COUNTS[c]] || LEVEL.easy; return `<span class="badge"><i style="background:${L.color}"></i>zählt als ${esc(c || "locker")}</span>`; };
function otherLoadHint(T) {
  const ref = todayRef();
  const recent = ((T && T.other_load) || []).filter(o => o && o.title && o.date && ref - t(o.date) <= DAY && ref - t(o.date) >= 0);
  if (!recent.length) return "";
  return `<div class="hint" style="margin-top:12px">${IC.info}<span>${recent.map(o => `<b>${esc(o.title)}</b> ${(d => /^(Heute|Gestern)$/.test(d) ? d.toLowerCase() : "am " + d)(relDay(o.date, ref))} zählt als ${esc(o.counts_as || "locker")}`).join(" · ")} – fließt in die Planung ein.</span></div>`;
}
function renderWeekTop(T) {
  const host = $id("wTop"), ref = todayRef(), out = [];
  const g = currentGoal();
  if (g) out.push(`<article class="card" id="wGoal">${goalHeader(g)}</article>`);
  const missed = ((T && T.missed) || []).filter(m => m && m.title);
  if (missed.length) {
    const txt = missed.map(m => `${m.date ? esc(relDay(m.date, ref)) : "Verpasst"} verpasst: <b>${esc(m.title)}</b>`).join(" · ");
    out.push(`<div class="hint" style="margin-top:0">${IC.missed}<span>${txt} – Woche neu geplant.</span></div>`);
  }
  const other = ((T && T.other_load) || []).filter(o => o && o.title);
  if (other.length) out.push(`<article class="card"><h3 class="chead">${IC.pulse}Außerhalb des Plans</h3>
    <p class="desc" style="margin-bottom:0">Andere Aktivitäten fließen in die Belastung ein</p>
    <ul class="rlist">${other.map(o => `<li><span>${esc(o.title)}<div class="meta">${o.date ? esc(relDay(o.date, ref)) : ""}${o.load != null ? ` · Belastung ${nf(o.load)}` : ""}</div></span>${countsBadge(o.counts_as)}</li>`).join("")}</ul></article>`);
  host.innerHTML = out.join("");
  host.hidden = !out.length;
  bindTimeline(host);
}

// Zonen (Mehr › Profil)
const ZONE_Q = n => n === 7 ? ["var(--q1)", "var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)", "var(--q6)", "var(--q6)"] : ["var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)", "var(--q6)"];
const zoneList = (rows) => { const q = ZONE_Q(rows.length); return `<div class="zones">${rows.map((r, i) => `<span class="zn">Z${i + 1} ${esc(r.n)}</span><div class="bar zb" style="width:${Math.max(4, Math.min(100, r.w))}%;--c:${q[i]}"></div><span class="zv">${esc(r.v)}</span>`).join("")}</div>`; };
function renderZones() {
  const card = $id("zoneCard"), Z = G.zones, c = Z && Z.current;
  if (!c) { card.hidden = true; return; }
  card.hidden = false;
  const hz = Array.isArray(c.hr_zones) && c.hr_zones.length >= 6 ? c.hr_zones.slice(0, 6)
    : Array.isArray(c.hr_zones) && c.hr_zones.length === 5 && c.hrmax ? [...c.hr_zones, c.hrmax] : null;
  if (hz) { $id("hrzCard").hidden = true; $id("hrzCard").parentElement.classList.replace("g3", "g2"); }  // ersetzt die Garmin-Profilzonen
  const stat = (l, v, unit, foot) => v == null ? "" : `<div class="zstat"><div class="fl">${l}</div><div class="v">${v}<small>${unit}</small></div>${foot ? `<div class="foot">${esc(foot)}</div>` : ""}</div>`;
  const w = G.profile.weight;
  const parts = [];
  if (hz) {
    const names = ["Aufwärmen", "Leicht", "Aerob", "Schwelle", "Maximum"];
    parts.push(`<div><h4>${IC.heart}Puls</h4>${zoneList(names.map((n, i) => ({ n, w: 100 * hz[i + 1] / hz[5], v: `${hz[i]}–${hz[i + 1]}` })))}</div>`);
  }
  if (c.ftp) {
    const P = [[0, .55, "Erholung"], [.56, .75, "Grundlage"], [.76, .9, "Tempo"], [.91, 1.05, "Schwelle"], [1.06, 1.2, "VO2max"], [1.21, 1.5, "Anaerob"], [1.51, null, "Sprint"]];
    parts.push(`<div><h4>${IC.bolt}Power <span class="muted" style="font-weight:400">· FTP ${nf(c.ftp)} W</span></h4>${zoneList(P.map(([lo, hi, n]) => ({
      n, w: hi ? 100 * hi / 1.6 : 100, v: hi == null ? `> ${Math.round(c.ftp * 1.5)} W` : lo === 0 ? `< ${Math.round(c.ftp * hi) + 1} W` : `${Math.round(c.ftp * lo)}–${Math.round(c.ftp * hi)} W` })))}</div>`);
  }
  if (c.lt_pace) {
    const L = c.lt_pace, R = [[1.29, null, "Erholung"], [1.14, 1.29, "Grundlage"], [1.06, 1.13, "Tempo"], [0.99, 1.05, "Schwelle"], [null, 0.99, "Intervall"]];
    parts.push(`<div><h4>${IC.run}Lauf-Pace <span class="muted" style="font-weight:400">· Schwelle ${clock(L)} /km</span></h4>${zoneList(R.map(([fa, sl, n]) => ({  // Faktoren auf die Zeit pro km: größer = langsamer
      n, w: fa ? 100 * 0.9 / fa : 100, v: sl == null ? `über ${clock(L * fa)}` : fa == null ? `unter ${clock(L * sl)}` : `${clock(L * fa)}–${clock(L * sl)}` })))}</div>`);
  }
  if (c.css) {
    const S = c.css, R = [[8, null, "Grundlage"], [3, 7, "Ausdauer"], [-2, 2, "Schwelle"], [null, -3, "Schnell"]];
    parts.push(`<div><h4>${IC.swim}Schwimmen <span class="muted" style="font-weight:400">· CSS ${clock(S)} /100 m</span></h4>${zoneList(R.map(([a, b, n], i) => ({
      n, w: [70, 80, 90, 100][i], v: b == null ? `über ${clock(S + a)}` : a == null ? `unter ${clock(S + b)}` : `${clock(S + a)}–${clock(S + b)}` })))}</div>`);
  }
  const H = (Array.isArray(Z.history) ? Z.history : []).filter(h => h && h.date).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const src = s => s ? String(s) : "";
  card.innerHTML = `<h3 class="chead">${IC.pulse}Trainingszonen${c.updated ? `<span class="r muted" style="font-size:12px">zuletzt aktualisiert ${esc(fmtDate(t(String(c.updated).slice(0, 10))))}</span>` : ""}</h3>
    <p class="desc" style="margin-bottom:0">Grundlage für Garvis-Workouts, Garmin und Zwift</p>
    <div class="zstats">
      ${stat("FTP", c.ftp != null ? nf(c.ftp) : null, "W", [c.ftp_source, c.ftp && w ? nf(c.ftp / w, 2) + " W/kg" : ""].filter(Boolean).join(" · "))}
      ${stat("Laktatschwelle", c.lthr != null ? nf(c.lthr) : null, "bpm", "")}
      ${stat("Schwellen-Pace", c.lt_pace ? clock(c.lt_pace) : null, "/km", "")}
      ${stat("CSS", c.css ? clock(c.css) : null, "/100 m", "Schwimm-Schwelle")}
      ${stat("HFmax", c.hrmax != null ? nf(c.hrmax) : hz ? nf(hz[5]) : null, "bpm", "")}
    </div>
    ${parts.length ? `<div class="zgrid">${parts.join("")}</div>` : ""}
    ${H.length ? `<details class="more"${recentZoneChanges().length ? " open" : ""}><summary>Änderungsverlauf <span class="n">· ${H.length}</span></summary>
      <ul class="rlist">${H.slice(0, 12).map(h => `<li><span>${esc(hLabel(h))}<div class="meta">${esc(fmtDate(t(String(h.date).slice(0, 10))))}${src(h.source) ? " · " + esc(src(h.source)) : ""}</div></span>
        <span class="num" style="font-size:14px;text-align:right">${h.old != null ? `<span class="muted" style="font-weight:400">${esc(hFmt(h, h.old))} → </span>` : ""}${esc(hFmt(h, h.new))}</span></li>`).join("")}</ul></details>` : ""}`;
}

// ---------- Mehr › Ziel & Fokus: settings.json im Repo garvis-data (GitHub Contents API) ----------
const utf8b64 = s => { const u = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < u.length; i += 0x8000) o += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(o); };
const b64utf8 = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, "")), c => c.charCodeAt(0)));
async function gh(url, opt = {}) {
  const tok = window.GARVIS && window.GARVIS.token && window.GARVIS.token();
  if (!tok) return { status: -1 };
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { cache: "no-store", ...opt, signal: ctl.signal,
      headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", ...(opt.body ? { "Content-Type": "application/json" } : {}) } });
    let body = null;
    try { body = await res.json(); } catch (e) { /* 204 o. Ä. */ }
    const rl = res.headers.get("x-ratelimit-remaining") === "0" || !!res.headers.get("retry-after") || res.status === 429;
    noteTokenExpiry(res.headers.get("github-authentication-token-expiration"));
    return { status: res.status, ok: res.ok, body, rl };
  } catch (e) { return { status: 0 }; } finally { clearTimeout(to); }
}
// Ablaufdatum des Fine-grained-Schlüssels: Antwort-Header (falls GitHub ihn per CORS freigibt) oder selbst eingetragen.
// localStorage garvis.tokenExp = { date: "YYYY-MM-DD", src: "github" | "manual" }
const TOKEN_EXP = "garvis.tokenExp";
function noteTokenExpiry(h) {
  const m = h && String(h).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return;
  const cur_ = readLocal(TOKEN_EXP);
  if (!cur_ || cur_.date !== m[1] || cur_.src !== "github") writeLocal(TOKEN_EXP, { date: m[1], src: "github" });
}
const tokenExp = () => { const x = readLocal(TOKEN_EXP); return x && isIsoDay(x.date) ? x : null; };
const tokenDaysLeft = () => { const x = tokenExp(); return x ? Math.round((t(x.date) - t(localIso())) / DAY) : null; };
async function fetchSettings() {
  const r = await gh(SETTINGS_URL);
  if (r.status === 200 && r.body && r.body.content != null) {
    try { const data = JSON.parse(b64utf8(r.body.content)); writeLocal(SET_KEY, data); return { ok: true, data, sha: r.body.sha }; }
    catch (e) { return { ok: true, data: null, sha: r.body.sha, broken: true }; }
  }
  if (r.status === 404) return { ok: true, data: null, sha: null };
  return { ok: false, r };
}
async function putSettings(data) {
  let st = await fetchSettings();
  if (!st.ok) return st.r;
  // mit dem aktuellen Stand zusammenführen: andere Schlüssel (z. B. "locations" aus strength.js) bleiben erhalten
  let merged;
  const put = st_ => { merged = { ...(st_.data && typeof st_.data === "object" && !Array.isArray(st_.data) ? st_.data : {}), ...data };
    return gh(SETTINGS_URL, { method: "PUT", body: JSON.stringify({ message: "Garvis: Einstellungen", content: utf8b64(JSON.stringify(merged, null, 2) + "\n"), ...(st_.sha ? { sha: st_.sha } : {}) }) }); };
  let r = await put(st);
  if (r.status === 409 || r.status === 422) {  // inzwischen geändert → frischen Stand holen und einmal wiederholen
    st = await fetchSettings();
    if (st.ok) r = await put(st);
  }
  r.merged = merged;
  return r;
}
// Doppelte Starts (zweimal getippt, mehrere Änderungen kurz hintereinander) zusammenfassen: ein Lauf, der in den
// letzten 45 s angestoßen wurde, hat beim Start noch nicht ausgecheckt und übernimmt daher auch die neuesten Änderungen.
const DISPATCH_AT = "garvis.dispatchAt";
async function dispatchReplan() {
  const last = +localStorage.getItem(DISPATCH_AT) || 0;
  if (Date.now() - last < 45000) { watchReplan(); return { status: 204, ok: true, merged: true }; }
  const post = force => gh(DISPATCH_URL, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { force } }) });
  let r = await post(true);
  if (r.status === 422) r = await post("true");  // je nach Workflow-Definition erwartet GitHub den Wert als Text
  if (r.status === 204 || r.ok) { localStorage.setItem(DISPATCH_AT, String(Date.now())); watchReplan(); }  // alle ~30 s nach neuem Stand schauen (gilt auch für actions.js)
  return r;
}
const WRITE_HELP = "Dein GitHub-Schlüssel darf noch nicht schreiben: auf github.com › Settings › Fine-grained tokens › Garvis-Schlüssel › Repository permissions › Contents auf ‚Read and write‘ stellen. Danach hier noch einmal speichern.";
const ACTIONS_HELP = "Dafür braucht dein Schlüssel zusätzlich Zugriff auf das Repo „garvis“: auf github.com › Settings › Fine-grained tokens › Garvis-Schlüssel › Repository access „garvis“ hinzufügen und Repository permissions › Actions auf ‚Read and write‘ stellen. Ohne das plant Garvis spätestens morgen früh neu.";
const errText = (r, what) => r.status === -1 ? "Kein GitHub-Schlüssel geladen – App neu öffnen." : r.status === 0 ? `Keine Verbindung – ${what} nicht möglich. Später erneut versuchen.`
  : r.status === 401 ? "Schlüssel ungültig oder abgelaufen – unter Mehr › GitHub-Schlüssel › „Neu eingeben“ einen neuen eingeben." : r.rl ? "GitHub-Limit erreicht – in ein paar Minuten erneut versuchen."
  : `GitHub meldet Fehler ${r.status}${r.body && r.body.message ? ` (${r.body.message})` : ""}.`;

const GS = { built: false, loaded: false, loading: false, dirty: false, sha: null, data: null, saving: false };
function setMsg(kind, icon, html) {
  const m = $id("goalMsg");
  if (!html) { m.hidden = true; m.innerHTML = ""; return; }
  m.hidden = false; m.className = `hint ${kind}`; m.innerHTML = `${icon}<span>${html}</span>`;
}
const formType = () => (document.querySelector('#goalForm input[name="gtype"]:checked') || {}).value || "balanced";
const formSport = () => (document.querySelector('#goalForm input[name="gsport"]:checked') || {}).value || null;
// Fokus Kraft: Kraftaufbau (Hypertrophie/Kraft) oder Kraftausdauer – steuert Sätze, Wiederholungen und Pausen
const STRENGTH_MODE = {
  hypertrophy: { name: "Kraftaufbau", info: "Muskel- und Kraftaufbau: 3–5 Sätze × 6–12 Wdh., RPE 7–9, 1,5–3 min Pause, Gewicht steigt Woche für Woche." },
  endurance: { name: "Kraftausdauer", info: "Kraftausdauer: 2–4 Sätze × 12–25 Wdh. mit kurzen Pausen (30–60 s), teils als Zirkel." },
};
const formMode = () => (document.querySelector('#goalForm input[name="gmode"]:checked') || {}).value || "hypertrophy";
function updateGoalForm() {
  const ty = formType(), sp = formSport(), withEvent = ty === "race" || ty === "performance";
  $id("goalRace").hidden = !withEvent; $id("goalStrength").hidden = ty !== "strength";
  $id("goalEventLbl").textContent = ty === "performance" ? "Leistungsziel" : "Name / Distanz";
  $id("goalEvent").placeholder = ty === "performance" ? "z. B. FTP 260 W" : "z. B. Olympische Distanz";
  $id("goalTargetLbl").innerHTML = (ty === "performance" ? "Zielwert" : "Zielzeit") + " <i>optional</i>";
  $id("goalTarget").placeholder = ty === "performance" ? "z. B. 260 W" : "z. B. 2:30 h";
  const sug = withEvent ? ((GOAL_SUGG[ty] || {})[sp || "triathlon"] || []) : [];
  $id("goalSugg").innerHTML = sug.map(x => `<button type="button" data-v="${esc(x)}">${esc(x)}</button>`).join("");
  $id("goalEventList").innerHTML = sug.map(x => `<option value="${esc(x)}"></option>`).join("");
  updateCourses(ty, sp);
}
// ---------- Garmin-Strecken im Ziel-Formular (GARMIN.courses → settings.goal.bike_course_id / run_course_id) ----------
// Alles optional: ohne GARMIN.courses erscheint ein Hinweis, eine gespeicherte ID bleibt dann unverändert erhalten.
const COURSE_SPORT = { bike: { name: "Rad", color: "var(--sp-bike)" }, run: { name: "Laufen", color: "var(--sp-run)" }, other: { name: "Sonstige", color: "var(--sp-other)" } };
const courseList = () => (Array.isArray(G.courses) ? G.courses : []).filter(c => c && c.id != null && c.id !== "")
  .map(c => ({ ...c, id: String(c.id), sport: COURSE_SPORT[c.sport] ? c.sport : "other" }));
const courseById = id => id == null || id === "" ? null : courseList().find(c => c.id === String(id)) || null;
const courseMeta = c => [c.distance_km != null && `${nf(c.distance_km, c.distance_km < 100 ? 1 : 0)} km`, c.gain_m != null && `${nf(c.gain_m)} hm`, c.loop ? "Rundkurs" : ""].filter(Boolean).join(" · ");
// Mini-Höhenprofil (Fläche, ohne Achsen). Flache Strecken bleiben flach: mindestens 80 m Höhenspanne.
function miniProfile(profile, { w = 72, h = 24, color = "var(--text-secondary)", cls = "minip" } = {}) {
  const P = (Array.isArray(profile) ? profile : []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
  if (P.length < 2) return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h - 1}" y2="${h - 1}" stroke="var(--grid)" stroke-width="1"/></svg>`;
  const x0 = P[0][0], x1 = P[P.length - 1][0] || 1, ys = P.map(p => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 80) { const mid = (hi + lo) / 2; lo = mid - 40; hi = mid + 40; }
  const X = v => ((v - x0) / ((x1 - x0) || 1) * w).toFixed(1), Y = v => (h - 2 - (v - lo) / (hi - lo) * (h - 4)).toFixed(1);
  const line = P.map((p, i) => (i ? "L" : "M") + X(p[0]) + "," + Y(p[1])).join("");
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${line}L${w},${h}L0,${h}Z" fill="${color}" fill-opacity=".14"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const CP_KINDS = [{ kind: "bike", id: "gcBike", label: "Radstrecke (Garmin)", key: "bike_course_id" }, { kind: "run", id: "gcRun", label: "Laufstrecke (Garmin)", key: "run_course_id" }];
const CP = { bike: { val: null, filter: "bike", q: "" }, run: { val: null, filter: "run", q: "" } };
function cpPreview(kind) {
  const box = $id(kind === "bike" ? "gcBike" : "gcRun"); if (!box) return;
  const v = CP[kind].val, c = courseById(v), sp = COURSE_SPORT[kind];
  box.querySelector(".cp-sel").innerHTML = c
    ? `${miniProfile(c.profile, { w: 300, h: 34, color: sp.color, cls: "minip cp-big" })}<span class="cp-txt"><b>${esc(c.name || "Strecke")}</b><small>${esc([courseMeta(c), c.loss_m != null ? `${nf(c.loss_m)} m Abstieg` : ""].filter(Boolean).join(" · "))}</small></span>`
    : v ? `<span class="cp-txt"><b>Gespeicherte Strecke</b><small>Nicht mehr unter den Garmin-Strecken – bleibt gespeichert, bis du eine andere wählst</small></span>`
    : `<span class="cp-txt"><b class="muted">Keine Strecke</b><small>Rennplanung ohne Streckenprofil</small></span>`;
}
function cpList(kind) {
  const box = $id(kind === "bike" ? "gcBike" : "gcRun"); if (!box) return;
  const st = CP[kind], q = st.q.trim().toLowerCase(), all = courseList();
  const list = all.filter(c => (st.filter === "all" || c.sport === st.filter) && (!q || String(c.name || "").toLowerCase().includes(q)));
  const row = (val, name, meta, svg) => `<li><label class="cp-row"><input type="radio" name="gc${kind}" value="${esc(val)}"${(st.val || "") === val ? " checked" : ""}>${svg}<span class="cp-txt"><b>${esc(name)}</b>${meta ? `<small>${esc(meta)}</small>` : ""}</span></label></li>`;
  box.querySelector(".cp-list").innerHTML = row("", "Keine Strecke", "", `<span class="minip cp-none" aria-hidden="true">–</span>`)
    + list.map(c => row(c.id, c.name || "Strecke", [st.filter === "all" ? COURSE_SPORT[c.sport].name : "", courseMeta(c)].filter(Boolean).join(" · "), miniProfile(c.profile, { color: COURSE_SPORT[c.sport].color }))).join("")
    + (list.length ? "" : `<li class="cp-empty muted">${q ? `Keine Strecke mit „${esc(st.q.trim())}“` : "Keine Strecken dieser Sportart"}${st.filter !== "all" ? " – „Alle“ zeigt jede Sportart" : ""}</li>`);
  box.querySelectorAll(".cp-f button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === st.filter)));
}
function buildCoursePickers() {
  const host = $id("goalCourses"); if (!host) return;
  const all = courseList(), cnt = s => all.filter(c => s === "all" || c.sport === s).length;
  host.innerHTML = CP_KINDS.map(k => `<div class="field cpick" id="${k.id}" data-kind="${k.kind}" hidden>
      <span class="kicker">${k.label} <i>optional</i></span>
      <div class="cp-head"><div class="cp-sel"></div>${all.length ? `<button type="button" class="txtbtn cp-tog" aria-expanded="false" aria-controls="${k.id}P">Wählen</button>` : ""}</div>
      ${all.length ? `<div class="cp-panel" id="${k.id}P" hidden>
        <input type="search" class="cp-q" placeholder="Strecke suchen …" aria-label="${k.label} suchen" autocomplete="off" enterkeyhint="search">
        <div class="cp-f" role="group" aria-label="Sportart">${[[k.kind, COURSE_SPORT[k.kind].name], [k.kind === "bike" ? "run" : "bike", COURSE_SPORT[k.kind === "bike" ? "run" : "bike"].name], ["other", "Sonstige"], ["all", "Alle"]]
          .filter(([s]) => s === k.kind || s === "all" || cnt(s)).map(([s, n]) => `<button type="button" data-f="${s}" aria-pressed="false">${n} <span>${cnt(s)}</span></button>`).join("")}</div>
        <ul class="cp-list" role="radiogroup" aria-label="${k.label}"></ul></div>` : ""}
    </div>`).join("") + (all.length ? "" : `<div class="field"><span class="kicker">Strecke (Garmin) <i>optional</i></span><p class="muted cp-no">Noch keine geplanten Strecken aus Garmin. Strecken in Garmin Connect unter Training › Strecken anlegen – hier kannst du sie nach dem nächsten Datenabgleich für die Rennplanung wählen.</p></div>`);
  host.querySelectorAll(".cpick").forEach(box => {
    const kind = box.dataset.kind, st = CP[kind], tog = box.querySelector(".cp-tog"), panel = box.querySelector(".cp-panel");
    if (!panel) return;
    // Suche/Filter sind keine Formularwerte → nicht als Änderung zählen
    ["input", "change"].forEach(ev => box.querySelector(".cp-q").addEventListener(ev, e => { e.stopPropagation(); if (ev === "input") { st.q = e.target.value; cpList(kind); } }));
    tog.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; tog.setAttribute("aria-expanded", String(open)); tog.textContent = open ? "Fertig" : st.val ? "Ändern" : "Wählen"; if (open) cpList(kind); });
    box.querySelector(".cp-f").addEventListener("click", e => { const b = e.target.closest("button[data-f]"); if (!b) return; st.filter = b.dataset.f; cpList(kind); });
    box.querySelector(".cp-list").addEventListener("change", e => {
      const i = e.target.closest('input[type="radio"]'); if (!i) return;
      st.val = i.value || null; cpPreview(kind);
    });
  });
}
function fillCourses(g) {
  CP_KINDS.forEach(k => {
    const v = g && g[k.key] != null && g[k.key] !== "" ? String(g[k.key]) : null, st = CP[k.kind];
    st.val = v; st.q = ""; const c = courseById(v); st.filter = c && c.sport !== k.kind ? "all" : k.kind;
    const box = $id(k.id); if (!box) return;
    const q = box.querySelector(".cp-q"); if (q) q.value = "";
    const panel = box.querySelector(".cp-panel"), tog = box.querySelector(".cp-tog");
    if (panel) { panel.hidden = true; tog.setAttribute("aria-expanded", "false"); tog.textContent = v ? "Ändern" : "Wählen"; cpList(k.kind); }
    cpPreview(k.kind);
  });
}
// sichtbar bei Wettkampf mit Triathlon/Rad (Radstrecke) bzw. Triathlon/Laufen (Laufstrecke)
const courseKinds = (ty, sp) => ty !== "race" ? [] : sp === "triathlon" ? ["bike", "run"] : sp === "bike" ? ["bike"] : sp === "run" ? ["run"] : [];
function updateCourses(ty, sp) {
  const on = courseKinds(ty, sp), host = $id("goalCourses"); if (!host) return;
  host.hidden = !on.length;
  const none = !courseList().length;  // ohne Strecken nur eine bereits gespeicherte Auswahl anzeigen
  CP_KINDS.forEach(k => { const b = $id(k.id); if (b) b.hidden = !on.includes(k.kind) || (none && !CP[k.kind].val); });
}
function fillGoalForm(data) {
  const g = (data && data.goal) || {}, f = $id("goalForm");
  const ty = GOAL_TYPE[g.type] ? g.type : "balanced";
  f.querySelectorAll('input[name="gtype"]').forEach(i => { i.checked = i.value === ty; });
  f.querySelectorAll('input[name="gsport"]').forEach(i => { i.checked = i.value === g.sport; });
  const days = data && data.strength_days || 4, mode = STRENGTH_MODE[data && data.strength_mode] ? data.strength_mode : "hypertrophy";
  f.querySelectorAll('input[name="gdays"]').forEach(i => { i.checked = +i.value === days; });
  f.querySelectorAll('input[name="gmode"]').forEach(i => { i.checked = i.value === mode; });
  $id("goalModeInfo").textContent = STRENGTH_MODE[mode].info;
  $id("goalEvent").value = g.event || ""; $id("goalDate").value = g.date || ""; $id("goalTarget").value = g.target || "";
  fillCourses(g);
  updateGoalForm();
}
function collectGoal() {
  const ty = formType(), sp = formSport();
  const ev = $id("goalEvent").value.trim(), date = $id("goalDate").value || null, target = $id("goalTarget").value.trim() || null;
  const withEvent = ty === "race" || ty === "performance";
  [$id("goalEvent"), $id("goalDate")].forEach(i => i.removeAttribute("aria-invalid"));
  if (withEvent && !sp) return { err: "Bitte eine Sportart wählen." };
  if (withEvent && !ev) { $id("goalEvent").setAttribute("aria-invalid", "true"); return { err: ty === "race" ? "Bitte Name oder Distanz des Wettkampfs angeben." : "Bitte das Leistungsziel angeben, z. B. „FTP 260 W“." }; }
  if (withEvent && date && !/^\d{4}-\d\d-\d\d$/.test(date)) { $id("goalDate").setAttribute("aria-invalid", "true"); return { err: "Datum bitte als TT.MM.JJJJ wählen." }; }
  if (withEvent && date && t(date) < todayRef()) { $id("goalDate").setAttribute("aria-invalid", "true"); return { err: "Das Datum liegt in der Vergangenheit." }; }
  const days = +((document.querySelector('#goalForm input[name="gdays"]:checked') || {}).value || 4), mode = formMode();
  const ck = courseKinds(ty, sp), courseIds = { bike_course_id: ck.includes("bike") ? CP.bike.val : null, run_course_id: ck.includes("run") ? CP.run.val : null };
  return { data: {
    goal: withEvent ? { type: ty, title: ev, sport: sp, event: ev, date, target, ...courseIds }
      : { type: ty, title: ty === "strength" ? STRENGTH_MODE[mode].name : null, sport: null, event: null, date: null, target: null, bike_course_id: null, run_course_id: null },
    strength_days: ty === "strength" ? days : null,
    strength_mode: ty === "strength" ? mode : null,
    updated: new Date().toISOString(),
  } };
}
const fmtStamp = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("de-DE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr"; };
function stateLine() {
  const el_ = $id("goalState"), d = GS.data;
  el_.textContent = GS.loading ? "Lade aktuellen Stand …" : d && d.updated ? `Zuletzt gespeichert: ${fmtStamp(d.updated)}` : GS.loaded ? "Noch nichts gespeichert – Standard: Ausgeglichen" : "";
}
function renderReplan(state) {
  const host = $id("goalReplan"), web = window.GARVIS && window.GARVIS.web;
  host.hidden = !web;
  if (!web) return;
  const denied = localStorage.getItem(DISPATCH_KEY) === "denied";
  host.innerHTML = `<div><b>Jetzt neu planen</b>Plan sofort mit dem neuen Ziel berechnen lassen (dauert ein paar Minuten)</div>
    <button type="button" class="txtbtn" id="replanBtn"${state === "busy" ? " disabled" : ""}>${state === "busy" ? "Starte …" : denied ? "Erneut versuchen" : "Neu planen"}</button>
    ${state === "ok" ? `<div class="hint ok">${IC.check}<span><b>Planungslauf gestartet.</b> In etwa 5 Minuten ist der neue Plan da – Garvis lädt ihn automatisch.</span></div>`
      : state && state.err ? `<div class="hint bad">${IC.warning}<span>${esc(state.err)}</span></div>`
      : denied ? `<div class="hint">${IC.key}<span>${esc(ACTIONS_HELP)}</span></div>` : ""}`;
  $id("replanBtn").addEventListener("click", async () => {
    renderReplan("busy");
    const r = await dispatchReplan();
    if (r.status === 204 || r.ok) { localStorage.removeItem(DISPATCH_KEY); return renderReplan("ok"); }
    if ((r.status === 403 && !r.rl) || r.status === 404) { localStorage.setItem(DISPATCH_KEY, "denied"); return renderReplan(); }
    renderReplan({ err: errText(r, "Neu planen") });
  });
}
function renderGoalNow() {
  const host = $id("goalNow"), T = window.TODAY, g = T && T.goal;
  host.hidden = !(g && g.type);
  const pend = currentGoal();
  if (!host.hidden) { host.innerHTML = `${pend && pend.pending ? `<div class="hint" style="margin:0 0 14px">${IC.clock}<span><b>Neues Ziel gespeichert.</b> Dieser Stand wird beim nächsten Planungslauf ersetzt.</span></div>` : ""}<div class="kicker" style="margin-bottom:10px">Stand des letzten Planungslaufs${T.generated ? ` · ${esc(deIso(T.generated))}` : ""}</div>` + goalHeader(g).replace('<div class="kicker">Dein Ziel</div>', "").replace('<div class="kicker">Fokus</div>', ""); bindTimeline(host); }
}
function buildGoalForm() {
  $id("goalTypes").innerHTML = GOAL_TYPES.map(g => `<label class="opt"><input type="radio" name="gtype" value="${g.key}">${IC[g.ic]}<b>${g.name}</b><small>${g.d}</small></label>`).join("");
  $id("goalSports").innerHTML = GOAL_SPORTS.map(s => `<label><input type="radio" name="gsport" value="${s.key}">${IC[s.ic]}${s.name}</label>`).join("");
  $id("goalDays").innerHTML = [2, 3, 4, 5].map(n => `<label><input type="radio" name="gdays" value="${n}">${n}×</label>`).join("");
  $id("goalMode").innerHTML = Object.entries(STRENGTH_MODE).map(([k, m]) => `<label><input type="radio" name="gmode" value="${k}">${m.name}</label>`).join("");
  $id("goalMode").addEventListener("change", () => { $id("goalModeInfo").textContent = STRENGTH_MODE[formMode()].info; });
  $id("goalDays").classList.add("num");
  buildCoursePickers();
  const f = $id("goalForm");
  f.addEventListener("change", () => { GS.dirty = true; updateGoalForm(); });
  f.addEventListener("input", () => { GS.dirty = true; });
  $id("goalSugg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $id("goalEvent").value = b.dataset.v; GS.dirty = true; $id("goalEvent").removeAttribute("aria-invalid"); });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (GS.saving || !(window.GARVIS && window.GARVIS.web)) return;
    const c = collectGoal();
    if (c.err) return setMsg("bad", IC.warning, esc(c.err));
    GS.saving = true; $id("goalSave").disabled = true; $id("goalSave").textContent = "Speichere …"; setMsg("", "", "");
    const r = await putSettings(c.data);
    GS.saving = false; $id("goalSave").disabled = false; $id("goalSave").textContent = "Speichern";
    if (r.status === 200 || r.status === 201) {
      GS.data = c.data; GS.sha = r.body && r.body.content && r.body.content.sha || null; GS.dirty = false; GS.loaded = true;
      writeLocal(SET_KEY, r.merged || c.data);
      setMsg("ok", IC.check, `<b>Gespeichert.</b> Plan wird neu berechnet …`);
      stateLine(); buildMenu(); renderGoalTop(window.TODAY); renderGoalNow();
      // wie bei Status/Planänderungen: sofort neu planen lassen
      const d = await dispatchReplan();
      if (d.status === 204 || d.ok) { localStorage.removeItem(DISPATCH_KEY); setMsg("ok", IC.check, `<b>Gespeichert.</b>`); renderReplan("ok"); }
      else if ((d.status === 403 && !d.rl) || d.status === 404) { localStorage.setItem(DISPATCH_KEY, "denied"); setMsg("ok", IC.check, `<b>Gespeichert.</b> Wird beim nächsten Planungslauf berücksichtigt (spätestens morgen früh).`); renderReplan(); }
      else setMsg("ok", IC.check, `<b>Gespeichert.</b> Neuplanung konnte nicht gestartet werden – wird beim nächsten Planungslauf berücksichtigt.`);
      return;
    }
    // Nicht gespeichert: Eingaben bleiben im Formular (GS.dirty), klarer Hinweis + „Erneut versuchen“
    const retry = `<br><button type="button" class="txtbtn" data-goal-retry>Erneut versuchen</button>`;
    if ((r.status === 403 && !r.rl) || r.status === 404) return setMsg("bad", IC.key, esc(WRITE_HELP) + retry);
    setMsg("bad", r.status === 0 ? IC.clock : IC.warning, `<b>Nicht gespeichert – deine Eingaben bleiben erhalten.</b> ${esc(errText(r, "Speichern"))}${retry}`);
  });
  $id("goalMsg").addEventListener("click", e => { if (e.target.closest("[data-goal-retry]") && !GS.saving) f.requestSubmit ? f.requestSubmit() : $id("goalSave").click(); });
  // Ungespeicherte Änderungen: beim Verlassen von Ziel & Fokus nachfragen (Hash-Wechsel) bzw. beim Schließen der Seite
  addEventListener("beforeunload", e => { if (GS.dirty && !GS.saving) { e.preventDefault(); e.returnValue = ""; } });
  GS.built = true;
}
async function renderGoalSettings() {
  if (!GS.built) buildGoalForm();
  renderGoalNow();
  const web = window.GARVIS && window.GARVIS.web;
  $id("goalFs").disabled = !web; $id("goalSave").disabled = !web || GS.saving;
  if (!web) {
    if (!GS.loaded) { fillGoalForm(readLocal(SET_KEY) || (window.TODAY && window.TODAY.goal ? { goal: window.TODAY.goal } : null)); GS.loaded = true; }
    setMsg("", IC.info, "Lokal geöffnet (Datei) – Ziel &amp; Fokus lässt sich nur in der Garvis-App auf dem iPhone bzw. im Browser speichern.");
    $id("goalState").textContent = ""; renderReplan(); return;
  }
  if (!$id("goalReplan").innerHTML) renderReplan();
  if (GS.loaded || GS.loading) { stateLine(); return; }
  // Erst lokalen/Plan-Stand zeigen, dann den echten Stand aus dem Repo nachladen
  fillGoalForm(readLocal(SET_KEY) || (window.TODAY && window.TODAY.goal ? { goal: window.TODAY.goal } : null));
  GS.loading = true; stateLine();
  const r = await fetchSettings();
  GS.loading = false;
  if (r.ok) {
    GS.loaded = true; GS.sha = r.sha; GS.data = r.data;
    if (!GS.dirty) fillGoalForm(r.data || (window.TODAY && window.TODAY.goal ? { goal: window.TODAY.goal } : null));
    if (r.broken) setMsg("bad", IC.warning, "settings.json im Repo ist kein gültiges JSON – Speichern überschreibt die Datei.");
    if (!r.data) localStorage.removeItem(SET_KEY);
    buildMenu(); renderGoalNow();
  } else setMsg("bad", IC.warning, esc(errText(r.r, "Laden des aktuellen Stands")) + " Du kannst trotzdem speichern.");
  stateLine();
}

// ---------- Hitze- & Höhenanpassung (Randinfo: Fortschritt unten, Mehr › Gesundheit; nicht auf Heute) ----------
// TODAY.acclimation {heat_pct, heat_trend, altitude_m, altitude_acclim_m, date, note} hat Vorrang, sonst letzter Eintrag aus GARMIN.heat.
// Nur sichtbar, wenn ein Wert > 0 vorliegt.
const ACC_TREND = { up: "steigend", rising: "steigend", increasing: "steigend", down: "fallend", falling: "fallend", decreasing: "fallend", stable: "stabil", flat: "stabil", steady: "stabil" };
function acclimData() {
  const A = window.TODAY && window.TODAY.acclimation;
  const H = (G.heat || []).filter(h => h && h.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = H.at(-1);
  let heat = A && A.heat_pct != null ? A.heat_pct : last ? last.heatAcclimationPercentage : null;
  let trend = A && A.heat_trend ? (ACC_TREND[String(A.heat_trend).toLowerCase()] || String(A.heat_trend)) : null;
  if (!trend && last && heat != null && !(A && A.heat_pct != null)) {
    const ref = H.filter(h => t(h.date) <= t(last.date) - 7 * DAY).at(-1), r = ref && ref.heatAcclimationPercentage;
    if (r != null && last.heatAcclimationPercentage != null) trend = last.heatAcclimationPercentage > r + 2 ? "steigend" : last.heatAcclimationPercentage < r - 2 ? "fallend" : "stabil";
  }
  const altAcc = A && A.altitude_acclim_m != null ? A.altitude_acclim_m : last ? last.altitudeAcclimation : null;
  const alt = A && A.altitude_m != null ? A.altitude_m : null;
  const date = (A && A.date) || (last && last.date) || null;
  if (!(heat > 0) && !(altAcc > 0)) return null;
  return { heat: heat > 0 ? Math.min(100, Math.round(heat)) : null, trend, altAcc: altAcc > 0 ? altAcc : null, alt: alt > 0 ? alt : null, date, note: A && A.note ? String(A.note) : "" };
}
function acclimCard(id) {
  const a = acclimData();
  if (!a) return "";
  const rows = [];
  if (a.heat != null) rows.push(`<div class="acc-row"><span class="acc-k">${IC.sun}Hitze</span><b class="num">${nf(a.heat)}<small>%</small></b>
    <div class="meter" role="img" aria-label="Hitzeanpassung ${nf(a.heat)} Prozent"><div style="width:${a.heat}%"></div></div>${a.trend ? `<small class="acc-s">${esc(a.trend)}</small>` : ""}</div>`);
  if (a.altAcc != null || a.alt != null) rows.push(`<div class="acc-row"><span class="acc-k">${IC.ski}Höhe</span><b class="num">${a.altAcc != null ? nf(a.altAcc) : "–"}<small>m</small></b>
    <span class="acc-t">${a.altAcc != null ? "angepasst" : ""}${a.alt != null ? `${a.altAcc != null ? " · " : ""}aktuell ${nf(a.alt)} m` : ""}</span></div>`);
  return `<article class="card acc" id="${id}"><h3 class="chead">${IC.pulse}Hitze- &amp; Höhenanpassung${a.date ? `<span class="r muted acc-d">${esc(shortDay(a.date))}</span>` : ""}</h3>
    ${rows.join("")}${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
    <details class="more"><summary>Was bedeutet das?</summary>
      <p class="note">Garmin schätzt aus Training bei Wärme (Temperatur und Luftfeuchte am Trainingsort), wie gut dein Körper an Hitze angepasst ist – 100&nbsp;% entspricht voller Anpassung. Sie baut sich in etwa 1–2 Wochen mit regelmäßigem Training bei Wärme auf und geht ohne Wärme nach einigen Wochen wieder zurück.</p>
      <p class="note">Die Höhenanpassung zeigt, bis zu welcher Höhe dein Körper nach Tagen in der Höhe angepasst ist (Schlaf und Aufenthalt über ca.&nbsp;800&nbsp;m). In ungewohnter Höhe sind Puls und Anstrengung bei gleichem Tempo höher.</p></details></article>`;
}

// ---------- Mehr ----------
const DETAILS = {
  ziel: { name: "Ziel & Fokus", sub: "", icon: IC.target, render: renderGoalSettings, noRange: true,
    dirty: () => GS.dirty && !GS.saving, discard: () => { GS.dirty = false; GS.loaded = false; setMsg("", "", ""); } },
  aktivitaeten: { name: "Aktivitäten", sub: "", icon: IC.list, render: renderActivities },
  gesundheit: { name: "Gesundheit & Alltag", sub: "Schritte, Stress, Body Battery, Gewicht", icon: IC.heart, render: renderHealth },
  schlaf: { name: "Schlaf", sub: "Schlafphasen und Schlafwert", icon: IC.moon, render: renderSleep },
  leistung: { name: "Leistung", sub: "Prognosen, Trainingsstatus, Bestleistungen", icon: IC.bolt, render: renderPerformance },
  golf: { name: "Golf", sub: "", icon: IC.flag, render: renderGolf },
  uebersicht: { name: "Jahresübersicht", sub: "Kennzahlen und Schritte-Kalender", icon: IC.grid, render: renderOverview },
  profil: { name: "Profil, Zonen & Ausrüstung", sub: G.zones && G.zones.current ? "Kennwerte, Puls-/Power-/Pace-Zonen, Geräte" : "Kennwerte, Herzfrequenz-Zonen, Geräte", icon: IC.user, render: () => {}, noRange: true },
};
function buildMenu() {
  const g = currentGoal();
  DETAILS.aktivitaeten.sub = `Alle ${pl(G.activities.length, "Einheit", "Einheiten")}, Sportarten, Zonen`;
  DETAILS.golf.sub = `${pl(G.golf.length, "Runde", "Runden")}, Schläge, Plätze`;
  DETAILS.ziel.sub = GS.dirty ? "Nicht gespeicherte Änderungen" : g ? goalText(g).replace(/^Ziel: |^Fokus: /, "") : "Wettkampf, Leistungsziel oder Kraft festlegen";
  // group: undefined = Hauptmenü, "settings" = eigene Karte „Einstellungen“, "hidden" = nur per Link erreichbar
  const item = ([id, d]) => `<a href="#mehr/${id}"><span class="mi">${d.icon}</span><span><b>${esc(d.name)}</b><small>${esc(d.sub)}</small></span></a>`;
  const all = Object.entries(DETAILS);
  document.getElementById("menu").innerHTML = all.filter(([, d]) => !d.group).map(item).join("");
  const set = all.filter(([, d]) => d.group === "settings");
  let card = document.getElementById("menuSetCard");
  if (!card) {
    card = document.createElement("div"); card.id = "menuSetCard"; card.style.marginTop = "14px";
    card.innerHTML = `<div class="kicker" style="margin:0 4px 8px">Einstellungen</div><div class="card menu-card"><nav class="menu" id="menuSet"></nav></div>`;
    document.getElementById("secCard").before(card);
  }
  // „Darstellung“ gehört in die Einstellungen (keine eigene Karte mit nur einem Eintrag)
  const theme = `<a href="#" id="themeRow"><span class="mi" aria-hidden="true">◐</span><span><b>Darstellung</b><small>Hell / Dunkel umschalten</small></span></a>`;
  if (card) document.getElementById("menuSet").innerHTML = set.map(item).join("") + theme;
}
buildMenu();

// ---------- Mehr: Face ID & Schlüssel (nur Web-App; boot.js stellt window.GarvisAuth bereit) ----------
async function renderSecurity() {
  const A = window.GarvisAuth, host = document.getElementById("secCard");
  if (!A) { host.hidden = true; return; }  // lokal (file://): kein Face ID
  const avail = await A.available();
  const mode = A.mode();
  const showFid = avail || mode;
  const lbl = m => m === "prf" ? "An – Schlüssel und Datenstand verschlüsselt, Öffnen nur mit Face ID"
    : m === "lock" ? "An – Face-ID-Abfrage beim Öffnen. Verschlüsselung per Passkey (ab iOS 18) wird hier nicht unterstützt, der Schlüssel liegt unverschlüsselt auf dem Gerät."
    : "Aus – beim Öffnen fragt Garvis nach Face ID und verschlüsselt den Schlüssel";
  host.hidden = false;
  host.innerHTML = `${showFid ? `<div class="setrow"><span class="mi">${IC.face}</span><span><b>Mit Face ID schützen</b><small id="fidLbl">${esc(lbl(mode))}</small></span>
      <button type="button" class="switch" role="switch" id="fidSw" aria-checked="${!!mode}" aria-label="Mit Face ID schützen"></button></div>` : ""}
    <div class="setrow"><span class="mi">${IC.key}</span><span><b>GitHub-Schlüssel</b><small>${esc(keySub())}</small></span>
      <button type="button" class="txtbtn" id="keyForget">Neu eingeben</button></div>
    <div class="keychk" id="keyChk">${keyCheckHtml()}</div>`;
  const sw = document.getElementById("fidSw"), info = document.getElementById("fidLbl");
  const fail = e => e && e.name === "NotAllowedError" ? "Abgebrochen – nichts geändert." : e && e.name === "InvalidStateError" ? "Für dieses Gerät ist schon ein Passkey eingerichtet." : "Fehler: " + (e && e.message || e);
  const done = m => { sw.disabled = false; sw.setAttribute("aria-checked", String(!!A.mode())); info.textContent = lbl(A.mode()); info.classList.remove("msg"); };
  if (sw) sw.addEventListener("click", () => {
    sw.disabled = true;
    const on = sw.getAttribute("aria-checked") === "true";
    // kein await vor enable(): Safari braucht die Nutzergeste für die Face-ID-Abfrage
    const p = on ? A.disable() : A.enable();
    p.then(r => {
      if (r === "confirm") {
        sw.disabled = false;
        info.classList.add("msg");
        info.innerHTML = `Passkey angelegt – einmal bestätigen, um den Schlüssel zu verschlüsseln. <button type="button" class="txtbtn" id="fidOk" style="margin-top:6px">Mit Face ID bestätigen</button>`;
        document.getElementById("fidOk").addEventListener("click", () => A.confirm().then(done, e => { info.textContent = fail(e); }));
        return;
      }
      done(r);
    }, e => { done(); info.textContent = fail(e); info.classList.add("msg"); });
  });
  bindKeyCheck();
  document.getElementById("keyForget").addEventListener("click", async () => {
    if (!window.confirm("Schlüssel und gespeicherten Datenstand von diesem Gerät entfernen? Danach fragt Garvis nach einem neuen Schlüssel.")) return;
    await A.forget();
    location.reload();
  });
}

// ---------- Schlüssel: Ablaufdatum und Berechtigungen prüfen ----------
// Schreiben braucht am Fine-grained-Schlüssel: garvis-data › Contents „Read and write“ und garvis › Actions „Read and write“.
// Geprüft wird nur lesend (GET); Schreibrechte zeigt GitHub im Feld "permissions" der Repo-Antwort (falls vorhanden),
// sonst gelten die Erfahrungen der App (letzter Speicher-/Neuplanungsversuch).
const keySub = () => {
  const x = tokenExp(), left = tokenDaysLeft();
  if (!x) return "Nur auf diesem Gerät gespeichert";
  return left < 0 ? `Abgelaufen am ${dayShortDe(t(x.date))}` : `Läuft ab am ${dayShortDe(t(x.date))}${left <= 7 ? ` – in ${left === 1 ? "1 Tag" : left + " Tagen"}` : ""}${x.src === "manual" ? " (selbst eingetragen)" : ""}`;
};
const KC = { busy: false, res: null };
const KEY_ITEMS = [
  { k: "read", l: "Daten lesen", d: "garvis-data › Contents: Read" },
  { k: "write", l: "Bewertungen, Status & Plan speichern", d: "garvis-data › Contents: Read and write" },
  { k: "repo", l: "Repo garvis ausgewählt", d: "Repository access: garvis" },
  { k: "actions", l: "Sofort neu planen / Garmin abrufen", d: "garvis › Actions: Read and write" },
];
function keyCheckHtml() {
  const R = KC.res, web = window.GARVIS && window.GARVIS.web, x = tokenExp();
  const mark = v => v === true ? `<span class="kc-ok">${IC.check}</span>` : v === false ? `<span class="kc-bad">${IC.warning}</span>` : `<span class="kc-unk">?</span>`;
  const word = v => v === true ? "ok" : v === false ? "fehlt" : "unbekannt";
  return `<details class="more"${R ? " open" : ""}><summary>Berechtigungen &amp; Ablaufdatum</summary>
    <p class="note">Garvis braucht einen Fine-grained-Schlüssel mit Zugriff auf <b>garvis-data</b> (Contents: Read and write) und <b>garvis</b> (Actions: Read and write).</p>
    ${R ? `<ul class="kclist">${KEY_ITEMS.map(i => `<li>${mark(R[i.k])}<span><b>${esc(i.l)}</b><small>${esc(i.d)} · ${word(R[i.k])}${R[i.k + "Why"] ? " – " + esc(R[i.k + "Why"]) : ""}</small></span></li>`).join("")}</ul>` : ""}
    ${web ? `<button type="button" class="txtbtn" id="keyChkBtn"${KC.busy ? " disabled" : ""}>${KC.busy ? "Prüfe …" : R ? "Erneut prüfen" : "Berechtigungen prüfen"}</button>` : ""}
    <label class="kcexp"><span>Läuft ab am</span><input type="date" id="keyExp" value="${esc(x ? x.date : "")}" aria-label="Ablaufdatum des GitHub-Schlüssels"${x && x.src === "github" ? " disabled" : ""}></label>
    <p class="note" style="font-size:12.5px">${x && x.src === "github" ? "Ablaufdatum kommt von GitHub." : "Steht auf github.com › Settings › Fine-grained tokens. Garvis erinnert 7 Tage vorher (Glocke)."}</p></details>`;
}
async function checkKey() {
  const R = {};
  const data = await gh(`${API}/repos/${DATA_REPO}`);
  R.read = data.status === 200 ? true : data.status === 404 || data.status === 401 || (data.status === 403 && !data.rl) ? false : null;
  if (data.status === 401) R.readWhy = "Schlüssel ungültig oder abgelaufen";
  // Schreibprobe ohne sichtbare Änderung: ein loses Git-Objekt (Blob) anlegen – braucht Contents „Read and write“,
  // erzeugt aber keinen Commit und keine Datei (GitHub räumt unbenutzte Objekte selbst auf).
  if (R.read) {
    const b = await gh(`${API}/repos/${DATA_REPO}/git/blobs`, { method: "POST", body: JSON.stringify({ content: "garvis permission check", encoding: "utf-8" }) });
    R.write = b.status === 201 ? true : (b.status === 403 && !b.rl) || b.status === 404 ? false : null;
    if (R.write == null) R.writeWhy = b.status === 0 ? "keine Verbindung" : `GitHub ${b.status}`;
  } else R.write = R.read === false ? false : null;
  const code = await gh(`${API}/repos/${CODE_REPO}`);
  R.repo = code.status === 200 ? true : code.status === 404 ? false : null;
  // Actions-Schreibrecht lässt sich nicht ohne echten Start prüfen → Ergebnis des letzten „Neu planen“
  R.actions = R.repo === false ? false : localStorage.getItem(DISPATCH_KEY) === "denied" ? false : +localStorage.getItem(DISPATCH_AT) ? true : null;
  if (R.actions === false && R.repo) R.actionsWhy = "letzter Start der Neuplanung wurde abgelehnt";
  else if (R.actions == null) R.actionsWhy = "zeigt sich beim ersten „Neu planen“";
  if (data.status === 0 || code.status === 0) R.readWhy = "keine Verbindung";
  return R;
}
function bindKeyCheck() {
  const host = document.getElementById("keyChk"); if (!host || host.dataset.bound) return;
  host.dataset.bound = "1";
  host.addEventListener("click", async e => {
    if (!e.target.closest("#keyChkBtn") || KC.busy) return;
    KC.busy = true; host.innerHTML = keyCheckHtml();
    try { KC.res = await checkKey(); } finally { KC.busy = false; }
    host.innerHTML = keyCheckHtml();
  });
  host.addEventListener("change", e => {
    if (e.target.id !== "keyExp") return;
    const v = e.target.value;
    if (isIsoDay(v)) writeLocal(TOKEN_EXP, { date: v, src: "manual" }); else localStorage.removeItem(TOKEN_EXP);
    renderBell(); renderSecurity();
  });
}
// Nach dem Eingeben eines neuen Schlüssels (boot.js setzt garvis.keyNew): einmal still prüfen und nur bei Lücken melden
async function checkNewKey() {
  if (!(window.GARVIS && window.GARVIS.web)) return;
  let fresh = false; try { fresh = sessionStorage.getItem("garvis.keyNew") === "1"; sessionStorage.removeItem("garvis.keyNew"); } catch (e) { /* egal */ }
  if (!fresh) return;
  KC.res = await checkKey();
  const miss = KEY_ITEMS.filter(i => KC.res[i.k] === false).map(i => i.l);
  if (miss.length) toast(`Schlüssel eingerichtet – es fehlt: ${miss.join(", ")}. Details unter Mehr › GitHub-Schlüssel.`, IC.key);
}
setTimeout(checkNewKey, 2500);

// ---------- Navigation (Hash: #heute, #woche, #fortschritt, #mehr, #mehr/<abschnitt>) ----------
const VIEWS = ["heute", "woche", "ernaehrung", "fortschritt", "mehr"];
const VIEW_EXT = {};  // Tabs aus Zusatzmodulen: { ernaehrung: render } (nutrition.js)
let cur = { view: "heute", detail: null, day: null };
function route(ev) {
  const h = decodeURIComponent(location.hash.slice(1));
  let [v, sub] = h.split("/");
  if (DETAILS[v]) { [v, sub] = ["mehr", v]; history.replaceState(null, "", "#mehr/" + sub); }  // alte Links wie #aktivitaeten
  const prev = cur;
  // Detailseite mit ungespeicherten Eingaben verlassen? (DETAILS[id].dirty/discard – auch für Module, z. B. Orte & Ausstattung)
  const pd = prev.detail && DETAILS[prev.detail];
  if (ev && pd && pd.dirty && !(v === "mehr" && sub === prev.detail)) {
    let dirty = false; try { dirty = !!pd.dirty(); } catch (e) { /* Modulfehler: nicht blockieren */ }
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) { history.replaceState(null, "", "#mehr/" + prev.detail); return; }
    if (dirty && pd.discard) { try { pd.discard(); } catch (e) { console.error(e); } }
  }
  cur = { view: VIEWS.includes(v) ? v : "heute", detail: v === "mehr" && DETAILS[sub] ? sub : null, day: v === "woche" && isIsoDay(sub) ? sub : null };
  // Tagesansicht per Link geöffnet → Schließen = Zurück im Verlauf (auch Wischgeste); direkt aufgerufen → ersetzen
  if (!cur.day) DS.pushed = false;
  else if (!prev.day && ev && ev.type === "hashchange") Object.assign(DS, { pushed: true, from: prev.view });
  else if (!prev.day) Object.assign(DS, { pushed: false, from: "woche" });
  if (ev && prev.view === "woche" && cur.view === "woche") { syncDay(); return; }  // nur Tag gewechselt: Liste und Scrollposition bleiben
  VIEWS.forEach(x => { document.getElementById("v-" + x).hidden = x !== cur.view; });
  document.querySelectorAll("#tabs a").forEach(a => { if (a.dataset.tab === cur.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.getElementById("mMenu").hidden = !!cur.detail;
  document.getElementById("mDetail").hidden = !cur.detail;
  Object.keys(DETAILS).forEach(id => { document.getElementById(id).hidden = id !== cur.detail; });
  if (cur.detail) document.getElementById("rangeMBar").hidden = !!DETAILS[cur.detail].noRange;
  renderCurrent();
  scrollTo(0, 0); requestAnimationFrame(() => scrollTo(0, 0));
  if (!cur.day) syncDay();  // Tagesansicht schließen, falls offen (renderWeekView öffnet sie sonst selbst)
}
let renderedDay = null;
function renderCurrent() {
  hideTip(); renderedDay = localIso();
  if (cur.view === "heute") renderToday();
  else if (cur.view === "woche") renderWeekView();
  else if (cur.view === "fortschritt") renderProgress();
  else if (VIEW_EXT[cur.view]) VIEW_EXT[cur.view]();
  else if (cur.detail) DETAILS[cur.detail].render();
  else { buildMenu(); renderSecurity(); }
}

// ---------- Steuerung ----------
// Ein Satz Zeiträume für Fortschritt und alle Mehr-Seiten; läuft er über, scrollt er waagerecht (Ausblendung am Rand)
const SEGS = { rangeP: [], rangeM: [] };
const segFade = seg => {
  const max = seg.scrollWidth - seg.clientWidth;
  seg.classList.toggle("ovf-r", max > 1 && seg.scrollLeft < max - 1);
  seg.classList.toggle("ovf-l", max > 1 && seg.scrollLeft > 1);
};
const segObs = typeof ResizeObserver === "function" ? new ResizeObserver(es => es.forEach(e => segFade(e.target))) : null;
function renderSegs() {
  SEGS.rangeP = SEGS.rangeM = ["4w", "3m", "12m", "all", ...years.map(String)];
  for (const id in SEGS) {
    const seg = document.getElementById(id);
    seg.innerHTML = SEGS[id].map(rid => RANGES.find(r => r.id === rid)).filter(Boolean)
      .map(r => `<button type="button" data-id="${r.id}" aria-pressed="${r === range}">${r.label}</button>`).join("");
    if (!seg.dataset.fade) { seg.dataset.fade = "1"; seg.addEventListener("scroll", () => segFade(seg), { passive: true }); if (segObs) segObs.observe(seg); }
    const on = seg.querySelector('[aria-pressed="true"]');
    if (on && seg.clientWidth) { const l = on.offsetLeft - seg.offsetLeft, r = l + on.offsetWidth; if (r > seg.scrollLeft + seg.clientWidth || l < seg.scrollLeft) seg.scrollLeft = l - 24; }
    segFade(seg);
  }
}
Object.keys(SEGS).forEach(id => document.getElementById(id).addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  range = RANGES.find(r => r.id === b.dataset.id);
  renderSegs(); renderCurrent();
}));
const typeSel = document.getElementById("actType");
typeSel.innerHTML = `<option value="">Alle Sportarten</option>` + GROUPS.map(g => `<option value="${g.key}">${g.name}</option>`).join("");
typeSel.addEventListener("change", () => { actShown = 60; renderActTable(); });
document.getElementById("actSearch").addEventListener("input", () => { actShown = 60; renderActTable(); });
document.getElementById("actMore").addEventListener("click", () => { actShown += 100; renderActTable(); });
const toggleTheme = e => {
  if (e) e.preventDefault();
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
};
// Statusleiste/Browserleiste passend zur gewählten Darstellung
const syncThemeColor = () => {
  const th = document.documentElement.dataset.theme, a = document.getElementById("tcLight"), b = document.getElementById("tcDark");
  if (!a || !b) return;
  if (th) { const c = th === "dark" ? "#0d0d0d" : "#f9f9f7"; a.content = c; b.content = c; } else { a.content = "#f9f9f7"; b.content = "#0d0d0d"; }
};
new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
syncThemeColor();
document.addEventListener("click", e => { if (e.target.closest("#themeRow")) toggleTheme(e); });  // Zeile wird von buildMenu neu gezeichnet
// nur bei geänderter Breite neu zeichnen (iOS meldet beim Scrollen „resize“, wenn die Adressleiste einklappt)
let rt, lastW = innerWidth;
addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(renderCurrent, 150); });
addEventListener("hashchange", route);
addEventListener("load", () => scrollTo(0, 0), { once: true });  // Browser springt sonst zum gleichnamigen Abschnitt

// ---------- Wischen zwischen den Tabs (nur Touch, Pointer Events) ----------
// Horizontal wischen auf dem Inhalt → linker/rechter Tab (Reihenfolge der Tab-Leiste), Inhalt folgt dem Finger.
// Nicht in Eingaben/Formularen, Diagrammen, horizontal scrollbaren Bereichen, bei offenem Dialog oder vom linken Rand (iOS-Zurück).
// In der Tagesansicht: Wischen = vorheriger/nächster Tag. Elemente mit data-noswipe sind ausgenommen (auch für Zusatzmodule).
const SWIPE = { edge: 20, lock: 12, ratio: 1.6, commit: 0.28, flick: 0.6 };
const SWIPE_SKIP = "input, textarea, select, [contenteditable], form, label, .chart, svg:not(.ic), canvas, table, .tscroll, .seg, .chipsel, .toolbar, [data-noswipe], [role=slider]";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const tabOrder = () => [...document.querySelectorAll("#tabs a[data-tab]")].map(a => a.dataset.tab).filter(v => VIEWS.includes(v));
const modalOpen = () => [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].some(n => n.getClientRects().length && !n.closest("[hidden]"));
function hScrollable(n, stop) {
  for (; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}
function swipeable(e, root) {
  if (e.pointerType !== "touch" || !e.isPrimary) return false;
  if (e.clientX < SWIPE.edge || e.clientX > innerWidth - SWIPE.edge) return false;  // Randgesten von iOS
  const tg = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  return !!tg && !tg.closest(SWIPE_SKIP) && !hScrollable(tg, root);
}
function bindSwipe(root, { target, neighbor, go, guard }) {
  let S = null;
  const set = (n, x, anim) => { n.style.transition = anim ? "transform .2s ease-out, opacity .2s ease-out" : "none"; n.style.transform = x ? `translate3d(${x}px,0,0)` : ""; };
  const clear = n => { n.style.transition = n.style.transform = n.style.opacity = ""; };
  const end = () => { document.documentElement.classList.remove("sw-on"); S = null; };
  const back = () => { if (S && S.drag && S.node) { const n = S.node; set(n, 0, !reduceMotion()); setTimeout(() => clear(n), 220); } end(); };
  root.addEventListener("pointerdown", e => {
    S = null;
    if (guard && !guard()) return;
    if (!swipeable(e, root)) return;
    const node = target();
    if (node) S = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, node, drag: false, dx: 0, v: 0, lt: e.timeStamp, lx: e.clientX };
  }, { passive: true });
  root.addEventListener("pointermove", e => {
    if (!S || e.pointerId !== S.id) return;
    const dx = e.clientX - S.x0, dy = e.clientY - S.y0;
    if (!S.drag) {
      if (Math.abs(dy) > SWIPE.lock && Math.abs(dy) >= Math.abs(dx)) { S = null; return; }  // vertikal: Scrollen gehört dem Browser
      if (Math.abs(dx) < SWIPE.lock || Math.abs(dx) < SWIPE.ratio * Math.abs(dy)) return;
      S.drag = true; S.next = neighbor(dx < 0 ? 1 : -1);
      document.documentElement.classList.add("sw-on"); hideTip();
    }
    const dt = Math.max(1, e.timeStamp - S.lt);
    S.v = (e.clientX - S.lx) / dt; S.lt = e.timeStamp; S.lx = e.clientX;
    S.next = neighbor(dx < 0 ? 1 : -1);
    S.dx = S.next ? dx : dx * 0.25;  // am Ende der Reihe: nur leichtes Nachgeben
    if (!reduceMotion()) set(S.node, S.dx, false);
  }, { passive: true });
  root.addEventListener("pointerup", e => {
    if (!S || e.pointerId !== S.id) return;
    if (!S.drag) { S = null; return; }
    const w = root.clientWidth || innerWidth, dir = S.dx < 0 ? 1 : -1;
    const ok = S.next && (Math.abs(S.dx) > SWIPE.commit * w || (Math.abs(S.v) > SWIPE.flick && Math.abs(S.dx) > 50 && Math.sign(S.v) === -dir));
    SWIPE.until = e.timeStamp + 400;  // Klick nach dem Wischen nicht als Antippen werten
    if (!ok) return back();
    const n = S.node, next = S.next;
    end();
    const after = () => {  // nach route(): neue Ansicht kommt von der Gegenseite
      clear(n);
      const m = target();
      if (!m || reduceMotion()) return;
      set(m, dir * Math.min(80, w * 0.2), false); m.style.opacity = "0.4";
      requestAnimationFrame(() => requestAnimationFrame(() => { set(m, 0, true); m.style.opacity = ""; setTimeout(() => clear(m), 220); }));
    };
    const run = () => { addEventListener("hashchange", after, { once: true }); go(next, dir); };
    if (reduceMotion()) { clear(n); run(); return; }
    set(n, -dir * w, true); n.style.opacity = "0";
    setTimeout(run, 170);
  });
  root.addEventListener("pointercancel", e => { if (S && e.pointerId === S.id) back(); });
}
addEventListener("click", e => { if (SWIPE.until && e.timeStamp < SWIPE.until) { e.preventDefault(); e.stopPropagation(); SWIPE.until = 0; } }, true);
// Haupt-Tabs: Hash wie beim Antippen (#woche, #mehr …)
bindSwipe(document.querySelector("main.wrap"), {
  guard: () => !cur.day && !modalOpen() && !document.getElementById("lock").offsetParent,
  target: () => document.getElementById("v-" + cur.view),
  neighbor: d => { const o = tabOrder(), i = o.indexOf(cur.view); return i < 0 ? null : o[i + d] || null; },
  go: v => { location.hash = "#" + v; },
});
// Tagesansicht: vorheriger/nächster Tag (wie die Pfeile oben)
function bindDaySwipe() {
  const s = dsEl();
  if (s.dataset.swipe) return;
  s.dataset.swipe = "1";
  const days = () => (window.TODAY && window.TODAY.week) || [];
  bindSwipe(s.querySelector(".ds-panel"), {
    guard: () => !!cur.day && ![...document.querySelectorAll('[aria-modal="true"]')].some(n => n.closest("#daySheet") !== s && n.getClientRects().length && !n.closest("[hidden]")),
    target: () => document.getElementById("dsBody"),
    neighbor: d => { const W = days(), i = W.findIndex(w => w.date === cur.day); return i < 0 || !W[i + d] ? null : W[i + d].date; },
    go: iso => { location.replace("#woche/" + iso); },
  });
}

// ---------- Aktualisieren: Datenstand neu laden ohne Seiten-Reload (boot.js: window.GarvisData) ----------
// Knopf in der Kopfzeile · nach > 10 min im Hintergrund still beim Zurückholen · nach „Neu planen“ alle ~30 s bis neuer Stand da ist
let lastSync = Date.now(), hiddenAt = null, toastT = null;
function toast(msg, icon = IC.check) {
  const n = document.getElementById("syncToast"); if (!n) return;
  n.innerHTML = `${icon}<span>${esc(msg)}</span>`; n.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { n.hidden = true; }, Math.max(2600, String(msg).length * 65));  // lange Hinweise länger zeigen
}
// neuen Datenstand übernehmen und die aktuelle Ansicht neu zeichnen (Hash und Scrollposition bleiben)
let reloadWait = false;
function reloadData() {
  // Nicht während einer Eingabe neu zeichnen (z. B. Notiz in der Tagesansicht, während watchReplan alle 30 s nachlädt):
  // erst nach dem Verlassen des Felds übernehmen – sonst schließt iOS die Tastatur und der Fokus springt.
  if (typing()) {
    if (!reloadWait) { reloadWait = true; document.activeElement.addEventListener("blur", () => { reloadWait = false; setTimeout(reloadData, 60); }, { once: true }); }
    return;
  }
  G = window.GARMIN;
  initRanges();
  range = RANGES.find(r => r.id === range.id) || RANGES[1];
  daily = G.daily.date.map((d, i) => { const o = { x: t(d) }; for (const k in G.daily) if (k !== "date") o[k] = G.daily[k][i]; return o; });
  acts = G.activities.map(a => ({ ...a, x: t(a.date), g: groupOf(a.type), multi: a.dur > 1440 }));
  ZC = G.zones && G.zones.current || null;
  FIT = fitOf(G);
  window.GarvisApp.api.G = G;
  const y = scrollY, ds = document.querySelector("#daySheet .ds-panel"), dsy = ds ? ds.scrollTop : 0;
  renderSegs(); renderHero(); renderProfile(); buildMenu();
  renderCurrent();
  if (cur.day) syncDay();
  scrollTo(0, y); requestAnimationFrame(() => { scrollTo(0, y); if (ds) ds.scrollTop = dsy; });
  lastSync = Date.now();
}
const refBtn = document.getElementById("refresh");
async function doRefresh(manual) {
  const D = window.GarvisData;
  if (!D || !refBtn || refBtn.classList.contains("busy")) return null;
  refBtn.classList.add("busy"); refBtn.setAttribute("aria-busy", "true");
  if (manual) refBtn.disabled = true;
  let r;
  try { r = await D.refresh(); } catch (e) { r = { status: "error" }; }
  refBtn.classList.remove("busy"); refBtn.removeAttribute("aria-busy"); refBtn.disabled = false;
  if (r.status !== "error") lastSync = Date.now();
  if (r.status === "new") toast("Aktualisiert");
  else if (manual && r.status === "same" && await fetchGarmin()) { /* Hinweis kommt aus fetchGarmin */ }
  else if (manual) toast(r.status === "same" ? "Schon aktuell" : r.reason || "Laden fehlgeschlagen", r.status === "same" ? IC.check : IC.warning);
  return r;
}
// Plan älter als 20 min → frischen Garmin-Abruf in der Cloud anstoßen (z. B. Training gerade synchronisiert).
// Braucht am Schlüssel „Actions: Read and write“ für das Repo garvis; ohne das prüft Garvis stündlich von selbst.
// opts.auto: automatisch beim Öffnen (Plan von gestern) – Fehler nur still merken, kein Hinweis.
async function fetchGarmin(opts = {}) {
  const T = window.TODAY, gen = T && T.generated ? Date.parse(T.generated.replace(" ", "T")) : 0;
  if (!(window.GARVIS && window.GARVIS.web) || (gen && Date.now() - gen < 20 * 60000)) return false;
  const d = await dispatchReplan();  // immer versuchen – eine frühere „keine Berechtigung“-Merkung kann veraltet sein
  if (d.status === 204 || d.ok) { localStorage.removeItem(DISPATCH_KEY); toast("Garmin wird abgefragt – neuer Plan in ein paar Minuten", IC.clock); watchReplan(); return true; }
  if (opts.auto) { if ((d.status === 403 && !d.rl) || d.status === 404) localStorage.setItem(DISPATCH_KEY, "denied"); return false; }
  if ((d.status === 403 && !d.rl) || d.status === 404) {
    localStorage.setItem(DISPATCH_KEY, "denied");
    // Diagnose: sieht der Schlüssel das Repo garvis überhaupt? (200 → Repo ok, Actions-Recht fehlt · 404 → Repo nicht ausgewählt)
    const repo = await gh(`${API}/repos/${CODE_REPO}`);
    const why = repo.status === 200
      ? "Repo „garvis“ ist am Schlüssel ausgewählt, aber „Actions“ steht nicht auf „Read and write“"
      : repo.status === 404 ? "Repo „garvis“ ist am Schlüssel nicht ausgewählt (Repository access)"
      : `GitHub ${d.status}${d.body && d.body.message ? ": " + d.body.message : ""}`;
    toast(`Kein Abruf möglich – ${why}. Garvis prüft stündlich selbst.`, IC.clock); return true;
  }
  if (d.status && d.status !== 204) { toast(`Abruf fehlgeschlagen (GitHub ${d.status}) – Garvis prüft stündlich selbst`, IC.warning); return true; }
  return false;
}
if (refBtn) refBtn.addEventListener("click", () => doRefresh(true));
// Plan von einem früheren Tag → einmal automatisch einen Garmin-Abruf anstoßen (höchstens alle 30 min,
// zusätzlich bündelt dispatchReplan Starts innerhalb von 45 s). Erst nach dem Nachladen prüfen – vielleicht ist der neue Plan schon da.
const AUTO_FETCH = "garvis.autoFetchAt";
async function autoFetch() {
  if (!(window.GARVIS && window.GARVIS.web) || !planStale() || document.hidden) return;
  const last = +localStorage.getItem(AUTO_FETCH) || 0;
  if (Date.now() - last < 30 * 60000) return;
  localStorage.setItem(AUTO_FETCH, String(Date.now()));
  await fetchGarmin({ auto: true });
}
setTimeout(autoFetch, 6000);  // boot.js lädt beim schnellen Start im Hintergrund nach – erst danach entscheiden
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const was = hiddenAt; hiddenAt = null;
  if (was && Date.now() - lastSync > 10 * 60000) await doRefresh(false);
  if (was) { if (renderedDay !== localIso() && !typing()) renderCurrent(); autoFetch(); }  // über Mitternacht offen: „Heute“ neu beschriften
});
let watchT = null;
function watchReplan() {
  const gen0 = window.TODAY && window.TODAY.generated, until = Date.now() + 10 * 60000;
  clearInterval(watchT);
  watchT = setInterval(async () => {
    if (Date.now() > until) { clearInterval(watchT); return; }
    if (document.hidden) return;
    await doRefresh(false);
    if (window.TODAY && window.TODAY.generated !== gen0) { clearInterval(watchT); toast("Neuer Plan ist da"); }
  }, 30000);
}

// ---------- Zusatzmodule (eigene Dateien, per <script src> – CSP-konform, kein Inline-Code) ----------
// Ein Modul ruft window.GarvisApp.register({ id, details: { <id>: { name, sub, icon, render, noRange, group } },
//   hooks: { plan(host, T), week(listEl, W) } }) auf. Für eigene Detailseiten legt das Modul selbst
//   <section id="<id>" hidden> in #mDetail an. Neue Dateien auch in sw.js (SHELL) und scripts/publish.py (PUBLIC) eintragen.
const MODULES = ["strength.js", "nutrition.js", "perf.js", "actions.js"];
const MODS = [];
function extHook(name, ...args) {
  MODS.forEach(m => { try { m.hooks && m.hooks[name] && m.hooks[name](...args); } catch (e) { console.error(`Modul ${m.id}:`, e); } });
}
window.GarvisApp = {
  register(m) {
    MODS.push(m);
    if (m.details) Object.assign(DETAILS, m.details);
    if (m.views) Object.assign(VIEW_EXT, m.views);  // eigener Tab: <div class="view" id="v-<name>"> in index.html + Eintrag in VIEWS
    buildMenu();
    const [v, sub] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (m.details && (m.details[sub] || m.details[v])) route(); else if (cur.view !== "mehr" || !cur.detail) renderCurrent();
  },
  rerender: () => renderCurrent(),
  reload: () => reloadData(),  // boot.js: neuer Datenstand (window.GARMIN/TODAY) → neu zeichnen
  toast: (msg) => toast(msg),
  refreshMenu: () => buildMenu(),
  // Helfer für Module (nur lesen/aufrufen, nicht verändern)
  api: { G, IC, esc, nf, pl, deIso, axN, axH, singleStat, GROUPS, groupByKey, miniProfile, courseList, courseById, t, DAY, MONTHS, MONTHS_L, WD, WDL, wdi, fmtDate, shortDate, isoDay, el, legend, empty, lineChart, showTip, hideTip,
    gh, API, DATA_REPO, SETTINGS_URL, fetchSettings, utf8b64, b64utf8, readLocal, writeLocal, errText, WRITE_HELP, SET_KEY, todayRef,
    putSettings, dispatchReplan, DISPATCH_KEY, groupOf, localIso, planStale, typing },  // actions.js: Planänderungen/Status → sofort neu planen
};
// Kurzformen (gleiche Funktionen) für Module, die sie direkt an GarvisApp erwarten
Object.assign(window.GarvisApp, { util: window.GarvisApp.api, gh, fetchSettings, utf8b64, b64utf8, errText, WRITE_HELP, API, DATA_REPO, buildMenu });

// ---------- Typografie: Zahl und Einheit nicht trennen („1 % Steigung“, „90 min“) ----------
// Geschütztes Leerzeichen in Textknoten der Ansichten (auch Inhalte aus Zusatzmodulen); Eingaben bleiben unberührt.
{
  const RX = /(?<=\d[ \u00a0]%) (?=Steig)|(?<=\d) (?=(?:%|km\/h|km|min|h|s|m|W|bpm|kg|g|ml|l|kcal|°C|×)(?![\p{L}\d]))/gu;
  const glue = root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode && /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let n; (n = w.nextNode());) if (RX.test(n.data)) { RX.lastIndex = 0; n.data = n.data.replace(RX, "\u00a0"); } else RX.lastIndex = 0;
  };
  const roots = [document.querySelector("main.wrap"), document.body].filter(Boolean);
  let q = new Set(), pend = false;
  const flush = () => { pend = false; const s = q; q = new Set(); s.forEach(n => n.isConnected && glue(n)); };
  new MutationObserver(ms => {
    ms.forEach(m => { if (m.type === "childList") m.addedNodes.forEach(n => (n.nodeType === 1 || n.nodeType === 3) && q.add(n.nodeType === 3 ? n.parentNode : n)); });
    if (!pend && q.size) { pend = true; queueMicrotask(flush); }
  }).observe(document.body, { childList: true, subtree: true });
  glue(roots[0] || document.body);
}
renderSegs(); renderHero(); renderProfile(); route();
{ const bl = document.getElementById("bootLoad"); if (bl) bl.hidden = true; }
MODULES.forEach(src => { const s = document.createElement("script"); s.src = src; s.async = false; document.body.appendChild(s); });
})();
