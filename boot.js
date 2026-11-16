/* Startet das Dashboard.
   Lokal (file://): data.js, today.js, app.js direkt laden (kein Face ID, kein Cache).
   Web-App: Daten aus dem privaten Repo garvis-data laden – mit einem GitHub-Lese-Schlüssel nur für dieses Repo,
   der nur auf diesem Gerät liegt (localStorage, optional per Face ID verschlüsselt).
   Der zuletzt erfolgreich geladene Datenstand liegt im Cache „garvis-data“ (versionsunabhängig) – so öffnet
   die App auch ohne Netz, statt erneut nach dem Schlüssel zu fragen.
   Schneller Start: liegt ein gespeicherter Stand vor, rendert die App sofort damit und lädt im Hintergrund nach
   (neuerer Stand → neu zeichnen + Hinweis „Aktualisiert“). Ohne Stand: Ladeanzeige (#bootLoad).
   window.GarvisData.refresh() lädt den Stand neu (Knopf „Aktualisieren“, Zurückholen der App, nach „Neu planen“). */
(() => {
const REPO = "PaulJustenhoven/garvis-data";
const URL_ = `https://api.github.com/repos/${REPO}/contents/bundle.json`;
const KEY = "garvis.token";        // Schlüssel im Klartext (ohne Face ID bzw. Modus „lock“)
const FID = "garvis.faceid";       // Face-ID-Daten (JSON, siehe Auth)
const MISS = "garvis.miss404";     // Zähler: wie oft in Folge beim Öffnen 404 kam
const DATA_CACHE = "garvis-data", DATA_REQ = "./__garvis_bundle__";

const $ = id => document.getElementById(id);
// leeres Grundgerüst der Ansichten nicht zeigen, bis app.js einmal komplett gezeichnet hat (app.js: bootReady) –
// sonst springt „Heute“ beim ersten Zeichnen um mehrere hundert Pixel nach unten (Ladeanzeige #bootLoad läuft ohnehin)
{ const m = document.querySelector("main.wrap"); if (m && !(window.GarvisApp && window.GarvisApp.reload)) { m.style.display = "none"; setTimeout(() => { m.style.display = ""; }, 8000); } }  // Sicherheitsnetz, falls app.js scheitert
const lock = $("lock"), form = $("lockForm"), msg = $("lockMsg"), sub = $("lockSub");
const btnFace = $("lockFace"), btnRetry = $("lockRetry"), btnKey = $("lockKey");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => {  // stückweise: große Puffer (Datenstand ~1,5 MB) sprengen sonst den Aufruf-Stack
  const u = new Uint8Array(buf); let out = "";
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(out);
};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

const script = src => new Promise((ok, fail) => {
  const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.body.appendChild(s);
});

// Aktueller Zustand (für Auth: Umschlüsseln ohne zweite Face-ID-Abfrage)
const cur = { token: null, aesKey: null, text: null, saved: null, pending: null };

// ---------------------------------------------------------------------------------------------
// Laden mit Wiederholung. Schlüssel gilt nur als ungültig bei 401 (bzw. 404 in Folge, s. web()).
// 403 mit x-ratelimit-remaining: 0 oder Retry-After = Rate-Limit → kein Schlüsselproblem.
// ---------------------------------------------------------------------------------------------
// Ablaufdatum des Fine-grained-Schlüssels (nur wenn GitHub den Header per CORS freigibt) → app.js warnt 7 Tage vorher
function noteExpiry(h) {
  const m = h && String(h).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) try { localStorage.setItem("garvis.tokenExp", JSON.stringify({ date: m[1], src: "github" })); } catch (e) { /* egal */ }
}
async function fetchOnce(token) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(URL_, {
      cache: "no-cache", signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
    });
    noteExpiry(res.headers.get("github-authentication-token-expiration"));
    if (res.ok) {
      const text = await res.text();
      JSON.parse(text);  // nur gültiges JSON übernehmen
      return { ok: true, text, exp: res.headers.get("github-authentication-token-expiration") };
    }
    const s = res.status;
    if (s === 401) return { kind: "auth", status: s };
    if (s === 404) return { kind: "notfound", status: s };
    if (s === 403 || s === 429) {
      const rl = res.headers.get("x-ratelimit-remaining") === "0" || res.headers.get("retry-after");
      return { kind: rl || s === 429 ? "ratelimit" : "forbidden", status: s };
    }
    return { kind: "server", status: s };
  } catch (e) {
    return { kind: "network", status: 0 };
  } finally { clearTimeout(to); }
}

async function fetchBundle(token) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await fetchOnce(token);
    if (r.ok || r.kind === "auth" || r.kind === "ratelimit" || r.kind === "forbidden") return r;
    if (r.kind === "network" && navigator.onLine === false) return r;  // sicher offline → gleich Cache
    if (i < 2) await sleep(i ? 1500 : 500);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// Letzter Datenstand (Cache Storage, versionsunabhängig; bei Face ID mit PRF verschlüsselt)
// ---------------------------------------------------------------------------------------------
async function saveCache(text) {
  cur.text = text; cur.saved = Date.now();
  if (!("caches" in window)) return;
  try {
    let body;
    if (cur.aesKey) {
      const iv = rand(12);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cur.aesKey, enc.encode(text));
      body = JSON.stringify({ v: 1, saved: cur.saved, enc: true, iv: b64(iv), ct: b64(ct) });
    } else body = JSON.stringify({ v: 1, saved: cur.saved, enc: false, text });
    const c = await caches.open(DATA_CACHE);
    await c.put(DATA_REQ, new Response(body, { headers: { "Content-Type": "application/json" } }));
  } catch (e) { /* Speicher voll o. Ä. – App läuft trotzdem */ }
}
async function readCache() {
  if (!("caches" in window)) return null;
  try {
    const c = await caches.open(DATA_CACHE);
    const res = await c.match(DATA_REQ);
    if (!res) return null;
    const o = await res.json();
    let text = o.text;
    if (o.enc) {
      if (!cur.aesKey) return null;
      text = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, cur.aesKey, unb64(o.ct)));
    }
    JSON.parse(text);
    return { text, saved: o.saved };
  } catch (e) { return null; }
}
const clearCache = () => ("caches" in window ? caches.delete(DATA_CACHE).catch(() => {}) : Promise.resolve());

// ---------------------------------------------------------------------------------------------
// Face ID: WebAuthn-Passkey (Plattform-Authenticator, userVerification "required").
// Modus "prf": PRF-Output → HKDF-SHA-256 → AES-GCM-256 → GitHub-Schlüssel verschlüsselt gespeichert.
// Modus "lock" (Fallback ohne PRF, z. B. iOS < 18): Face ID nur als Sperre, Schlüssel bleibt unverschlüsselt.
// ---------------------------------------------------------------------------------------------
const Auth = {
  cfg() { try { return JSON.parse(localStorage.getItem(FID)) || null; } catch (e) { return null; } },
  mode() { const c = this.cfg(); return c && (c.mode === "prf" || c.mode === "lock") ? c.mode : null; },
  async available() {
    try {
      return !!(window.isSecureContext && window.PublicKeyCredential && crypto.subtle &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { return false; }
  },
  async deriveKey(prfOut, hkdfSalt) {
    const base = await crypto.subtle.importKey("raw", prfOut, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: enc.encode("garvis github token v1") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  async assert(credId, prfSalt) {
    const pk = {
      challenge: rand(32), rpId: location.hostname, userVerification: "required", timeout: 60000,
      allowCredentials: [{ type: "public-key", id: credId, transports: ["internal", "hybrid"] }],
    };
    if (prfSalt) pk.extensions = { prf: { eval: { first: prfSalt } } };
    const a = await navigator.credentials.get({ publicKey: pk });
    if (!a) throw new Error("abgebrochen");
    const ext = a.getClientExtensionResults ? a.getClientExtensionResults() : {};
    return ext && ext.prf && ext.prf.results && ext.prf.results.first || null;
  },
  // Wichtig für Safari: create/get direkt im Klick-Handler aufrufen (kein await davor), sonst fehlt die Nutzergeste.
  async enable() {
    if (!cur.token) throw new Error("Kein Schlüssel geladen");
    const prfSalt = rand(32);
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { id: location.hostname, name: "Garvis" },
      user: { id: rand(16), name: "Garvis", displayName: "Garvis" },
      challenge: rand(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
      timeout: 60000, attestation: "none",
      extensions: { prf: { eval: { first: prfSalt } } },
    } });
    if (!cred) throw new Error("abgebrochen");
    const credId = new Uint8Array(cred.rawId);
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    const prfOut = ext.prf && ext.prf.results && ext.prf.results.first || null;
    if (prfOut) return this.finish(credId, prfSalt, prfOut);
    if (ext.prf && ext.prf.enabled === false) return this.finish(credId, null, null);  // kein PRF → nur Sperre
    // PRF-Wert kommt (z. B. in Safari) erst bei der Anmeldung → zweite Face-ID-Abfrage
    cur.pending = { credId, prfSalt };
    try { return await this.confirm(); }
    catch (e) { if (e && e.name === "NotAllowedError") return "confirm"; throw e; }  // UI: „noch einmal tippen“
  },
  async confirm() {
    const p = cur.pending;
    if (!p) throw new Error("Nichts zu bestätigen");
    const out = await this.assert(p.credId, p.prfSalt);
    cur.pending = null;
    return this.finish(p.credId, p.prfSalt, out);
  },
  async finish(credId, prfSalt, prfOut) {
    if (prfOut) {
      const hkdfSalt = rand(16), key = await this.deriveKey(prfOut, hkdfSalt), iv = rand(12);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(cur.token));
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);  // Probe, bevor der Klartext verschwindet
      localStorage.setItem(FID, JSON.stringify({ v: 1, mode: "prf", cred: b64(credId), prfSalt: b64(prfSalt), hkdfSalt: b64(hkdfSalt), iv: b64(iv), ct: b64(ct) }));
      localStorage.removeItem(KEY);
      cur.aesKey = key;
    } else {
      localStorage.setItem(FID, JSON.stringify({ v: 1, mode: "lock", cred: b64(credId) }));
      localStorage.setItem(KEY, cur.token);
      cur.aesKey = null;
    }
    if (cur.text) await saveCache(cur.text);  // Datenstand im neuen Format ablegen
    return this.mode();
  },
  async disable() {
    if (!cur.token) throw new Error("Kein Schlüssel geladen");
    localStorage.setItem(KEY, cur.token);
    localStorage.removeItem(FID);
    cur.aesKey = null;
    if (cur.text) await saveCache(cur.text);
  },
  // Beim Öffnen: Face ID → Schlüssel (wirft bei Abbruch/Fehler)
  async unlock() {
    const c = this.cfg();
    if (c.mode === "lock") {
      await this.assert(unb64(c.cred), null);
      return localStorage.getItem(KEY);
    }
    const out = await this.assert(unb64(c.cred), unb64(c.prfSalt));
    if (!out) throw Object.assign(new Error("Kein PRF-Wert"), { broken: true });
    const key = await this.deriveKey(out, unb64(c.hkdfSalt));
    let token;
    try { token = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(c.iv) }, key, unb64(c.ct))); }
    catch (e) { throw Object.assign(new Error("Entschlüsseln fehlgeschlagen"), { broken: true }); }
    cur.aesKey = key;
    return token;
  },
  // neuen Schlüssel speichern – bei aktivem PRF verschlüsselt mit dem bereits entsperrten Schlüssel
  async store(token) {
    const c = this.cfg();
    if (c && c.mode === "prf" && cur.aesKey) {
      const iv = rand(12);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cur.aesKey, enc.encode(token));
      localStorage.setItem(FID, JSON.stringify({ ...c, iv: b64(iv), ct: b64(ct) }));
      localStorage.removeItem(KEY);
    } else {
      if (c && c.mode === "prf") localStorage.removeItem(FID);  // PRF-Schlüssel unbekannt → Face ID neu einrichten
      localStorage.setItem(KEY, token);
    }
  },
  async forget() {
    localStorage.removeItem(KEY); localStorage.removeItem(FID); localStorage.removeItem(MISS);
    cur.token = null; cur.aesKey = null;
    await clearCache();
  },
};

// ---------------------------------------------------------------------------------------------
// Sperrbildschirm
// ---------------------------------------------------------------------------------------------
function screen({ text = "", note = "", input = false, face = false, retry = false, key = false }) {
  lock.hidden = false;
  sub.textContent = text;
  msg.textContent = note;
  form.hidden = !input; btnFace.hidden = !face; btnRetry.hidden = !retry; btnKey.hidden = !key;
  if (input) { form.pw.value = ""; }
}
function ask(note) {
  screen({ text: "GitHub-Schlüssel einmal eingeben – danach merkt sich das Gerät ihn.", note, input: true });
}
form.addEventListener("submit", async e => {
  e.preventDefault();
  const token = form.pw.value.trim();
  if (!token) return;
  msg.textContent = "Lade …";
  const r = await fetchBundle(token);
  if (r.ok) {
    localStorage.removeItem(MISS);
    await Auth.store(token);
    try { sessionStorage.setItem("garvis.keyNew", "1"); localStorage.removeItem("garvis.tokenExp"); noteExpiry(r.exp); } catch (e) { /* egal */ }  // app.js prüft einmal die Rechte
    return start(token, r.text, null);
  }
  msg.textContent = r.kind === "auth" ? "Schlüssel ungültig oder abgelaufen"
    : r.kind === "notfound" || r.kind === "forbidden" ? "Schlüssel hat keinen Zugriff auf das Daten-Repo"
    : r.kind === "ratelimit" ? "GitHub-Limit erreicht – in ein paar Minuten erneut versuchen"
    : "Laden fehlgeschlagen – keine Verbindung?";
});
btnFace.addEventListener("click", () => web());
btnRetry.addEventListener("click", () => { msg.textContent = "Lade …"; web(); });
btnKey.addEventListener("click", async () => {
  if (!window.confirm("Gespeicherten Schlüssel und Datenstand von diesem Gerät entfernen und einen neuen Schlüssel eingeben?")) return;
  await Auth.forget(); ask();
});

// Dezenter Hinweis „offline – Stand von …“
function netNote(text) {
  const n = $("netNote");
  if (!n) return;
  n.querySelector("span").textContent = text;
  n.hidden = false;
}
$("netRetry") && $("netRetry").addEventListener("click", () => {  // ohne Seiten-Reload (sonst erneut Face ID)
  if (window.GarvisData && cur.token) window.GarvisData.refresh().then(r => { if (r.status === "new" && window.GarvisApp && window.GarvisApp.toast) window.GarvisApp.toast("Aktualisiert"); });
  else location.reload();
});

// ---------------------------------------------------------------------------------------------
const standOf = (text, saved) => {
  let g = null; try { g = JSON.parse(text).today; g = g && g.generated; } catch (e) { /* egal */ }
  const m = g && g.match(/^\d{4}-(\d\d)-(\d\d)[ T](\d\d:\d\d)/);  // „2026-11-03 18:49“ = Stand der Daten
  return m ? `${+m[2]}.${+m[1]}., ${m[3]} Uhr`
    : new Date(saved || Date.now()).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";
};
const applyBundle = text => {
  const p = JSON.parse(text);
  window.GARMIN = p.data;
  window.TODAY = p.today || null;
  window.PHOTO = p.photo ? "data:image/png;base64," + p.photo : null;
};
const appRunning = () => !!(window.GarvisApp && window.GarvisApp.reload);
const bootLoad = on => { const b = $("bootLoad"); if (b) b.hidden = !on; };
// opts.quiet: gespeicherter Stand beim schnellen Start (kein Offline-Hinweis, Nachladen läuft)
async function start(token, text, offline, opts = {}) {
  JSON.parse(text);
  cur.token = token;
  if (!offline) await saveCache(text);
  else { cur.text = text; cur.saved = offline.saved; }
  lock.hidden = true;
  applyBundle(text);
  window.GarvisAuth = {
    available: () => Auth.available(), mode: () => Auth.mode(),
    enable: () => Auth.enable(), confirm: () => Auth.confirm(), disable: () => Auth.disable(),
    forget: () => Auth.forget(),
  };
  // Schnittstelle für app.js (z. B. Einstellungen speichern): Schlüssel nur im Speicher, nie im DOM
  window.GARVIS = { web: true, token: () => cur.token, dataRepo: REPO, offline: !!offline && !opts.quiet };
  if (offline && !opts.quiet) netNote(`${offline.reason} – Stand von ${standOf(text, offline.saved)}`);
  else if (!offline) { const n = $("netNote"); if (n) n.hidden = true; }
  if (appRunning()) { window.GarvisApp.reload(); bootLoad(false); }  // z. B. nach neuem Schlüssel: nicht doppelt starten
  else await script("app.js");
}

// Nachladen mit unveränderter Fehlerlogik (401 → Schlüssel neu, 404 zweimal in Folge → Schlüssel neu, sonst Hinweis)
const reasonOf = r => r.kind === "network" ? "Offline" : r.kind === "ratelimit" ? "GitHub-Limit erreicht"
  : r.kind === "forbidden" ? "Kein Zugriff (403)" : r.kind === "notfound" ? "Daten nicht gefunden" : `Server-Fehler (${r.status})`;
async function refreshWeb() {
  const token = cur.token;
  if (!token) return { status: "error", reason: "Kein Schlüssel geladen" };
  const r = await fetchBundle(token);
  if (r.ok) {
    localStorage.removeItem(MISS);
    const n = $("netNote"); if (n) n.hidden = true;
    window.GARVIS.offline = false;
    if (r.text === cur.text) { cur.saved = Date.now(); return { status: "same" }; }
    await saveCache(r.text);
    applyBundle(r.text);
    if (appRunning()) window.GarvisApp.reload();
    return { status: "new" };
  }
  if (r.kind === "auth") { await Auth.forget(); ask("Schlüssel abgelaufen oder ungültig – bitte neu eingeben"); return { status: "error", reason: "Schlüssel ungültig" }; }
  if (r.kind === "notfound") {
    const n = (+localStorage.getItem(MISS) || 0) + 1;
    localStorage.setItem(MISS, n);
    if (n >= 2) { await Auth.forget(); ask("Schlüssel hat keinen Zugriff (mehrfach 404) – bitte neu eingeben"); return { status: "error", reason: "Kein Zugriff" }; }
  }
  const reason = reasonOf(r);
  netNote(`${reason} – Stand von ${standOf(cur.text, cur.saved)}`);
  return { status: "error", reason };
}
let refreshing = null;
window.GarvisData = { refresh: () => refreshing || (refreshing = refreshWeb().finally(() => { refreshing = null; })) };

let running = false;
async function web() {
  if (running) return;
  running = true;
  try { await webInner(); } finally { running = false; }
}
async function webInner() {
  let token = null;
  if (Auth.mode()) {
    screen({ text: "Mit Face ID entsperren …" });
    try { token = await Auth.unlock(); }
    catch (e) {
      // Abbruch, fehlende Nutzergeste (Safari) oder gelöschter Passkey → Knopf anbieten
      return screen({
        text: e.broken ? "Face ID konnte den Schlüssel nicht entschlüsseln." : "Garvis ist mit Face ID geschützt.",
        note: e.broken ? "Bitte den Schlüssel neu eingeben." : "", face: !e.broken, key: true,
      });
    }
    if (!token) { localStorage.removeItem(FID); return ask(); }
    lock.hidden = true;  // entsperrt → Ladeanzeige statt Sperrbildschirm
  } else token = localStorage.getItem(KEY);
  if (!token) return ask();

  // Schneller Start: gespeicherten Stand sofort zeigen, im Hintergrund nachladen
  const saved = await readCache();
  if (saved) {
    await start(token, saved.text, { saved: saved.saved, reason: "" }, { quiet: true });
    const res = await window.GarvisData.refresh();
    if (res.status === "new" && window.GarvisApp && window.GarvisApp.toast) window.GarvisApp.toast("Aktualisiert");
    return;
  }
  const r = await fetchBundle(token);
  if (r.ok) { localStorage.removeItem(MISS); return start(token, r.text, null); }

  // 401: Schlüssel eindeutig ungültig → verwerfen
  if (r.kind === "auth") { await Auth.forget(); return ask("Schlüssel abgelaufen oder ungültig – bitte neu eingeben"); }
  // 404 bei mehreren Versuchen in Folge (2. Öffnen) → Schlüssel ohne Zugriff
  if (r.kind === "notfound") {
    const n = (+localStorage.getItem(MISS) || 0) + 1;
    localStorage.setItem(MISS, n);
    if (n >= 2) { await Auth.forget(); return ask("Schlüssel hat keinen Zugriff (mehrfach 404) – bitte neu eingeben"); }
  }
  const reason = reasonOf(r);
  const cached = await readCache();
  if (cached) return start(token, cached.text, { saved: cached.saved, reason });
  screen({ text: `${reason} – und noch kein gespeicherter Datenstand.`, note: "Dein Schlüssel bleibt gespeichert.", retry: true, key: r.kind !== "network" });
}

// ---------- App-Update (Service Worker) ----------
// Die laufende Seite hat ihre Skripte schon geladen; ein neuer SW (skipWaiting + clients.claim) übernimmt sofort, die alte
// Seite läuft aber mit dem alten Code weiter. Deshalb: dezenter Hinweis „Neue Version – neu laden“; kommt die App nach
// ≥ 1 min im Hintergrund zurück und ist nichts offen (kein Blatt, keine Eingabe), einmal still neu laden.
// Beim ersten Installieren (vorher kein SW) gibt es nichts zu melden.
function swUpdates() {
  const sw = navigator.serviceWorker, had = !!sw.controller, RL = "garvis.swReload";
  let pending = false, hiddenAt = 0;
  sw.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });  // nach Rückkehr nach Updates schauen
  }).catch(() => {});
  const idle = () => {
    const a = document.activeElement;
    return !/(?:^|\s)(?:ds|ac|nu|info)-lock(?:\s|$)/.test(document.documentElement.className)
      && !/^#mehr\//.test(location.hash)  // Detailseiten mit Formularen (Ziel, Orte …): nie still neu laden
      && !(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
  };
  const reload = () => { try { sessionStorage.setItem(RL, String(Date.now())); } catch (e) { /* egal */ } location.reload(); };
  const note = () => {
    let n = $("updNote");
    if (!n) {
      n = document.createElement("div"); n.className = "netnote"; n.id = "updNote";
      n.innerHTML = `<div><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg><span role="status">Neue Version verfügbar</span><button type="button">Neu laden</button></div>`;
      n.querySelector("button").addEventListener("click", reload);
      const ref = $("netNote"); if (ref) ref.after(n); else document.body.prepend(n);
    }
    n.hidden = false;
  };
  sw.addEventListener("controllerchange", () => {
    // Wechsel kurz nach dem Laden: Seite kam schon frisch vom Netz (SW: erst Netz) – das Update ist bereits die laufende Version
    if (!had || pending || performance.now() < 20000) return;
    pending = true;
    // gerade erst neu geladen (z. B. Update kam während des Ladens): nicht in einer Schleife neu laden, nur Hinweis
    let recent = false; try { recent = Date.now() - (+sessionStorage.getItem(RL) || 0) < 60000; } catch (e) { /* egal */ }
    if (document.hidden && !recent && idle()) return reload();
    note();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (pending && hiddenAt && Date.now() - hiddenAt > 60000 && idle()) reload();
  });
}

if (location.protocol === "file:") {
  window.GARVIS = { web: false, token: () => null, dataRepo: REPO, offline: false };
  script("data.js").then(() => script("today.js").catch(() => { window.TODAY = null; })).then(() => script("app.js"));
  // Lokal: data.js/today.js neu einlesen
  const sig = () => JSON.stringify([window.GARMIN && window.GARMIN.generated, window.TODAY && window.TODAY.generated]);
  window.GarvisData = { refresh: async () => {
    const before = sig(), q = "?t=" + Date.now();
    try { await script("data.js" + q); await script("today.js" + q).catch(() => {}); } catch (e) { return { status: "error", reason: "Laden fehlgeschlagen" }; }
    if (sig() === before) return { status: "same" };
    window.GarvisApp.reload();
    return { status: "new" };
  } };
} else {
  if ("serviceWorker" in navigator) swUpdates();
  web();
}
})();
