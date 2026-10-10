"use strict";

// Offline-Betrieb und wenig Anfragen:
//   index.html „Netz zuerst“ (neue Version erkennen, bei schlechtem Empfang nach 3 s die gespeicherte),
//   alle anderen eigenen Dateien „Speicher zuerst“, solange die Version gleich ist (main.js?v= in index.html). Kommt eine
//   index.html mit anderer Version, werden die gespeicherten App-Dateien vorher weggeworfen – danach lädt jedes Modul frisch,
//   alte und neue mischen sich nie. Darum: nach jeder Änderung an CSS/JS ?v= in index.html hochzählen.
//   Kartenbilder (TCGdex, pokemontcg.io, Limitless/TCGplayer über GET /img des Backends) & Schriften „Speicher zuerst“.
//   Kartensuche/Preise (api.tcgdex.net) und das Sync-Backend laufen immer übers Netz.
// Live (/) und Dev (/dev/) liegen auf derselben Domain → je ein eigener Speicher, sonst räumt der eine dem anderen auf.
// ponytail: Bilder werden nie aufgeräumt (wenige MB) – Speicher umbenennen, falls das mal stört.
const CACHE = `ps-v3${new URL(self.registration.scope).pathname}`;
const VERSION = "./version"; // Version der gespeicherten App-Dateien
const versionOf = (html) => html.match(/js\/main\.js\?v=(\d+)/)?.[1] ?? null;

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
      await cache.put(VERSION, new Response(versionOf(html) ?? ""));
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

// Alte Speicher (ps-v2 teilten sich Live und Dev) weg
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("ps-v2")).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(req.mode === "navigate" || url.pathname.endsWith("/") ? page(req) : cacheFirst(req, { cache: "no-cache" }));
  else if (["assets.tcgdex.net", "images.pokemontcg.io", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname) || isProxiedImage(url)) e.respondWith(cacheFirst(req));
});

// Kartenbild über den Durchreicher des Backends (Live und Dev)
const isProxiedImage = (url) => url.hostname.endsWith(".pokemon-sammlung-backend.workers.dev") && url.pathname === "/img";

// init: für eigene Dateien { cache: "no-cache" } – nach einem Versionswechsel nie eine alte Fassung aus dem Browser-Cache
async function cacheFirst(req, init) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req, init);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// index.html: übers Netz; schlechter Empfang (Kartenbörse) → nach 3 s die gespeicherte. Nur die tatsächlich ausgelieferte
// Antwort wird übernommen – eine verspätete neue Fassung darf den Speicher nicht leeren, während die Seite schon aus ihm lädt.
async function page(req) {
  const cache = await caches.open(CACHE);
  const net = req.mode === "navigate" ? fetch(req) : fetch(req, { cache: "no-cache" });
  net.catch(() => {});
  const res = await Promise.race([net, new Promise((r) => setTimeout(r, 3000))]).catch(() => null);
  if (res?.ok) {
    await adopt(cache, req, res.clone());
    return res;
  }
  return (await cache.match(req)) || (req.mode === "navigate" && (await cache.match("./"))) || net;
}

// Neue Version? Dann erst die gespeicherten eigenen Dateien weg, danach die neue index.html merken
async function adopt(cache, req, res) {
  const version = versionOf(await res.clone().text());
  if (version && version !== (await (await cache.match(VERSION))?.text())) {
    for (const key of await cache.keys()) if (new URL(key.url).origin === location.origin) await cache.delete(key);
    await cache.put(VERSION, new Response(version));
  }
  await cache.put(req, res);
}
