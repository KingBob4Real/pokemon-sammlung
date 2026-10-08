"use strict";

// Offline-Betrieb: eigene Dateien „Netz zuerst“ (Updates kommen sofort an), Kartenbilder (TCGdex, pokemontcg.io) & Schriften „Speicher zuerst“.
// Kartensuche/Preise (api.tcgdex.net) und das Sync-Backend laufen immer übers Netz.
// ponytail: ein Cache ohne Aufräumen – alte ?v=-Stände bleiben liegen (wenige KB), CACHE umbenennen + löschen, falls das mal stört.
const CACHE = "ps-v2"; // eigener Name: die alte Checkliste teilt sich den Speicher dieser Domain

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Beim ersten Besuch liefen Seite, CSS und JS noch am Service Worker vorbei → gleich alles sichern.
  // Dateien kommen aus index.html (relative href/src) und den import-Zeilen der JS-Module – keine Liste zu pflegen.
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const res = await fetch("./", { cache: "no-cache" });
      const html = await res.clone().text();
      await cache.put("./", res);
      const seen = new Set();
      const files = [...html.matchAll(/(?:href|src)="([^":#]+)"/g)].map((m) => new URL(m[1], location.href).href);
      await Promise.all(files.map((url) => precache(cache, url, seen)));
    })
  );
});

// Datei sichern; bei JS-Modulen auch alles, was sie importieren
async function precache(cache, url, seen) {
  if (seen.has(url)) return;
  seen.add(url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(url, res.clone());
  if (/\.js(\?|$)/.test(url)) {
    const imports = [...(await res.text()).matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"/g)].map((m) => new URL(m[1], url).href);
    await Promise.all(imports.map((u) => precache(cache, u, seen)));
  }
}

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin || url.hostname === "fonts.googleapis.com") e.respondWith(networkFirst(req));
  else if (["assets.tcgdex.net", "images.pokemontcg.io", "fonts.gstatic.com"].includes(url.hostname)) e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Immer beim Server nachfragen (no-cache), damit nie alte und neue Module gemischt werden.
// Schlechter Empfang (Kartenbörse): nach 3 s die gespeicherte Fassung zeigen statt ewig zu warten.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = (req.mode === "navigate" ? fetch(req) : fetch(req, { cache: "no-cache" })).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    const res = await Promise.race([net, new Promise((r) => setTimeout(r, 3000))]);
    if (res) return res;
  } catch {
    /* offline → Speicher */
  }
  return (await cache.match(req)) || (req.mode === "navigate" && (await cache.match("./"))) || net;
}
