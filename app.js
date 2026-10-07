"use strict";

(() => {
  const TCG = "https://api.tcgdex.net/v2";
  const OLD_APP = "https://kingbob4real.github.io/pokemon-karten-checkliste/";
  const CM_FILTER = "language=3&minCondition=3"; // Cardmarket: nur deutsche Karten ab Excellent
  const DAY = 24 * 60 * 60 * 1000;
  const SEARCH_LIMIT = 120;
  const KEYS = {
    docs: "ps.docs.v1",
    dirty: "ps.dirty.v1",
    rev: "ps.rev.v1",
    sync: "ps.sync.v1",
    prices: "ps.prices.v1",
    sets: "ps.sets.v1",
    ui: "ps.ui.v1",
  };
  const KINDS = ["card", "list", "member"];
  const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
  const LANGUAGES = ["Deutsch", "Englisch", "Japanisch", "Französisch", "Italienisch", "Spanisch", "Andere"];
  const ICON_CHECK =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- Speicher (localStorage, robust gegen Privatmodus) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Speicher voll oder gesperrt – App läuft trotzdem weiter */
      }
    },
  };
  const isObj = (x) => x != null && typeof x === "object" && !Array.isArray(x);
  const objOr = (x) => (isObj(x) ? x : {});

  // Alle Daten sind Dokumente: c:<kartenId> (Sammlung), l:<listenId> (Liste), m:<listenId>:<kartenId> (Karte in Liste).
  const state = {
    docs: new Map(),
    dirty: new Set(),
    rev: Number(store.get(KEYS.rev, 0)) || 0,
    sync: { url: "", key: "", at: 0, error: "", ...objOr(store.get(KEYS.sync, {})) },
    syncing: false,
    prices: objOr(store.get(KEYS.prices, {})),
    sets: null,
    ui: { collSort: "newest", listSort: "order", listFilter: "all", ...objOr(store.get(KEYS.ui, {})) },
    query: "",
    collFilter: "",
    results: null,
    meta: new Map(), // Kartendaten der angezeigten Kacheln, für Antippen
    summary: null, // aktualisiert Zahlen der aktuellen Ansicht
    sheet: null,
  };
  for (const [id, d] of Object.entries(objOr(store.get(KEYS.docs, {})))) {
    if (isObj(d) && d.id === id && KINDS.includes(d.kind)) state.docs.set(id, d);
  }
  for (const id of [].concat(store.get(KEYS.dirty, []))) if (state.docs.has(id)) state.dirty.add(id);

  const $ = (sel) => document.querySelector(sel);
  const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  let setsReady = Promise.resolve();
  let searchTimer = null;
  let searchSeq = 0;
  let filterTimer = null;
  let syncTimer = null;

  // ---------- Hilfsfunktionen ----------
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children)) if (c != null) el.append(c);
    return el;
  }

  const num = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
  const fmtEur = (x) => (x == null ? "–" : (x >= 100 ? eur0 : eur2).format(x));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const numCmp = (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b));

  function parseEuro(text) {
    const cleaned = String(text).replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }

  async function fetchJson(url, ms = 10000, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Dokumente ----------
  function put(id, kind, data) {
    const prev = state.docs.get(id);
    state.docs.set(id, { id, kind, data, deleted: data == null ? 1 : 0, updated: Math.max(Date.now(), (prev?.updated || 0) + 1) });
    state.dirty.add(id);
  }

  // nach einer Reihe von put(): speichern und Sync anstoßen
  function commit() {
    store.set(KEYS.docs, Object.fromEntries(state.docs));
    store.set(KEYS.dirty, [...state.dirty]);
    scheduleSync();
    updateSyncDot();
  }

  const docsOf = (kind) => [...state.docs.values()].filter((d) => d.kind === kind && !d.deleted && isObj(d.data));
  const live = (id) => {
    const d = state.docs.get(id);
    return d && !d.deleted && isObj(d.data) ? d.data : null;
  };
  const entry = (cardId) => live(`c:${cardId}`);
  const qtyOf = (cardId) => entry(cardId)?.qty || 0;
  const owned = (cardId) => qtyOf(cardId) > 0;
  const collection = () => docsOf("card").map((d) => d.data).filter((e) => e.qty > 0 && isObj(e.card));
  const lists = () => docsOf("list").map((d) => ({ ...d.data, id: d.id.slice(2) })).sort((a, b) => a.created - b.created);
  const members = (listId) => docsOf("member").map((d) => d.data).filter((m) => m.list === listId && isObj(m.card));
  const inList = (listId, cardId) => live(`m:${listId}:${cardId}`) != null;

  // Anzahl 0 behält Zustand & Kaufpreis – versehentlich entfernt ist so nichts verloren
  function setQty(meta, qty) {
    const prev = entry(meta.id);
    put(`c:${meta.id}`, "card", {
      cond: "Near Mint",
      lang: "Deutsch",
      paid: null,
      ...prev,
      card: meta,
      qty: Math.max(0, Math.min(999, qty)),
      added: prev && prev.qty > 0 ? prev.added : Date.now(),
    });
  }

  function patchEntry(cardId, patch) {
    const e = entry(cardId);
    if (e) put(`c:${cardId}`, "card", { ...e, ...patch });
  }

  // ---------- Sets & Kartendaten ----------
  const setInfo = (id) => state.sets?.index.get(id) || null;
  const setOrder = (id) => setInfo(id)?.order ?? -1;
  const setIdOf = (c) => c.id.slice(0, c.id.length - String(c.localId).length - 1);

  function useSets(d) {
    state.sets = { list: d.list, pocket: new Set(d.pocket), index: new Map(d.list.map((s, i) => [s.id, { ...s, order: i }])) };
  }

  // Sets eine Woche zwischenspeichern; TCG-Pocket (digitale Karten) ausblenden
  async function loadSets() {
    const cached = store.get(KEYS.sets, null);
    if (isObj(cached) && Array.isArray(cached.list)) useSets(cached);
    if (cached && Date.now() - cached.at < 7 * DAY) return;
    try {
      const [all, pocket] = await Promise.all([fetchJson(`${TCG}/de/sets`), fetchJson(`${TCG}/de/series/tcgp`)]);
      const skip = (pocket.sets || []).map((s) => s.id);
      const list = all
        .filter((s) => !skip.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, total: s.cardCount?.total ?? null, official: s.cardCount?.official ?? null }));
      const data = { at: Date.now(), list, pocket: skip };
      store.set(KEYS.sets, data);
      useSets(data);
    } catch {
      /* offline: alter Stand bleibt */
    }
  }

  // TCGdex-Karte (kurz oder voll) → was wir speichern
  function metaOf(c) {
    const setId = c.set?.id || setIdOf(c);
    const s = setInfo(setId);
    return {
      id: c.id,
      name: c.name,
      num: c.localId,
      set: setId,
      setName: c.set?.name || s?.name || setId,
      total: c.set?.cardCount?.official || s?.official || null,
      img: c.image || null,
    };
  }

  const numText = (m) => (m.total ? `${m.num}/${String(m.total).padStart(3, "0")}` : m.num);

  // ---------- Preise (Cardmarket-Richtwerte über TCGdex, 24 h zwischengespeichert) ----------
  const priceQueue = new Set();
  let pricesRunning = false;

  function value(cardId) {
    const p = state.prices[cardId];
    return p ? p.trend ?? p.avg30 ?? p.low : null;
  }

  async function fetchCard(id) {
    try {
      return await fetchJson(`${TCG}/de/cards/${encodeURIComponent(id)}`);
    } catch {
      return await fetchJson(`${TCG}/en/cards/${encodeURIComponent(id)}`);
    }
  }

  function extract(c) {
    const cm = c?.pricing?.cardmarket;
    const first = (...v) => v.map(num).find((x) => x != null) ?? null;
    return {
      at: Date.now(),
      low: cm ? first(cm.low, cm["low-holo"]) : null,
      trend: cm ? first(cm.trend, cm["trend-holo"]) : null,
      avg30: cm ? first(cm.avg30, cm["avg30-holo"]) : null,
      cm: cm?.idProduct || null,
      updated: cm?.updated || null,
      rarity: c?.rarity || null,
    };
  }

  function wantPrices(ids) {
    for (const id of ids) {
      const p = state.prices[id];
      if (!p || Date.now() - p.at > DAY) priceQueue.add(id);
    }
    runPrices();
  }

  async function runPrices() {
    if (pricesRunning || !priceQueue.size || !navigator.onLine) return;
    pricesRunning = true;
    let done = 0;
    const worker = async () => {
      while (priceQueue.size) {
        const id = priceQueue.values().next().value;
        priceQueue.delete(id);
        try {
          state.prices[id] = extract(await fetchCard(id));
        } catch {
          /* bleibt beim alten Wert */
        }
        if (++done % 15 === 0) refresh();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    store.set(KEYS.prices, state.prices);
    pricesRunning = false;
    refresh();
  }

  function cardmarketUrl(meta) {
    const id = state.prices[meta.id]?.cm;
    return id
      ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(id)}&${CM_FILTER}`
      : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(meta.name)}&${CM_FILTER}`;
  }

  // ---------- Sync mit dem Cloudflare-Backend ----------
  function scheduleSync(ms = 1500) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, ms);
  }

  async function sync() {
    const { url, key } = state.sync;
    if (!url || !key || state.syncing || !navigator.onLine) return updateSyncDot();
    state.syncing = true;
    updateSyncDot();
    let changed = false;
    try {
      // höchstens 500 Änderungen pro Anfrage, bis alles oben ist
      for (let round = 0; round < 50; round++) {
        const changes = [...state.dirty].slice(0, 500).map((id) => state.docs.get(id)).filter(Boolean);
        const res = await fetchJson(`${url.replace(/\/+$/, "")}/sync`, 20000, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ since: state.rev, changes }),
        });
        const server = new Map(res.docs.map((d) => [d.id, d]));
        for (const d of res.docs) {
          const local = state.docs.get(d.id);
          if (!local || d.updated > local.updated) changed = true;
          if (!local || d.updated >= local.updated) state.docs.set(d.id, d);
        }
        // sauber, wenn der Server denselben oder einen neueren Stand hat (sonst wurde unterwegs weiter geändert)
        for (const c of changes) if (server.has(c.id) && state.docs.get(c.id).updated <= server.get(c.id).updated) state.dirty.delete(c.id);
        state.rev = res.rev;
        if (!state.dirty.size || !changes.length) break;
      }
      state.sync.at = Date.now();
      state.sync.error = "";
    } catch (e) {
      state.sync.error = e.status === 401 ? "Falscher Sync-Schlüssel" : e.status ? `Backend meldet Fehler ${e.status}` : "Backend nicht erreichbar";
    }
    state.syncing = false;
    store.set(KEYS.docs, Object.fromEntries(state.docs));
    store.set(KEYS.dirty, [...state.dirty]);
    store.set(KEYS.rev, state.rev);
    store.set(KEYS.sync, state.sync);
    updateSyncDot();
    if (changed) ["suche", "set", "mehr"].includes(route().tab) ? refresh() : render();
  }

  function syncText() {
    const s = state.sync;
    if (!s.url || !s.key) return "Sync ist aus. Deine Daten liegen nur auf diesem Gerät.";
    if (state.syncing) return "Synchronisiere …";
    if (s.error) return `Fehler: ${s.error}`;
    const pending = state.dirty.size ? ` · ${state.dirty.size} Änderungen warten aufs Hochladen` : "";
    if (!s.at) return `Noch nicht synchronisiert${pending}`;
    return `Zuletzt synchronisiert: ${new Date(s.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}${pending}`;
  }

  function updateSyncDot() {
    const s = state.sync;
    const st = !s.url || !s.key ? "off" : state.syncing ? "busy" : s.error ? "error" : state.dirty.size ? "pending" : "ok";
    $("#syncDot").dataset.state = st;
    $("#syncLabel").textContent = { off: "Sync aus", busy: "Sync …", error: "Sync-Fehler", pending: "Nicht synchron", ok: "Synchron" }[st];
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = syncText();
  }

  // 20 Zeichen aus 32 gut abtippbaren Zeichen (ohne I, L, O, U) = 100 Bit
  function newKey() {
    const abc = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
    return [...crypto.getRandomValues(new Uint8Array(20))].map((b) => abc[b & 31]).join("").match(/.{4}/g).join("-");
  }
  const cleanKey = (k) => (k.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g) || []).join("-");

  // ---------- Ansichten ----------
  const TABS = { sammlung: "sammlung", listen: "listen", liste: "listen", suche: "suche", set: "suche", mehr: "mehr" };

  function route() {
    const [tab, ...rest] = location.hash.slice(1).split("/");
    return { tab: TABS[tab] ? tab : "sammlung", arg: decodeURIComponent(rest.join("/")) };
  }

  function render() {
    const r = route();
    const main = $("#view");
    main.textContent = "";
    state.meta.clear();
    state.summary = null;
    ({ sammlung: viewCollection, listen: viewLists, liste: viewList, suche: viewSearch, set: viewSet, mehr: viewMore })[r.tab](main, r.arg);
    for (const a of document.querySelectorAll(".tabs a")) {
      if (a.dataset.tab === TABS[r.tab]) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    refresh();
  }

  function setTitle(text) {
    $("#title").textContent = text;
    document.title = text === "Sammlung" ? "Pokémon-Sammlung" : `${text} · Pokémon-Sammlung`;
  }

  // Kacheln & Zahlen aktualisieren, ohne die Ansicht neu aufzubauen
  function refresh() {
    for (const el of document.querySelectorAll("#view .tile[data-card]")) {
      const id = el.dataset.card;
      const q = qtyOf(id);
      const v = value(id);
      el.classList.toggle("is-owned", q > 0);
      const btn = el.querySelector(".tile-check");
      if (btn) {
        btn.setAttribute("aria-pressed", String(q > 0));
        btn.setAttribute("aria-label", `${state.meta.get(id)?.name || "Karte"}: ${q > 0 ? "in der Sammlung, antippen zum Entfernen" : "fehlt, antippen zum Hinzufügen"}`);
      }
      el.querySelector(".tile-value").textContent = (q > 1 ? `${q}× ` : "") + (v != null ? fmtEur(v) : "");
    }
    if (state.summary) state.summary();
    if (state.sheet && $("#sheet").open) state.sheet.prices();
  }

  function tile(meta, { check = true } = {}) {
    state.meta.set(meta.id, meta);
    return h("article", { class: "tile", "data-card": meta.id }, [
      h("button", { type: "button", class: meta.img ? "tile-art" : "tile-art no-img", "data-open": "", "aria-label": `${meta.name} ${numText(meta)} anzeigen` }, [
        meta.img ? h("img", { src: `${meta.img}/low.webp`, alt: "", loading: "lazy", decoding: "async", crossorigin: "anonymous" }) : null,
        h("span", { class: "tile-ph", "aria-hidden": "true" }, [meta.name, h("br"), numText(meta)]),
      ]),
      check ? h("button", { type: "button", class: "tile-check", "data-toggle": "", html: ICON_CHECK }) : null,
      h("div", { class: "tile-info" }, [h("b", {}, meta.name), h("span", {}, `${numText(meta)} · ${meta.setName}`), h("span", { class: "tile-value" })]),
    ]);
  }

  const grid = () => h("div", { class: "grid" });
  const emptyBox = (title, text) => h("div", { class: "empty" }, [h("b", {}, title), text ? h("p", {}, text) : null]);
  const stat = (label, val, hint) => h("div", { class: "stat" }, [h("span", {}, label), h("b", {}, val), hint ? h("small", {}, hint) : null]);

  const SORTS = {
    newest: ["Neueste zuerst", (a, b) => b.added - a.added],
    order: ["Reihenfolge", (a, b) => a.added - b.added],
    value: ["Höchster Wert", (a, b) => (value(b.card.id) ?? -1) - (value(a.card.id) ?? -1)],
    name: ["Name", (a, b) => a.card.name.localeCompare(b.card.name, "de") || bySet(a, b)],
    set: ["Set & Nummer", (a, b) => bySet(a, b)],
  };
  function bySet(a, b) {
    return setOrder(b.card.set) - setOrder(a.card.set) || a.card.set.localeCompare(b.card.set) || numCmp(a.card.num, b.card.num);
  }

  function sortSelect(keys, uiKey) {
    const sel = h(
      "select",
      { class: "field", "aria-label": "Sortieren" },
      keys.map((k) => h("option", { value: k, selected: state.ui[uiKey] === k }, SORTS[k][0]))
    );
    sel.addEventListener("change", () => {
      state.ui[uiKey] = sel.value;
      store.set(KEYS.ui, state.ui);
      render();
    });
    return sel;
  }

  // ----- Sammlung -----
  function viewCollection(main) {
    setTitle("Sammlung");
    const items = collection().sort(SORTS[state.ui.collSort]?.[1] || SORTS.newest[1]);
    const summary = h("div", { class: "stats" });
    main.append(summary);
    state.summary = () => {
      let count = 0;
      let worth = 0;
      let unknown = 0;
      let paid = 0;
      let diff = 0;
      let diffN = 0;
      for (const e of items) {
        const v = value(e.card.id);
        count += e.qty;
        if (v == null) unknown++;
        else worth += v * e.qty;
        if (num(e.paid) != null) {
          paid += e.paid * e.qty;
          if (v != null) {
            diff += (v - e.paid) * e.qty;
            diffN++;
          }
        }
      }
      summary.replaceChildren(
        stat("Karten", String(count), `${items.length} verschiedene`),
        stat("Marktwert", fmtEur(worth), unknown ? `${unknown} ohne Preis` : "Cardmarket-Trend"),
        stat("Bezahlt", paid ? fmtEur(paid) : "–", "deine Kaufpreise"),
        stat("Gewinn/Verlust", diffN ? `${diff >= 0 ? "+" : "−"}${fmtEur(Math.abs(diff))}` : "–", diffN ? `bei ${plural(diffN, "Karte", "Karten")} mit Kaufpreis` : "Kaufpreise eintragen")
      );
    };
    if (!items.length) {
      main.append(emptyBox("Noch keine Karten in der Sammlung.", "Über „Suche“ findest du alle deutschen Karten. Karte antippen und die Anzahl erhöhen."));
      return;
    }
    const filter = h("input", { type: "search", class: "field", placeholder: "In der Sammlung suchen …", "aria-label": "In der Sammlung suchen", autocomplete: "off", enterkeyhint: "search", value: state.collFilter });
    const g = grid();
    for (const e of items) g.append(tile(e.card, { check: false }));
    main.append(h("div", { class: "toolbar" }, [filter, sortSelect(["newest", "value", "name", "set"], "collSort")]), g);
    const apply = () => {
      state.collFilter = filter.value;
      const q = norm(filter.value).split(/\s+/).filter(Boolean);
      for (const el of g.children) {
        const m = state.meta.get(el.dataset.card);
        const hay = norm(`${m.name} ${m.num} ${m.setName}`);
        el.hidden = !q.every((t) => hay.includes(t));
      }
    };
    filter.addEventListener("input", apply);
    apply();
    wantPrices(items.map((e) => e.card.id));
  }

  // ----- Listen -----
  function viewLists(main) {
    setTitle("Listen");
    const rows = h("div", { class: "rows" });
    const all = lists();
    state.summary = () => {
      rows.replaceChildren(
        ...all.map((l) => {
          const ms = members(l.id);
          const have = ms.filter((m) => owned(m.card.id)).length;
          const missing = ms.filter((m) => !owned(m.card.id)).map((m) => value(m.card.id));
          const known = missing.filter((v) => v != null);
          const cost = known.reduce((s, v) => s + v, 0);
          return h("a", { class: "row", href: `#liste/${encodeURIComponent(l.id)}` }, [
            h("div", { class: "row-head" }, [h("b", {}, l.name), h("span", { class: "count" }, `${have}/${ms.length}`)]),
            h("div", { class: "progress", "aria-hidden": "true" }, [h("i", { style: `width:${ms.length ? (have / ms.length) * 100 : 0}%` })]),
            h("small", {}, !ms.length ? "leer" : have === ms.length ? "komplett ✓" : known.length ? `fehlt noch ca. ${fmtEur(cost)}${known.length < missing.length ? " + ?" : ""}` : `${missing.length} fehlen`),
          ]);
        })
      );
    };
    const name = h("input", { type: "text", class: "field", placeholder: "Name der neuen Liste", "aria-label": "Name der neuen Liste", maxlength: 80, enterkeyhint: "done" });
    const form = h("form", { class: "toolbar" }, [name, h("button", { type: "submit", class: "btn" }, "Anlegen")]);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = createList(name.value);
      if (id) location.hash = `#liste/${id}`;
    });
    main.append(form, all.length ? rows : emptyBox("Noch keine Listen.", "Lege eine Liste an, z. B. „Wunschliste“ oder „151 komplett“. Karten fügst du über die Kartenansicht hinzu."));
    wantPrices(docsOf("member").map((d) => d.data.card?.id).filter(Boolean));
  }

  function createList(name) {
    const n = name.trim().slice(0, 80);
    if (!n) return null;
    const id = crypto.randomUUID();
    put(`l:${id}`, "list", { name: n, created: Date.now() });
    commit();
    return id;
  }

  function viewList(main, id) {
    const list = live(`l:${id}`);
    if (!list) {
      setTitle("Liste");
      main.append(emptyBox("Diese Liste gibt es nicht mehr."), h("a", { class: "btn", href: "#listen" }, "Zu den Listen"));
      return;
    }
    setTitle(list.name);
    const f = state.ui.listFilter;
    const ms = members(id).sort(SORTS[state.ui.listSort]?.[1] || SORTS.order[1]);
    const head = h("div", { class: "list-head" }, [
      h("a", { class: "back", href: "#listen" }, "‹ Listen"),
      h("div", { class: "actions" }, [
        h("button", {
          type: "button",
          class: "btn btn-ghost",
          onclick: () => {
            const n = prompt("Neuer Name der Liste:", list.name);
            if (n && n.trim()) {
              put(`l:${id}`, "list", { ...list, name: n.trim().slice(0, 80) });
              commit();
              render();
            }
          },
        }, "Umbenennen"),
        h("button", {
          type: "button",
          class: "btn btn-ghost danger",
          onclick: () => {
            if (!confirm(`Liste „${list.name}“ löschen? Die Karten bleiben in deiner Sammlung.`)) return;
            put(`l:${id}`, "list", null);
            for (const m of ms) put(`m:${id}:${m.card.id}`, "member", null);
            commit();
            location.hash = "#listen";
          },
        }, "Löschen"),
      ]),
    ]);
    const summary = h("div", { class: "stats" });
    state.summary = () => {
      const have = ms.filter((m) => owned(m.card.id));
      const missing = ms.filter((m) => !owned(m.card.id)).map((m) => value(m.card.id));
      const known = missing.filter((v) => v != null);
      summary.replaceChildren(
        stat("Fortschritt", `${have.length}/${ms.length}`, ms.length ? `${Math.round((have.length / ms.length) * 100)} %` : "leer"),
        stat("Fehlt noch ca.", known.length ? fmtEur(known.reduce((s, v) => s + v, 0)) : "–", missing.length ? `${plural(missing.length, "Karte", "Karten")}${known.length < missing.length ? `, ${missing.length - known.length} ohne Preis` : ""}` : "komplett ✓")
      );
    };
    const seg = h(
      "div",
      { class: "segmented", role: "radiogroup", "aria-label": "Karten anzeigen" },
      [["all", "Alle"], ["missing", "Fehlend"], ["owned", "Vorhanden"]].map(([k, label]) =>
        h("button", {
          type: "button",
          role: "radio",
          "aria-checked": String(f === k),
          onclick: () => {
            state.ui.listFilter = k;
            store.set(KEYS.ui, state.ui);
            render();
          },
        }, label)
      )
    );
    const g = grid();
    const shown = ms.filter((m) => f === "all" || (f === "owned") === owned(m.card.id));
    for (const m of shown) g.append(tile(m.card));
    main.append(head, summary, h("div", { class: "toolbar" }, [seg, sortSelect(["order", "set", "name", "value"], "listSort")]), g);
    if (!ms.length) main.append(emptyBox("Noch keine Karten in dieser Liste.", "Über „Suche“ eine Karte antippen und unten bei „Listen“ diese Liste anhaken."));
    else if (!shown.length) main.append(emptyBox(f === "missing" ? "Alles gesammelt! 🎉" : "Noch keine Karte aus dieser Liste in der Sammlung."));
    wantPrices(ms.map((m) => m.card.id));
  }

  // ----- Suche & Sets -----
  function viewSearch(main) {
    setTitle("Suche");
    const input = h("input", {
      type: "search",
      class: "field",
      placeholder: "Name oder Nummer, z. B. Glurak 199",
      "aria-label": "Alle deutschen Karten durchsuchen",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      enterkeyhint: "search",
      value: state.query,
    });
    const box = h("div");
    input.addEventListener("input", () => {
      state.query = input.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(box), 350);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur(); // Handy-Tastatur zuklappen
    });
    main.append(h("div", { class: "toolbar" }, [input]), box);
    if (state.results && state.results.q === state.query.trim()) showResults(box);
    else runSearch(box);
  }

  async function runSearch(box) {
    const q = state.query.trim();
    const seq = ++searchSeq;
    if (!q) {
      state.results = null;
      return showResults(box);
    }
    box.replaceChildren(h("p", { class: "muted pad" }, "Suche läuft …"));
    try {
      await setsReady;
      const cards = await searchCards(q);
      if (seq === searchSeq) state.results = { q, cards };
    } catch {
      if (seq === searchSeq) state.results = { q, error: navigator.onLine ? "Die Kartensuche ist gerade nicht erreichbar." : "Offline: Die Suche braucht Internet." };
    }
    if (seq === searchSeq && box.isConnected) showResults(box);
  }

  // „glurak“, „199“, „199/165“, „#199“ oder „glurak 199“
  async function searchCards(q) {
    const tokens = q.split(/\s+/);
    const numTok = tokens.find((t) => /^#?\d+(\/\d+)?$/.test(t));
    const words = tokens.filter((t) => t !== numTok).join(" ");
    const [n, total] = numTok ? numTok.replace("#", "").split("/").map(Number) : [];
    const list = await fetchJson(`${TCG}/de/cards?${words ? `name=${encodeURIComponent(words)}` : `localId=${n}`}`, 15000);
    return list
      .filter((c) => c && c.id && c.localId != null && !state.sets?.pocket.has(setIdOf(c)))
      .filter((c) => n == null || parseInt(c.localId, 10) === n)
      .filter((c) => !total || setInfo(setIdOf(c))?.official === total)
      .map(metaOf)
      .sort((a, b) => setOrder(b.set) - setOrder(a.set) || numCmp(a.num, b.num));
  }

  async function showResults(box) {
    const r = state.results;
    if (!r) {
      box.replaceChildren(h("p", { class: "muted pad" }, "Sets werden geladen …"));
      await setsReady;
      if (!box.isConnected || state.results) return;
      if (!state.sets) return box.replaceChildren(emptyBox("Sets brauchen beim ersten Mal Internet."));
      const sets = [...state.sets.list].reverse();
      box.replaceChildren(
        h("h2", { class: "section-title" }, "Sets durchstöbern"),
        h(
          "div",
          { class: "rows sets" },
          sets.map((s) =>
            h("a", { class: "row set-row", href: `#set/${encodeURIComponent(s.id)}` }, [
              h("b", {}, s.name),
              h("small", {}, s.total ? `${s.total} Karten` : ""),
            ])
          )
        )
      );
      return;
    }
    if (r.error) return box.replaceChildren(emptyBox(r.error));
    if (!r.cards.length) return box.replaceChildren(emptyBox(`Keine Karte gefunden für „${r.q}“.`, "Tipp: deutschen Namen verwenden, z. B. „Glurak“ statt „Charizard“."));
    const g = grid();
    for (const m of r.cards.slice(0, SEARCH_LIMIT)) g.append(tile(m));
    box.replaceChildren(
      h("p", { class: "muted pad" }, r.cards.length > SEARCH_LIMIT ? `${r.cards.length} Treffer, die ersten ${SEARCH_LIMIT} werden angezeigt. Genauer suchen, z. B. mit Nummer.` : `${r.cards.length} Treffer`),
      g
    );
    refresh();
  }

  async function viewSet(main, setId) {
    const s = setInfo(setId);
    setTitle(s?.name || "Set");
    const box = h("div", {}, h("p", { class: "muted pad" }, "Karten werden geladen …"));
    main.append(h("div", { class: "list-head" }, [h("a", { class: "back", href: "#suche" }, "‹ Suche")]), box);
    let data;
    try {
      data = await fetchJson(`${TCG}/de/sets/${encodeURIComponent(setId)}`, 15000);
    } catch {
      box.replaceChildren(emptyBox(navigator.onLine ? "Das Set konnte nicht geladen werden." : "Offline: Sets brauchen Internet."));
      return;
    }
    if (route().arg !== setId || !box.isConnected) return;
    setTitle(data.name);
    const set = { id: setId, name: data.name, cardCount: data.cardCount };
    const metas = (data.cards || []).map((c) => metaOf({ ...c, set })).sort((a, b) => numCmp(a.num, b.num));
    const info = h("p", { class: "muted pad" });
    const g = grid();
    for (const m of metas) g.append(tile(m));
    box.replaceChildren(info, g);
    state.summary = () => {
      info.textContent = `${metas.filter((m) => owned(m.id)).length} von ${metas.length} Karten in deiner Sammlung`;
    };
    refresh();
  }

  // ----- Mehr: Sync, Sicherung, alte Checkliste -----
  function viewMore(main) {
    setTitle("Mehr");
    const url = h("input", { type: "url", class: "field", value: state.sync.url, placeholder: "https://pokemon-sammlung.….workers.dev", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    const key = h("input", { type: "password", class: "field", value: state.sync.key, placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
    const toggleKey = h("button", { type: "button", class: "btn btn-ghost", onclick: () => (key.type = key.type === "password" ? "text" : "password") }, "Anzeigen");
    const gen = h("button", {
      type: "button",
      class: "btn btn-ghost",
      onclick: () => {
        if (key.value && !confirm("Den bisherigen Schlüssel ersetzen? Er muss dann auch im Backend und auf allen Geräten geändert werden.")) return;
        key.value = newKey();
        key.type = "text";
      },
    }, "Neuen Schlüssel erzeugen");
    const save = h("button", {
      type: "button",
      class: "btn",
      onclick: () => {
        state.sync.url = url.value.trim();
        state.sync.key = cleanKey(key.value);
        key.value = state.sync.key;
        state.sync.error = "";
        store.set(KEYS.sync, state.sync);
        updateSyncDot();
        sync();
      },
    }, "Speichern & synchronisieren");

    const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    file.addEventListener("change", () => {
      if (file.files && file.files[0]) importFile(file.files[0]);
      file.value = "";
    });
    // Gleiche Domain wie die alte Checkliste → im selben Browser direkt lesbar
    const oldOwned = store.get("pkc.owned.v1", null);

    main.append(
      panel("Sync zwischen Geräten", [
        h("p", {}, "Mit Backend-Adresse und deinem persönlichen Schlüssel sind Sammlung und Listen auf allen Geräten gleich. Den Schlüssel auf jedem Gerät einmal eintragen."),
        h("label", { class: "label" }, ["Backend-Adresse", url]),
        h("label", { class: "label" }, ["Sync-Schlüssel", h("div", { class: "toolbar tight" }, [key, toggleKey])]),
        h("div", { class: "buttons" }, [save, gen]),
        h("p", { class: "muted", id: "syncStatus" }, syncText()),
      ]),
      panel("Sicherung", [
        h("p", {}, "Alle Daten als Datei sichern oder eine Sicherung zurückholen. Import nimmt auch die Export-Datei der alten Checkliste."),
        h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn", onclick: exportData }, "Export (JSON)"), h("label", { class: "btn btn-ghost" }, ["Import (JSON)", file])]),
      ]),
      panel("Alte Checkliste übernehmen", [
        h("p", {}, "Legt für jede Gruppe der alten Checkliste eine Liste an und übernimmt abgehakte Karten samt „Mein Preis“ als Kaufpreis in die Sammlung. Mehrfach ausführen ist ok, es entsteht nichts doppelt."),
        Array.isArray(oldOwned)
          ? h("button", { type: "button", class: "btn", onclick: () => importOld({ owned: oldOwned, ownPrices: store.get("pkc.ownPrices.v1", {}) }) }, `Aus diesem Browser übernehmen (${oldOwned.length} abgehakt)`)
          : h("p", { class: "muted" }, "In diesem Browser ist keine alte Checkliste gespeichert. Exportiere sie dort und wähle die Datei oben bei „Import“."),
      ]),
      panel("Zu den Preisen", [
        h("p", {}, "Der Marktwert ist der Cardmarket-Trend aus der TCGdex-API. Er mischt alle Sprachen und Zustände. Echte Preise für deutsche Karten ab Excellent zeigt der Cardmarket-Link in der Kartenansicht."),
        h("p", { class: "muted small" }, ["Kartenbilder & Daten: ", h("a", { href: "https://tcgdex.dev", target: "_blank", rel: "noopener" }, "TCGdex"), ". Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket."]),
      ])
    );
  }

  const panel = (title, children) => h("section", { class: "panel" }, [h("h2", {}, title), ...children]);

  // ---------- Kartenansicht ----------
  function openSheet(meta) {
    const body = $("#sheetBody");
    const dlg = $("#sheet");
    body.textContent = "";
    const e = entry(meta.id);
    const prices = h("div", { class: "prices" });
    const rarity = h("p", { class: "muted" });

    const qtyOut = h("output", {}, String(e?.qty || 0));
    const cond = h("select", { class: "field" }, CONDITIONS.map((c) => h("option", { selected: (e?.cond || "Near Mint") === c }, c)));
    const lang = h("select", { class: "field" }, LANGUAGES.map((l) => h("option", { selected: (e?.lang || "Deutsch") === l }, l)));
    const paid = h("input", { type: "text", class: "field", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done", placeholder: "z. B. 12,50 €", value: num(e?.paid) != null ? e.paid.toFixed(2).replace(".", ",") : "" });
    const fields = [cond, lang, paid];
    const setFields = () => {
      const q = qtyOf(meta.id);
      qtyOut.textContent = String(q);
      for (const f of fields) f.disabled = q === 0;
    };
    const step = (d) => {
      if (qtyOf(meta.id) + d < 0) return;
      setQty(meta, qtyOf(meta.id) + d);
      commit();
      setFields();
      refresh();
      afterChange(false);
    };
    cond.addEventListener("change", () => (patchEntry(meta.id, { cond: cond.value }), commit()));
    lang.addEventListener("change", () => (patchEntry(meta.id, { lang: lang.value }), commit()));
    paid.addEventListener("input", () => {
      const n = parseEuro(paid.value);
      if (Number.isNaN(n)) return; // Tippfehler ignorieren
      patchEntry(meta.id, { paid: n || null });
      commit();
      refresh();
    });
    paid.addEventListener("blur", () => {
      const n = num(entry(meta.id)?.paid);
      paid.value = n == null ? "" : n.toFixed(2).replace(".", ",");
    });
    paid.addEventListener("keydown", (ev) => ev.key === "Enter" && paid.blur());

    const listBox = h("div", { class: "checks" });
    const drawLists = () => {
      const newName = h("input", { type: "text", class: "field", placeholder: "Neue Liste …", "aria-label": "Neue Liste anlegen", maxlength: 80, enterkeyhint: "done" });
      const form = h("form", { class: "toolbar tight" }, [newName, h("button", { type: "submit", class: "btn btn-ghost" }, "Anlegen")]);
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const id = createList(newName.value);
        if (!id) return;
        put(`m:${id}:${meta.id}`, "member", { list: id, card: meta, added: Date.now() });
        commit();
        drawLists();
        afterChange(true);
      });
      listBox.replaceChildren(
        ...lists().map((l) => {
          const cb = h("input", { type: "checkbox", checked: inList(l.id, meta.id) });
          cb.addEventListener("change", () => {
            put(`m:${l.id}:${meta.id}`, "member", cb.checked ? { list: l.id, card: meta, added: Date.now() } : null);
            commit();
            afterChange(true);
          });
          return h("label", { class: "check-row" }, [cb, h("span", {}, l.name)]);
        }),
        form
      );
    };
    drawLists();

    const drawPrices = () => {
      const p = state.prices[meta.id];
      rarity.textContent = p?.rarity || "";
      const row = (label, v) => h("div", {}, [h("span", {}, label), h("b", {}, fmtEur(v))]);
      prices.replaceChildren(
        p && (p.trend || p.low || p.avg30)
          ? h("div", { class: "price-grid" }, [row("Marktwert (Trend)", p.trend), row("ab", p.low), row("Ø 30 Tage", p.avg30)])
          : h("p", { class: "muted" }, p ? "Kein Cardmarket-Richtwert verfügbar." : navigator.onLine ? "Preis wird geladen …" : "Offline: noch kein Preis gespeichert."),
        h("p", { class: "muted small" }, "Richtwert über alle Sprachen & Zustände" + (p?.updated ? ` · Stand ${new Date(p.updated).toLocaleDateString("de-DE")}` : "")),
        h("a", { class: "btn cm", href: cardmarketUrl(meta), target: "_blank", rel: "noopener" }, "Auf Cardmarket ansehen (Deutsch, ab Excellent)")
      );
    };
    drawPrices();
    state.sheet = { id: meta.id, prices: drawPrices };

    body.append(
      h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: () => dlg.close(), html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>' }),
      h("div", { class: meta.img ? "sheet-art" : "sheet-art no-img" }, [
        meta.img ? h("img", { src: `${meta.img}/high.webp`, alt: `${meta.name} ${numText(meta)}`, crossorigin: "anonymous" }) : null,
        h("span", { class: "tile-ph" }, [meta.name, h("br"), numText(meta)]),
      ]),
      h("h2", {}, meta.name),
      h("p", { class: "muted" }, `${numText(meta)} · ${meta.setName}`),
      rarity,
      prices,
      h("section", { class: "sheet-part" }, [
        h("h3", {}, "In meiner Sammlung"),
        h("div", { class: "stepper" }, [
          h("button", { type: "button", class: "btn btn-ghost", "aria-label": "Eine weniger", onclick: () => step(-1) }, "−"),
          qtyOut,
          h("button", { type: "button", class: "btn", "aria-label": "Eine mehr", onclick: () => step(1) }, "+"),
        ]),
        h("label", { class: "label" }, ["Zustand", cond]),
        h("label", { class: "label" }, ["Sprache", lang]),
        h("label", { class: "label" }, ["Kaufpreis pro Stück", paid]),
      ]),
      h("section", { class: "sheet-part" }, [h("h3", {}, "Listen"), listBox])
    );
    setFields();
    if (!dlg.open) dlg.showModal();
    body.scrollTop = 0;
    wantPrices([meta.id]);
  }

  // Ansicht neu aufbauen, wenn dadurch Karten dazukommen oder wegfallen – kurz warten, damit man den Haken noch sieht.
  // structural = Listen-Mitgliedschaft geändert
  function afterChange(structural) {
    clearTimeout(filterTimer);
    const t = route().tab;
    const filtered = t === "sammlung" || (t === "liste" && state.ui.listFilter !== "all");
    if (filtered || (structural && (t === "liste" || t === "listen"))) filterTimer = setTimeout(render, 700);
  }

  // ---------- Sicherung & Import ----------
  async function exportData() {
    const payload = { app: "pokemon-sammlung", version: 1, exportedAt: new Date().toISOString(), docs: [...state.docs.values()] };
    const file = new File([JSON.stringify(payload)], `pokemon-sammlung-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
    // iPhone-App vom Home-Bildschirm: Downloads sind dort unzuverlässig → Teilen-Menü
    if (navigator.standalone && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        /* abgebrochen */
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = h("a", { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function importFile(file) {
    let p;
    try {
      p = JSON.parse(await file.text());
    } catch {
      alert("Die Datei ist kein gültiges JSON.");
      return;
    }
    if (isObj(p) && Array.isArray(p.owned)) return importOld(p); // Export der alten Checkliste
    if (!isObj(p) || !Array.isArray(p.docs)) {
      alert("Die Datei sieht nicht nach einer Sicherung dieser App aus.");
      return;
    }
    let n = 0;
    for (const d of p.docs) {
      if (!isObj(d) || typeof d.id !== "string" || !KINDS.includes(d.kind) || !Number.isSafeInteger(d.updated)) continue;
      const local = state.docs.get(d.id);
      if (local && local.updated >= d.updated) continue;
      state.docs.set(d.id, { id: d.id, kind: d.kind, data: d.deleted ? null : d.data ?? null, updated: d.updated, deleted: d.deleted ? 1 : 0 });
      state.dirty.add(d.id);
      n++;
    }
    commit();
    render();
    alert(n ? `${n} Einträge übernommen.` : "Nichts Neues in der Datei, dein Stand ist aktueller.");
  }

  async function importOld(p) {
    let old;
    try {
      old = await fetchJson(`${OLD_APP}cards.json`, 15000, { cache: "no-cache" });
    } catch {
      alert("Die alte Checkliste ist gerade nicht erreichbar. Bitte mit Internet nochmal versuchen.");
      return;
    }
    const ownedOld = new Set(p.owned);
    const ownPrices = objOr(p.ownPrices);
    const groups = (old.groups || []).map((g) => g.id);
    const groupName = new Map((old.groups || []).map((g) => [g.id, g.name]));
    const now = Date.now();
    const newLists = new Set();
    let i = 0;
    let cards = 0;
    for (const line of old.lines || []) {
      const gid = line.group || line.id;
      const lid = `alt-${gid}`;
      if (!live(`l:${lid}`)) {
        // Reihenfolge wie in der alten Checkliste
        put(`l:${lid}`, "list", { name: groupName.get(gid) || line.name || gid, created: now + (groups.includes(gid) ? groups.indexOf(gid) : groups.length + i) });
        newLists.add(lid);
      }
      for (const slot of line.slots || []) {
        for (const c of slot.options || []) {
          i++;
          const s = old.sets?.[c.set] || {};
          const meta = { id: c.id, name: c.name, num: c.number, set: s.id || c.id.split("-")[0], setName: s.name || c.set, total: s.official || null, img: c.image || null };
          if (!inList(lid, c.id)) put(`m:${lid}:${c.id}`, "member", { list: lid, card: meta, added: now + i });
          if (ownedOld.has(c.id) && !owned(c.id)) {
            setQty(meta, 1);
            const paid = num(ownPrices[c.id]);
            if (paid != null) patchEntry(c.id, { paid });
            cards++;
          }
        }
      }
    }
    commit();
    render();
    alert(`Übernommen: ${plural(cards, "Karte", "Karten")} in die Sammlung, ${plural(newLists.size, "neue Liste", "neue Listen")}.`);
  }

  // ---------- Start ----------
  function bindUi() {
    window.addEventListener("hashchange", () => {
      render();
      window.scrollTo(0, 0);
    });
    $("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-open], [data-toggle]");
      const meta = btn && state.meta.get(btn.closest("[data-card]")?.dataset.card);
      if (!meta) return;
      if (btn.hasAttribute("data-open")) return openSheet(meta);
      setQty(meta, owned(meta.id) ? 0 : 1);
      commit();
      refresh();
      if (navigator.vibrate) navigator.vibrate(12);
      afterChange(false);
    });
    // Bild fehlt auf Deutsch → englisches, sonst Platzhalter
    document.addEventListener(
      "error",
      (e) => {
        const img = e.target;
        const box = img instanceof HTMLImageElement && img.closest(".tile-art, .sheet-art");
        if (!box) return;
        if (img.src.includes("/de/")) img.src = img.src.replace("/de/", "/en/");
        else box.classList.add("no-img");
      },
      true
    );
    const dlg = $("#sheet");
    dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
    dlg.addEventListener("close", () => {
      state.sheet = null;
      refresh();
    });
    // iPhone-App hat keinen Neu-laden-Knopf → nach 1 h im Hintergrund neu laden (holt Updates), sonst nur Sync
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60 * 60 * 1000) location.reload();
      else sync();
    });
    window.addEventListener("online", () => {
      sync();
      runPrices();
    });
  }

  function init() {
    bindUi();
    setsReady = loadSets();
    updateSyncDot();
    render();
    sync();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  init();
})();
