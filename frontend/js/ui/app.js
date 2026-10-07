import { $ } from "../core/dom.js";
import { renderCardSheet } from "./components/cardSheet.js";
import { tileCard, updateTile } from "./components/cardTile.js";
import { currentRoute } from "./router.js";
import * as collectionView from "./views/collectionView.js";
import * as listView from "./views/listView.js";
import * as listsView from "./views/listsView.js";
import * as moreView from "./views/moreView.js";
import * as searchView from "./views/searchView.js";
import * as setView from "./views/setView.js";

// Jede Ansicht: render(main, ctx, arg) → { refresh? }. Neue Ansicht = hier eintragen.
const VIEWS = { sammlung: collectionView, listen: listsView, liste: listView, suche: searchView, set: setView, mehr: moreView };
const SYNC_LABELS = { off: "Sync aus", busy: "Sync …", error: "Sync-Fehler", pending: "Nicht synchron", ok: "Synchron" };
const RERENDER_DELAY_MS = 700; // kurz warten, damit man den Haken noch sieht

/**
 * App-Hülle: Ansicht passend zur Adresse zeigen, Kacheln aktuell halten, Kartenansicht öffnen.
 * Kennt die Services nur über das ctx-Objekt, das main.js zusammenstellt.
 */
export class App {
  #viewRefresh = null;
  #sheetRefresh = null;
  #rerenderTimer = null;

  constructor(services, prefs) {
    this.services = services;
    this.main = $("#view");
    this.dialog = $("#sheet");
    this.ctx = {
      ...services,
      prefs,
      session: { query: "", results: null, collectionFilter: "" }, // bleibt beim Wechseln der Ansicht erhalten
      setTitle: (text) => this.setTitle(text),
      render: () => this.render(),
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
    });
    this.main.addEventListener("click", (e) => this.#onTileClick(e));
    document.addEventListener("error", (e) => this.#onImageError(e), true);
    this.dialog.addEventListener("click", (e) => e.target === this.dialog && this.dialog.close());
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
    const route = currentRoute();
    this.main.textContent = "";
    this.#viewRefresh = VIEWS[route.view].render(this.main, this.ctx, route.arg)?.refresh || null;
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
    this.#sheetRefresh = renderCardSheet(body, card, { ...this.ctx, close: () => this.dialog.close() });
    if (!this.dialog.open) this.dialog.showModal();
    body.scrollTop = 0;
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
    const button = e.target.closest("[data-open], [data-toggle]");
    const card = button && tileCard(button.closest(".tile"));
    if (!card) return;
    if (button.hasAttribute("data-open")) return this.openCard(card);
    this.services.collection.toggle(card);
    navigator.vibrate?.(12);
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
    if (["suche", "set", "mehr"].includes(currentRoute().view)) this.refresh();
    else this.render();
  }

  #showSyncState() {
    const state = this.services.sync.state;
    $("#syncDot").dataset.state = state;
    $("#syncLabel").textContent = SYNC_LABELS[state];
    this.#viewRefresh?.();
  }
}
