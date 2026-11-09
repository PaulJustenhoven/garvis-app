/* Offline-Cache für die App-Hülle: erst Netz, bei Funkloch die zuletzt geladene Version.
   - Die Hülle wird beim install vorab gecacht; der alte Cache wird erst nach erfolgreichem install gelöscht.
   - Nur erfolgreiche Antworten der eigenen Seite landen im Cache (keine Fehlerseiten, keine GitHub-API).
   - Den Datenstand verwaltet boot.js im versionsunabhängigen Cache „garvis-data“ – den rührt der SW nicht an.
   - Versionsname: publish.py ersetzt e30dc62d7e8e durch einen Hash über alle veröffentlichten Dateien (inkl. JSON/WASM) →
     jede Änderung an irgendeiner Datei ergibt einen neuen Cache.
   - LAZY (Barcode-Scanner, ~1 MB WASM + ~45 KB Polyfill): nicht in der Hülle, damit nicht jedes Update auf dem Handy 1 MB lädt,
     obwohl der Scanner selten genutzt wird. Beim ersten Scannen legt der fetch-Handler unten beide Dateien im Cache ab
     (gleiche Herkunft, Antwort-Typ „basic“). Bei einem Update übernimmt install sie nur, wenn sie schon einmal geladen
     wurden – frisch vom Netz (HTTP-Revalidierung, meist 304) und nur als Paar, damit Polyfill und WASM zusammenpassen. */
const CACHE = "garvis-app-e30dc62d7e8e";
const DATA_CACHE = "garvis-data";
const SHELL = ["./", "index.html", "boot.js", "app.js", "strength.js", "strength.css", "nutrition.js", "nutrition.css", "perf.js", "perf.css", "actions.js", "actions.css", "manifest.webmanifest", "icon-180.png", "icon-512.png",
  "nutrients.json", "supplements.json", "generic_foods.json", "dishes.json"];  // Grundnahrungsmittel (~100 KB) – Suche auch offline  // Nährstoff-/Supplement-Inhalte (~190 KB) – auch offline lesbar
const LAZY = ["barcode-polyfill.js", "zxing_reader.wasm"];

// Barcode-Scanner aus der alten Version übernehmen (nur wenn schon einmal genutzt); Fehler brechen die Installation nicht ab
async function carryLazy(c) {
  const olds = (await caches.keys()).filter(k => k.startsWith("garvis-app-") && k !== CACHE);
  const had = [];
  for (const k of olds) { const o = await caches.open(k); if ((await Promise.all(LAZY.map(u => o.match(u)))).every(Boolean)) { had.push(o); break; } }
  if (!had.length) return;
  try {
    const res = await Promise.all(LAZY.map(u => fetch(new Request(u, { cache: "no-cache" }))));
    if (res.every(r => r.ok && r.type === "basic")) { await Promise.all(LAZY.map((u, i) => c.put(u, res[i]))); return; }
  } catch (err) { /* offline – unten die alte Fassung übernehmen */ }
  await Promise.all(LAZY.map(async u => c.put(u, await had[0].match(u))));  // beide aus derselben alten Version → passen zusammen
}
self.addEventListener("install", e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))).then(() => carryLazy(c).catch(() => {})))
    .then(() => self.skipWaiting())
));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("garvis") && k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

const timeout = (p, ms) => new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error("timeout")), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); fail(e); }); });

async function fromCache(req) {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) ||
    (req.mode === "navigate" ? (await c.match("index.html")) || (await c.match("./")) : undefined);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;  // GitHub-API etc. nicht anfassen
  e.respondWith((async () => {
    // cache: "no-cache" → immer beim Server nachfragen (meist 304). Sonst liefert der HTTP-Cache des Browsers (GitHub Pages:
    // max-age 10 min) nach einem Update evtl. noch alte Module zur neuen index.html – ein Mix aus alten und neuen Dateien.
    const net = fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    });
    net.catch(() => {});  // Ablehnung wird unten behandelt
    try {
      // Navigation: bei sehr langsamem Netz nach 4 s die gecachte Hülle zeigen
      const res = req.mode === "navigate" ? await timeout(net, 4000) : await net;
      if (!res.ok) { const c = await fromCache(req); if (c) return c; }
      return res;
    } catch (err) {
      const c = await fromCache(req);
      if (c) return c;
      return net;  // nichts im Cache → auf das Netz warten (liefert ggf. den Fehler)
    }
  })());
});
