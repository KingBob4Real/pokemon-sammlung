import { $ } from "../core/dom.js";
import { renderCardSheet } from "./components/cardSheet.js";
import { tileCard, updateTile } from "./components/cardTile.js";
import { isDragging } from "./components/reorder.js";
import { currentRoute } from "./router.js";
import * as addView from "./views/addView.js";
import * as collectionView from "./views/collectionView.js";
import * as listView from "./views/listView.js";
import * as listsView from "./views/listsView.js";
import * as moreView from "./views/moreView.js";
import * as searchView from "./views/searchView.js";
import * as setView from "./views/setView.js";

// Jede Ansicht: render(main, ctx, arg) → { refresh?, onPick?, dispose? }. Neue Ansicht = hier eintragen.
const VIEWS = { sammlung: collectionView, listen: listsView, liste: listView, hinzufuegen: addView, suche: searchView, set: setView, mehr: moreView };
const SYNC_LABELS = { off: "Sync aus", busy: "Sync …", error: "Sync-Fehler", pending: "Nicht synchron", ok: "Synchron" };
const RERENDER_DELAY_MS = 700; // kurz warten, damit man den Haken noch sieht
const SHEET_CLOSE_MS = 180; // so lange fährt die Kartenansicht hinaus
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// CSS-Animation neu starten (Klasse kurz entfernen und wieder setzen)
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/**
 * App-Hülle: Ansicht passend zur Adresse zeigen, Kacheln aktuell halten, Kartenansicht öffnen.
 * Kennt die Services nur über das ctx-Objekt, das main.js zusammenstellt.
 */
export class App {
  #viewRefresh = null;
  #viewPick = null; // Ansichten mit Auswahl-Kacheln bekommen das Antippen hierüber
  #viewDispose = null; // räumt beim Ansichtswechsel auf (z. B. Drag & Drop)
  #sheetRefresh = null;
  #rerenderTimer = null;

  constructor(services, prefs) {
    this.services = services;
    this.main = $("#view");
    this.dialog = $("#sheet");
    this.ctx = {
      ...services,
      prefs,
      // bleibt beim Wechseln der Ansicht erhalten
      session: {
        search: { query: "", results: null },
        add: { query: "", results: null },
        collectionFilter: "",
        selection: { listId: null, ids: new Set() },
      },
      setTitle: (text) => this.setTitle(text),
      render: () => this.render(),
      bounce: (el) => replay(el, "just-changed"),
      refresh: () => this.refresh(),
      openCard: (card) => this.openCard(card),
      afterChange: (structural) => this.afterChange(structural),
    };
  }

  start() {
    const { store, prices, sync } = this.services;
    window.addEventListener("hashchange", () => {
      this.render();
      window.scrollTo(0, 0);
      replay(this.main, "view-enter"); // neue Ansicht blendet sanft ein
    });
    this.main.addEventListener("click", (e) => this.#onTileClick(e));
    document.addEventListener("error", (e) => this.#onImageError(e), true);
    // Kartenbilder weich einblenden, sobald sie da sind
    document.addEventListener("load", (e) => e.target instanceof HTMLImageElement && e.target.closest(".tile-art, .sheet-art") && e.target.classList.add("loaded"), true);
    this.dialog.addEventListener("click", (e) => e.target === this.dialog && this.closeSheet());
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault(); // Escape: auch mit Animation schließen
      this.closeSheet();
    });
    this.dialog.addEventListener("close", () => {
      this.#sheetRefresh = null;
      this.refresh();
    });
    store.addEventListener("change", () => sync.schedule());
    store.addEventListener("remote", () => this.#onRemoteChange());
    prices.addEventListener("update", () => this.refresh());
    sync.addEventListener("status", () => this.#showSyncState());
    this.#showSyncState();
    this.render();
  }

  render() {
    clearTimeout(this.#rerenderTimer);
    // nicht mitten im Ziehen neu aufbauen – kurz danach nachholen
    if (isDragging()) {
      this.#rerenderTimer = setTimeout(() => this.render(), 400);
      return;
    }
    const route = currentRoute();
    this.#viewDispose?.();
    this.main.textContent = "";
    this.main.classList.remove("has-action-bar");
    const view = VIEWS[route.view].render(this.main, this.ctx, route.arg) || {};
    this.#viewRefresh = view.refresh || null;
    this.#viewPick = view.onPick || null;
    this.#viewDispose = view.dispose || null;
    for (const a of document.querySelectorAll(".tabs a")) {
      if (a.dataset.tab === route.tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    this.refresh();
  }

  // Zahlen und Kacheln aktualisieren, ohne die Ansicht neu aufzubauen
  refresh() {
    const { collection, prices } = this.services;
    for (const el of this.main.querySelectorAll(".tile")) {
      const card = tileCard(el);
      if (card) updateTile(el, { qty: collection.quantity(card.id), value: prices.value(card.id) });
    }
    this.#viewRefresh?.();
    this.#sheetRefresh?.();
  }

  openCard(card) {
    const body = $("#sheetBody");
    this.#sheetRefresh = renderCardSheet(body, card, { ...this.ctx, close: () => this.closeSheet() });
    this.dialog.classList.remove("closing");
    if (!this.dialog.open) this.dialog.showModal();
    body.scrollTop = 0;
  }

  // Kartenansicht mit kurzer Animation schließen
  closeSheet() {
    if (!this.dialog.open || this.dialog.classList.contains("closing")) return;
    if (reducedMotion()) return this.dialog.close();
    this.dialog.classList.add("closing");
    setTimeout(() => {
      this.dialog.classList.remove("closing");
      this.dialog.close();
    }, SHEET_CLOSE_MS);
  }

  // Nach einer Änderung: Ansicht neu aufbauen, wenn dadurch Karten dazukommen oder wegfallen.
  // structural = Listenzugehörigkeit hat sich geändert
  afterChange(structural) {
    this.refresh();
    const { view } = currentRoute();
    const filtered = view === "sammlung" || (view === "liste" && this.ctx.prefs.get("listFilter") !== "all");
    if (filtered || (structural && (view === "liste" || view === "listen"))) {
      clearTimeout(this.#rerenderTimer);
      this.#rerenderTimer = setTimeout(() => this.render(), RERENDER_DELAY_MS);
    }
  }

  setTitle(text) {
    $("#title").textContent = text;
    document.title = text === "Sammlung" ? "Pokémon-Sammlung" : `${text} · Pokémon-Sammlung`;
  }

  #onTileClick(e) {
    const tile = e.target.closest(".tile");
    const card = tileCard(tile);
    if (!card) return;
    if (tile.hasAttribute("data-pick")) return this.#viewPick?.(card, tile);
    const button = e.target.closest("[data-open], [data-toggle]");
    if (!button) return;
    if (button.hasAttribute("data-open")) return this.openCard(card);
    // Mehrere Exemplare? Dann nicht per Haken auf 0 setzen, sondern die Anzahl in der Kartenansicht ändern
    if (this.services.collection.quantity(card.id) > 1) return this.openCard(card);
    this.services.collection.toggle(card);
    navigator.vibrate?.(12);
    replay(tile, "just-changed");
    this.afterChange(false);
  }

  // Bild fehlt auf Deutsch → englisches, sonst Platzhalter
  #onImageError(e) {
    const img = e.target;
    const box = img instanceof HTMLImageElement && img.closest(".tile-art, .sheet-art");
    if (!box) return;
    if (img.src.includes("/de/")) img.src = img.src.replace("/de/", "/en/");
    else box.classList.add("no-img");
  }

  // Sync hat Neues gebracht. Suche/Set/Mehr nicht neu aufbauen (Eingaben gingen verloren), nur aktualisieren.
  #onRemoteChange() {
    if (["suche", "set", "mehr", "hinzufuegen"].includes(currentRoute().view)) this.refresh();
    else this.render();
  }

  #showSyncState() {
    const state = this.services.sync.state;
    $("#syncDot").dataset.state = state;
    $("#syncLabel").textContent = SYNC_LABELS[state];
    this.#viewRefresh?.();
  }
}
