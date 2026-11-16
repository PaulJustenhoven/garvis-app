// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: running;

// Garvis-Widget für Scriptable (iPhone): heutiger Trainingsvorschlag + Erholung, Form, morgen.
// Daten: widget.json im privaten Repo PaulJustenhoven/garvis-data (erzeugt von scripts/widget_data.py).
// Token: beim ersten Start in Scriptable abgefragt und im iOS-Schlüsselbund gespeichert (Keychain „garvis.token“).
// Größen: klein, mittel, groß (auch StandBy) und Sperrbildschirm (rechteckig, rund, Zeile über der Uhr).
// Widget-Parameter (optional, beim Bearbeiten des Widgets): „zeit“ → rundes Sperrbildschirm-Widget zeigt
// Sportart + Uhrzeit statt des Erholungswerts.

const DATA_URL = "https://api.github.com/repos/PaulJustenhoven/garvis-data/contents/widget.json";
const APP_URL = "https://pauljustenhoven.github.io/garvis-app/";
const KEY = "garvis.token";
const REFRESH_MIN = 30;

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "garvis-widget-cache.json");

// ---------- Farben (wie die App, hell/dunkel) ----------
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn("#f9f9f7", "#0d0d0d"),
  card: dyn("#f3f2ee", "#1a1a19"),
  text: dyn("#0b0b0b", "#f0efec"),
  sub: dyn("#52514e", "#c3c2b7"),
  muted: dyn("#898781", "#898781"),
  track: dyn("#e1e0d9", "#2c2c2a"),
  critical: new Color("#d03b3b"),
  warning: new Color("#fab219"),
  info: new Color("#2a78d6"),
};
const LEVEL_COLOR = { rest: "#9ec5f4", easy: "#0ca30c", long: "#0ca30c", moderate: "#fab219", hard: "#ec835a", race: "#ec835a" };
const LEVEL_DE = { rest: "Ruhetag", easy: "Locker", long: "Lang & locker", moderate: "Mittel", hard: "Intensiv", race: "Wettkampf" };
const levelColor = (t) => new Color((t && t.color) || LEVEL_COLOR[(t && t.level) || "rest"] || "#9ec5f4");

const F = {
  label: (n) => Font.mediumMonospacedSystemFont(n),
  mono: (n) => Font.semiboldMonospacedSystemFont(n),
  title: (n) => Font.boldSystemFont(n),
  body: (n) => Font.mediumSystemFont(n),
  num: (n) => Font.boldRoundedSystemFont(n),
};

// ---------- kleine Helfer ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dur = (m) => (m == null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${pad(m % 60)} h`);
const signed = (v) => (v == null ? "–" : v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0");
const isRest = (t) => !t || t.level === "rest";

function text(parent, s, font, color, opt) {
  const t = parent.addText(String(s == null ? "" : s));
  t.font = font;
  t.textColor = color;
  if (opt && opt.lines) t.lineLimit = opt.lines;
  if (opt && opt.scale) t.minimumScaleFactor = opt.scale;
  return t;
}

function hstack(parent, spacing) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  if (spacing) s.spacing = spacing;
  return s;
}

function vstack(parent, spacing) {
  const s = parent.addStack();
  s.layoutVertically();
  if (spacing) s.spacing = spacing;
  return s;
}

function card(parent, padV, padH) {
  const s = vstack(parent);
  s.backgroundColor = C.card;
  s.cornerRadius = 12;
  s.setPadding(padV, padH, padV, padH);
  return s;
}

function symbol(name, size, fallback) {
  let s = SFSymbol.named(name);
  if (!s || !s.image) s = SFSymbol.named(fallback || "figure.run");
  s.applyFont(Font.semiboldSystemFont(size));
  return s.image;
}

function icon(parent, name, size, color) {
  const i = parent.addImage(symbol(name, size));
  i.imageSize = new Size(size, size);
  i.tintColor = color;
  return i;
}

function dot(parent, color, size) {
  const d = parent.addStack();
  d.size = new Size(size || 7, size || 7);
  d.cornerRadius = (size || 7) / 2;
  d.backgroundColor = color;
  return d;
}

// Balken 0–100 (Erholung)
function meter(parent, value, width, color) {
  const outer = parent.addStack();
  outer.size = new Size(width, 4);
  outer.cornerRadius = 2;
  outer.backgroundColor = C.track;
  outer.layoutHorizontally();
  const v = Math.max(0, Math.min(100, value || 0));
  if (v > 0) {
    const inner = outer.addStack();
    inner.size = new Size(Math.max(4, Math.round((width * v) / 100)), 4);
    inner.cornerRadius = 2;
    inner.backgroundColor = color;
  }
  outer.addSpacer();
  return outer;
}

// „Do 17:30 · 🏊 Technik-Schwimmen · 50 min“
function dayLine(d) {
  if (!d) return "";
  if (isRest(d)) return `${d.wd} · ${d.emoji || "😴"} ${d.title || "Ruhetag"}`;
  const parts = [d.start ? `${d.wd} ${d.start}` : d.wd, `${d.emoji || ""} ${d.title}`.trim()];
  if (d.duration) parts.push(dur(d.duration));
  return parts.join(" · ");
}

function timeLine(t, withEnd) {
  if (isRest(t)) return null;
  const parts = [];
  if (t.start) parts.push(withEnd && t.end ? `${t.start}–${t.end}` : t.start);
  if (t.duration) parts.push(dur(t.duration));
  return parts.join(" · ") || null;
}

function placeLine(t) {
  if (isRest(t) || !t.place) return null;
  const parts = [t.place];
  if (t.indoor === false && t.place !== "draußen") parts.push("draußen");
  if (t.indoor === false && t.weather) parts.push(t.weather);
  return parts.join(" · ");
}

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dez"];
const dateLabel = (d) => `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;

// ---------- Daten ----------
function readCache() {
  try {
    if (fm.fileExists(CACHE)) return JSON.parse(fm.readString(CACHE));
  } catch (e) {}
  return null;
}

async function fetchData(token) {
  const r = new Request(DATA_URL);
  r.headers = {
    Accept: "application/vnd.github.raw+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  r.timeoutInterval = 15;
  const body = await r.loadString();
  const code = r.response ? r.response.statusCode : 0;
  if (code === 401) throw new Error("Token ungültig oder abgelaufen");
  if (code === 403) throw new Error("Kein Zugriff (Token-Rechte prüfen)");
  if (code === 404) throw new Error("widget.json nicht gefunden");
  if (code !== 200) throw new Error(`GitHub antwortet ${code}`);
  const data = JSON.parse(body);
  fm.writeString(CACHE, body);
  return data;
}

async function load() {
  const token = Keychain.contains(KEY) ? Keychain.get(KEY) : null;
  if (!token) return { data: readCache(), error: "Kein Token – Skript in Scriptable öffnen", noToken: true };
  try {
    return { data: await fetchData(token), error: null };
  } catch (e) {
    const error = String((e && e.message) || e);
    return { data: readCache(), error, offline: true, auth: /Token|Zugriff/.test(error) };
  }
}

// Heute/morgen nach der Uhr des iPhones – falls der neue Plan noch nicht da ist (früh morgens),
// zeigt das Widget den gestern geplanten Tag als „vorläufig“.
function resolve(data) {
  const now = new Date();
  const t = ymd(now);
  const week = data.week || [];
  let today = data.training;
  let tomorrow = data.tomorrow ? Object.assign({}, week.find((x) => x.date === data.tomorrow.date), data.tomorrow) : null;
  let note = null;
  if (data.date !== t) {
    const w = week.find((x) => x.date === t);
    if (w) {
      today = Object.assign({ intensity: LEVEL_DE[w.level] }, w, { provisional: true });
      const m = week.find((x) => x.date === ymd(addDays(now, 1)));
      tomorrow = m ? Object.assign({}, m, { line: dayLine(m) }) : null;
      note = "vorläufig";
    } else {
      note = `Stand ${data.label || data.date}`;
    }
  }
  return { today, tomorrow, note, wd: WD[now.getDay()], label: dateLabel(now), todayIso: t };
}

// ---------- Widgets ----------
function base(family) {
  const w = new ListWidget();
  if (!(family || "").startsWith("accessory")) w.backgroundColor = C.bg;  // Sperrbildschirm: System-Hintergrund
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60 * 1000);
  return w;
}

function message(family, title, body) {
  const w = base(family);
  if (family && family.startsWith("accessory")) {
    w.addAccessoryWidgetBackground = family !== "accessoryInline";
    text(w, family === "accessoryInline" ? `Garvis: ${title}` : title, F.title(12), Color.white(), { lines: 3, scale: 0.7 });
    return w;
  }
  w.setPadding(14, 14, 14, 14);
  text(w, "GARVIS", F.label(10), C.muted);
  w.addSpacer(6);
  text(w, title, F.title(15), C.text, { lines: 2 });
  w.addSpacer(4);
  text(w, body, F.body(12), C.sub, { lines: 4, scale: 0.8 });
  w.addSpacer();
  return w;
}

function alertRow(parent, a, size) {
  const color = a.level === "critical" ? C.critical : a.level === "warning" ? C.warning : C.info;
  const row = hstack(parent, 6);
  row.backgroundColor = new Color(color.hex, 0.16);
  row.cornerRadius = 8;
  row.setPadding(4, 8, 4, 8);
  text(row, a.icon || "⚠️", F.body(size), C.text);
  text(row, a.title, F.title(size), C.text, { lines: 1, scale: 0.7 });
  row.addSpacer();
  return row;
}

function readinessTile(parent, r, width) {
  const tile = card(parent, 6, 8);
  if (width) tile.size = new Size(width, 0);
  text(tile, "ERHOLUNG", F.label(9), C.muted);
  const row = hstack(tile, 4);
  text(row, r && r.score != null ? r.score : "–", F.num(20), C.text);
  row.addSpacer();
  tile.addSpacer(3);
  meter(tile, r && r.score, (width || 90) - 16, new Color((r && r.color) || "#898781"));
  return tile;
}

function formTile(parent, f, width) {
  const tile = card(parent, 6, 8);
  if (width) tile.size = new Size(width, 0);
  text(tile, "FORM", F.label(9), C.muted);
  const row = hstack(tile, 5);
  text(row, f ? signed(f.tsb) : "–", F.num(20), C.text);
  row.addSpacer();
  const sub = hstack(tile, 4);
  if (f) dot(sub, new Color(f.color || "#898781"), 6);
  text(sub, f ? f.word : "keine Daten", F.body(10), C.sub, { lines: 1, scale: 0.7 });
  return tile;
}

function goalTile(parent, g, width) {
  const tile = card(parent, 6, 8);
  if (width) tile.size = new Size(width, 0);
  text(tile, "ZIEL", F.label(9), C.muted);
  text(tile, g.weeks_left != null ? `${g.weeks_left} Wo.` : g.phase, F.num(20), C.text, { lines: 1, scale: 0.6 });
  text(tile, [g.phase, g.deload ? "Entlastung" : null].filter(Boolean).join(" · ") || g.title || "", F.body(10), C.sub, { lines: 1, scale: 0.7 });
  return tile;
}

function small(d, st) {
  const { today: t, tomorrow, note, wd } = resolve(d);
  const w = base();
  w.setPadding(12, 12, 12, 12);

  const head = hstack(w, 4);
  text(head, `HEUTE · ${wd}`.toUpperCase(), F.label(10), C.muted);
  head.addSpacer();
  if (d.alert) text(head, d.alert.icon || "⚠️", F.body(11), C.text);
  else if (st.offline) icon(head, "icloud.slash", 11, C.muted);
  else if (note) icon(head, "clock.arrow.circlepath", 11, C.muted);

  w.addSpacer(6);
  const lv = hstack(w, 5);
  icon(lv, t.sf || "figure.run", 18, levelColor(t));
  text(lv, (t.intensity || "").toUpperCase(), F.label(10), C.sub, { lines: 1, scale: 0.7 });
  w.addSpacer(4);
  text(w, t.title, F.title(16), C.text, { lines: 2, scale: 0.75 });
  w.addSpacer(2);
  if (isRest(t)) {
    if (tomorrow) text(w, `Morgen ${tomorrow.start || ""} ${tomorrow.emoji || ""}`.replace(/\s+/g, " ").trim(), F.body(12), C.sub, { lines: 1, scale: 0.7 });
  } else {
    text(w, timeLine(t, false) || "", F.mono(13), C.sub, { lines: 1, scale: 0.7 });
  }

  w.addSpacer();
  const r = d.readiness || {};
  const bottom = hstack(w, 8);
  text(bottom, r.score != null ? r.score : "–", F.num(22), C.text);
  const col = vstack(bottom, 3);
  text(col, "ERHOLUNG", F.label(8), C.muted);
  meter(col, r.score, 64, new Color(r.color || "#898781"));
  bottom.addSpacer();
  return w;
}

function trainingCard(parent, t, wd, note, big, compact) {
  const c = card(parent, big ? 10 : 8, big ? 12 : 10);
  const head = hstack(c, 5);
  text(head, `HEUTE · ${wd}${note ? " · " + note : ""}`.toUpperCase(), F.label(9), C.muted, { lines: 1, scale: 0.7 });
  head.addSpacer();
  dot(head, levelColor(t), 7);
  text(head, (t.intensity || "").toUpperCase(), F.label(9), C.sub, { lines: 1 });
  c.addSpacer(big ? 6 : 4);
  const row = hstack(c, 8);
  icon(row, t.sf || "figure.run", big ? 26 : 20, levelColor(t));
  text(row, t.title, F.title(big ? 18 : 15), C.text, { lines: 2, scale: 0.75 });
  row.addSpacer();
  const tl = timeLine(t, true);
  const pl = placeLine(t);
  if (tl) {
    c.addSpacer(big ? 6 : 4);
    text(c, tl, F.mono(big ? 13 : 12), C.text, { lines: 1, scale: 0.7 });
  }
  if (pl && (big || !t.zwift)) text(c, pl, F.body(big ? 12 : 11), C.sub, { lines: 1, scale: 0.7 });
  if (t.zwift) text(c, `Zwift: ${t.zwift}`, F.body(11), C.sub, { lines: big && !compact ? 2 : 1, scale: 0.7 });
  if (isRest(t)) text(c, "Erholung, Schlaf, etwas Mobility", F.body(12), C.sub, { lines: 1 });
  return c;
}

function footer(parent, d, st, extra) {
  const f = hstack(parent, 4);
  if (extra) {
    text(f, extra, F.body(11), C.sub, { lines: 1, scale: 0.7 });
  }
  f.addSpacer();
  const s = st.auth ? "Token prüfen" : st.offline ? `offline · ${d.stand || ""}` : d.stale ? `Uhr-Daten ${(d.data_date || "").slice(5).split("-").reverse().join(".")}.` : d.stand ? `Stand ${d.stand}` : "";
  text(f, s, F.label(9), C.muted, { lines: 1 });
  return f;
}

// Ernährung heute: nächstes Gericht (nach Uhrzeit) + Trinken – kommt aus widget.json (Planungslauf)
function nextMeal(nu) {
  if (!nu || !(nu.meals || []).length) return null;
  const now = new Date(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return nu.meals.find(m => m.t >= hm.slice(0, 2) + ":00") || null;
}
function nutritionRow(parent, nu, size) {
  if (!nu) return null;
  const m = nextMeal(nu), c = card(parent, 7, 10), r = hstack(c, 6);
  r.centerAlignContent();
  icon(r, "fork.knife", size + 1, C.sub);
  text(r, m ? `${m.l} ${m.t} · ${m.n}` : nu.word, F.body(size), C.text, { lines: 1, scale: 0.7 });
  r.addSpacer();
  if (nu.water_target_l) text(r, `💧 ${nu.water_l != null ? String(nu.water_l).replace(".", ",") + "/" : ""}${String(nu.water_target_l[0]).replace(".", ",")} l`, F.label(size - 1), C.sub, { lines: 1 });
  return c;
}
function medium(d, st) {
  const { today: t, tomorrow, note, wd } = resolve(d);
  const w = base();
  w.setPadding(12, 12, 10, 12);
  const main = hstack(w, 8);
  main.topAlignContent();
  trainingCard(main, t, wd, note, false);
  const side = vstack(main, 6);
  readinessTile(side, d.readiness, 92);
  formTile(side, d.form, 92);
  w.addSpacer();
  if (d.alert) {
    alertRow(w, d.alert, 11);
  } else if (d.nutrition) {
    nutritionRow(w, d.nutrition, 11);
  } else {
    footer(w, d, st, tomorrow ? `Morgen: ${tomorrow.line || dayLine(tomorrow)}` : null);
  }
  return w;
}

function weekStrip(parent, week, todayIso) {
  const c = card(parent, 8, 10);
  text(c, "WOCHE", F.label(9), C.muted);
  c.addSpacer(6);
  const row = hstack(c, 0);
  week.slice(0, 7).forEach((x, i) => {
    if (i) row.addSpacer();
    const col = vstack(row, 3);
    col.centerAlignContent();
    const cur = x.date === todayIso;
    const top = hstack(col);
    text(top, x.wd, cur ? F.mono(10) : F.label(10), cur ? C.text : C.muted);
    const mid = hstack(col);
    icon(mid, x.sf || "moon.zzz.fill", 15, new Color(x.color || LEVEL_COLOR.rest));
    const bot = hstack(col);
    text(bot, isRest(x) ? "–" : x.start || "", F.label(9), C.sub);
  });
  return c;
}

function large(d, st) {
  const { today: t, tomorrow, note, wd, label } = resolve(d);
  const w = base();
  w.setPadding(14, 14, 12, 14);
  const head = hstack(w, 4);
  text(head, "GARVIS", F.mono(11), C.text);
  head.addSpacer();
  text(head, label.toUpperCase(), F.label(10), C.muted);
  w.addSpacer(8);
  trainingCard(w, t, wd, note, true, !!d.alert);
  w.addSpacer(8);
  const tiles = hstack(w, 8);
  tiles.topAlignContent();
  const tw = d.goal ? 98 : 151;
  readinessTile(tiles, d.readiness, tw);
  formTile(tiles, d.form, tw);
  if (d.goal) goalTile(tiles, d.goal, tw);
  w.addSpacer(8);
  if (d.alert) {
    alertRow(w, d.alert, 12);
    w.addSpacer(8);
  }
  if (d.nutrition) { nutritionRow(w, d.nutrition, 12); w.addSpacer(8); }
  if ((d.week || []).length) weekStrip(w, d.week, ymd(new Date()));
  w.addSpacer();
  footer(w, d, st, !d.alert && tomorrow ? `Morgen: ${tomorrow.line || dayLine(tomorrow)}` : null);
  return w;
}

// ---------- Sperrbildschirm ----------
function ringImage(score) {
  const s = 120;
  const lw = 11;
  const ctx = new DrawContext();
  ctx.size = new Size(s, s);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const c = s / 2;
  const r = c - lw / 2 - 2;
  ctx.setLineWidth(lw);
  ctx.setStrokeColor(new Color("#ffffff", 0.3));
  ctx.strokeEllipse(new Rect(c - r, c - r, 2 * r, 2 * r));
  const v = Math.max(0, Math.min(100, score || 0));
  if (v > 0) {
    const path = new Path();
    const pts = [];
    const steps = Math.max(2, Math.round(v * 1.2));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * v * i) / (100 * steps);
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    path.addLines(pts);
    ctx.addPath(path);
    ctx.setStrokeColor(Color.white());
    ctx.strokePath();
  }
  ctx.setTextAlignedCenter();
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(40));
  ctx.drawTextInRect(score == null ? "–" : String(score), new Rect(0, c - 30, s, 48));
  ctx.setFont(Font.semiboldSystemFont(14));
  ctx.drawTextInRect("ERH", new Rect(0, c + 16, s, 20));
  return ctx.getImage();
}

function accessory(family, d, st) {
  const { today: t, tomorrow, note } = resolve(d);
  const r = d.readiness || {};
  const w = base(family);
  const rest = isRest(t);
  const em = t.emoji || (rest ? "😴" : "🏃");
  if (family === "accessoryInline") {
    // Eine Zeile über der Uhr: „🏃 20:11 Tempodauerlauf · 88“
    const s = rest ? `${em} ${t.title} · ${r.score != null ? r.score : "–"}` : `${em} ${t.start ? t.start + " " : ""}${t.title} · ${r.score != null ? r.score : "–"}`;
    text(w, d.alert && d.alert.level === "critical" ? `${d.alert.icon} ${d.alert.title}` : s, F.body(12), Color.white(), { lines: 1 });
    return w;
  }
  w.addAccessoryWidgetBackground = true;
  if (family === "accessoryCircular") {
    w.setPadding(0, 0, 0, 0);
    if ((args.widgetParameter || "").trim().toLowerCase() === "zeit") {
      w.addSpacer();
      const a = hstack(w);
      a.addSpacer();
      icon(a, t.sf || "figure.run", 20, Color.white());
      a.addSpacer();
      const b = hstack(w);
      b.addSpacer();
      text(b, rest ? "Ruhe" : t.start || dur(t.duration), F.mono(13), Color.white(), { lines: 1, scale: 0.6 });
      b.addSpacer();
      w.addSpacer();
    } else {
      const img = w.addImage(ringImage(r.score));
      img.centerAlignImage();
    }
    return w;
  }
  // accessoryRectangular: drei Zeilen
  w.setPadding(4, 8, 4, 8);
  const l1 = hstack(w, 4);
  icon(l1, t.sf || "figure.run", 13, Color.white());
  text(l1, t.title, F.title(14), Color.white(), { lines: 1, scale: 0.7 });
  l1.addSpacer();
  const tl = timeLine(t, false);
  const l2 = rest
    ? (tomorrow ? `Morgen ${tomorrow.start || ""} ${tomorrow.emoji || ""} ${tomorrow.title || ""}`.replace(/\s+/g, " ").trim() : "Erholung")
    : [tl, t.intensity, note].filter(Boolean).join(" · ");
  text(w, l2, F.mono(12), Color.white(), { lines: 1, scale: 0.7 });
  const l3 = d.alert ? `${d.alert.icon} ${d.alert.title}` : `Erholung ${r.score != null ? r.score : "–"} · Form ${d.form ? signed(d.form.tsb) : "–"}`;
  text(w, l3, F.body(12), new Color("#ffffff", 0.8), { lines: 1, scale: 0.7 });
  w.addSpacer();
  return w;
}

function render(family, st) {
  const d = st.data;
  if (!d) {
    if (st.noToken) return message(family, "Token fehlt", "Öffne das Skript einmal in Scriptable und gib den GitHub-Token ein.");
    return message(family, "Keine Daten", st.error || "Noch keine Verbindung zu garvis-data.");
  }
  if (!d.training) return message(family, "Keine Daten", "widget.json hat kein Training.");
  if (family && family.startsWith("accessory")) return accessory(family, d, st);
  if (family === "medium") return medium(d, st);
  if (family === "large" || family === "extraLarge") return large(d, st);
  return small(d, st);
}

// ---------- Token & Menü (nur in der App) ----------
async function askToken() {
  const a = new Alert();
  a.title = "GitHub-Token für Garvis";
  a.message = "Fine-grained Token, nur Repository garvis-data, Recht „Contents: Read-only“. " +
    "Er wird nur im Schlüsselbund dieses iPhones gespeichert.";
  a.addSecureTextField("github_pat_…", "");
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  if ((await a.presentAlert()) === -1) return false;
  const token = a.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(KEY, token);
  return true;
}

async function info(title, msg) {
  const a = new Alert();
  a.title = title;
  a.message = msg;
  a.addAction("OK");
  await a.presentAlert();
}

async function preview(family, st) {
  const w = render(family, st);
  const p = {
    small: "presentSmall", medium: "presentMedium", large: "presentLarge",
    accessoryRectangular: "presentAccessoryRectangular", accessoryCircular: "presentAccessoryCircular",
    accessoryInline: "presentAccessoryInline",
  }[family];
  if (typeof w[p] === "function") await w[p]();
  else await w.presentSmall();
}

async function app() {
  if (!Keychain.contains(KEY)) {
    if (!(await askToken())) return;
  }
  let st = await load();
  if (st.error && !st.noToken) await info("Laden fehlgeschlagen", st.error + (st.data ? "\n\nDas Widget zeigt den letzten Stand." : ""));
  const items = [
    ["Vorschau klein", () => preview("small", st)],
    ["Vorschau mittel", () => preview("medium", st)],
    ["Vorschau groß", () => preview("large", st)],
    ["Sperrbildschirm rechteckig", () => preview("accessoryRectangular", st)],
    ["Sperrbildschirm rund", () => preview("accessoryCircular", st)],
    ["Sperrbildschirm Zeile", () => preview("accessoryInline", st)],
    ["Token ändern", async () => { if (await askToken()) st = await load(); }],
    ["Token löschen", async () => { if (Keychain.contains(KEY)) Keychain.remove(KEY); await info("Token gelöscht", "Beim nächsten Öffnen wird er neu abgefragt."); }],
  ];
  for (;;) {
    const m = new Alert();
    m.title = "Garvis-Widget";
    m.message = st.data ? `${st.data.label} · Stand ${st.data.stand}${st.error ? "\n⚠️ " + st.error : ""}` : st.error || "";
    items.forEach(([name]) => m.addAction(name));
    m.addCancelAction("Fertig");
    const i = await m.presentSheet();
    if (i === -1) break;
    await items[i][1]();
    if (items[i][0] === "Token löschen") break;
  }
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(render(config.widgetFamily, await load()));
} else {
  await app();
}
Script.complete();
