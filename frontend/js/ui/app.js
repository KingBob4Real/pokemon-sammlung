import { IMAGE_PROXY } from "../config.js";
import { $, h } from "../core/dom.js";
import { describeError } from "../core/errors.js";
import { deliverFile } from "../core/files.js";
import { cardNumber, nextImage } from "../domain/card.js";
import { renderCardSheet } from "./components/cardSheet.js";
import { avatarColor, chosenThisSession, initial, showProfiles } from "./components/profilePicker.js";
import { rememberImage, tileCard, updateTile } from "./components/cardTile.js";
import { isDragging } from "./components/reorder.js";
import { Toaster } from "./components/toast.js";
import { emptyState } from "./components/widgets.js";
import { currentRoute } from "./router.js";
import * as addView from "./views/addView.js";
import * as collectionView from "./views/collectionView.js";
import * as listView from "./views/listView.js";
import * as listsView from "./views/listsView.js";
import * as moreView from "./views/moreView.js";
import * as searchView from "./views/searchView.js";
import * as setView from "./views/setView.js";
import * as tradeView from "./views/tradeView.js";

// Jede Ansicht: render(main, ctx, arg) → { refresh?, onPick?, dispose? }. Neue Ansicht = hier eintragen.
const VIEWS = { sammlung: collectionView, ordner: collectionView, tauschen: tradeView, listen: listsView, liste: listView, hinzufuegen: addView, suche: searchView, set: setView, mehr: moreView };
const SYNC_LABELS = { off: "Sync aus", offline: "Offline", busy: "Sync …", error: "Sync-Problem", pending: "Nicht synchron", ok: "Synchron" };
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
  #sheetNav = null; // { prev, next } der offenen Kartenansicht
  #rerenderTimer = null;
  #shownOnce = new Set(); // Hinweise, die pro Sitzung nur einmal kommen sollen

  constructor(services, prefs) {
    this.services = services;
    this.main = $("#view");
    this.dialog = $("#sheet");
    this.toast = new Toaster();
    this.ctx = {
      ...services,
      prefs,
      // bleibt beim Wechseln der Ansicht erhalten
      session: {
        search: { query: "", results: null },
        add: { query: "", results: null },
        collectionFilter: "",
        collectionQuick: "all", // Schnellfilter der Sammlung (domain/sorting.js: QUICK_FILTERS)
        selection: { where: null, cards: new Map() }, // Mehrfach-Auswahl (components/selection.js)
      },
      setTitle: (text) => this.setTitle(text),
      render: () => this.render(),
      bounce: (el) => replay(el, "just-changed"),
      // Hinweis unten: notify("Text", { type: "error" | "success" | "info", action: { label, run } })
      notify: (message, options) => this.toast.show(message, options),
      // Fehler → verständlicher Hinweis, optional mit „Nochmal“
      notifyError: (error, { prefix = "", retry } = {}) =>
        this.toast.show(`${prefix}${describeError(error).message}`, { type: "error", action: retry ? { label: "Nochmal", run: retry } : null }),
      refresh: () => this.refresh(),
      openCard: (card) => this.openCard(card),
      // Eigenen Inhalt im Dialog zeigen: render(body, ctx mit close) → optional Funktion zum Neuzeichnen
      openSheet: (render) => this.openSheet(render),
      openProfiles: () => showProfiles(this.ctx),
      afterChange: (structural) => this.afterChange(structural),
    };
  }

  start() {
    const { store, prices, sync } = this.services;
    this.#catchUnexpectedErrors();
    window.addEventListener("hashchange", () => {
      this.render();
      window.scrollTo(0, 0);
      replay(this.main, "view-enter"); // neue Ansicht blendet sanft ein
    });
    this.main.addEventListener("click", (e) => this.#onTileClick(e));
    document.addEventListener("error", (e) => this.#onImageError(e), true);
    document.addEventListener("load", (e) => this.#onImageLoad(e), true);
    this.dialog.addEventListener("click", (e) => e.target === this.dialog && this.closeSheet());
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault(); // Escape: auch mit Animation schließen
      this.closeSheet();
    });
    this.dialog.addEventListener("close", () => {
      this.#sheetRefresh = null;
      this.#sheetNav = null;
      this.refresh();
    });
    // Blättern in der Kartenansicht: nur deutlich waagerechtes Wischen zählt, senkrechtes Scrollen bleibt unberührt
    const typing = (el) => el.closest("input, select, textarea");
    let touch = null;
    this.dialog.addEventListener("touchstart", (e) => (touch = e.touches.length === 1 && !typing(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null), { passive: true });
    this.dialog.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      if (!touch || !t) return;
      const [dx, dy] = [t.clientX - touch.x, t.clientY - touch.y];
      touch = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) this.#turn(dx < 0 ? 1 : -1);
    });
    this.dialog.addEventListener("keydown", (e) => (e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing(e.target) && this.#turn(e.key === "ArrowRight" ? 1 : -1));
    store.addEventListener("change", () => sync.schedule());
    store.addEventListener("remote", () => this.#onRemoteChange());
    store.addEventListener("storage-error", () => this.#onStorageError());
    prices.addEventListener("update", () => this.refresh());
    // Preise: einmal pro Sitzung Bescheid geben, gespeicherte Werte bleiben sichtbar (offline meldet schon der Offline-Hinweis)
    prices.addEventListener("error", (e) => {
      if (describeError(e.detail).kind !== "offline") this.#once("prices", () => this.toast.show("Preise sind gerade nicht abrufbar – es werden die gespeicherten gezeigt.", { type: "info" }));
    });
    sync.addEventListener("status", () => this.#showSyncState());
    sync.addEventListener("problem", (e) => this.#onSyncProblem(e.detail));
    window.addEventListener("offline", () => {
      this.#showSyncState();
      this.toast.show("Du bist offline. Abhaken und Listen gehen weiter – alles wird später synchronisiert.", { type: "info", duration: 5000 });
    });
    window.addEventListener("online", () => {
      this.#showSyncState();
      if (sync.pendingCount) this.toast.show("Wieder online – deine Änderungen werden hochgeladen.", { type: "success" });
    });
    this.#showSyncState();
    this.render();
    $("#who").addEventListener("click", () => showProfiles(this.ctx));
    // Noch niemand angemeldet (neues Gerät): fragen, wer sammelt
    if (!sync.enabled && !this.services.profiles.active && !chosenThisSession()) showProfiles(this.ctx, { start: true });
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
    let view;
    try {
      view = VIEWS[route.view].render(this.main, this.ctx, route.arg) || {};
    } catch (error) {
      // Ansicht kaputt? Statt leerer Seite eine Erklärung und Auswege zeigen
      console.error(error);
      view = {};
      this.main.replaceChildren(
        emptyState("Diese Ansicht konnte nicht angezeigt werden.", "Deine Daten sind sicher gespeichert. Versuch es nochmal oder lade die App neu."),
        h("div", { class: "buttons" }, [
          h("button", { type: "button", class: "btn", onclick: () => location.reload() }, "Neu laden"),
          h("a", { class: "btn btn-ghost", href: "#sammlung" }, "Zur Sammlung"),
        ])
      );
    }
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
    try {
      this.#viewRefresh?.();
      this.#sheetRefresh?.();
    } catch (error) {
      this.#reportUnexpected(error);
    }
  }

  // Kartenansicht. Steht die Karte unter den sichtbaren Kacheln, blättern ‹ ›, Wischen und Pfeiltasten in genau
  // deren Reihenfolge – so geht es in jeder Ansicht (Filter und Sortierung inklusive), ohne sie anzufassen.
  openCard(card) {
    const cards = [...this.main.querySelectorAll(".tile")].filter((el) => !el.closest("[hidden], details:not([open])")).map(tileCard);
    this.#showCard(card, cards, 0);
  }

  #showCard(card, cards, dir) {
    const i = cards.findIndex((c) => c.id === card.id);
    const to = (d) => (i >= 0 && cards[i + d] ? () => this.#showCard(cards[i + d], cards, d) : null);
    const nav = { prev: to(-1), next: to(1) };
    this.openSheet((body, ctx) => renderCardSheet(body, card, { ...ctx, ...nav }), nav);
    if (!dir) return;
    const body = $("#sheetBody");
    body.classList.remove("turn-next", "turn-prev");
    void body.offsetWidth;
    body.classList.add(dir > 0 ? "turn-next" : "turn-prev");
  }

  // nav: { prev, next } zum Blättern (nur Kartenansicht)
  openSheet(render, nav = null) {
    const body = $("#sheetBody");
    this.#sheetNav = nav;
    this.#sheetRefresh = render(body, { ...this.ctx, close: () => this.closeSheet() }) || null;
    this.dialog.classList.remove("closing");
    if (!this.dialog.open) this.dialog.showModal();
    body.scrollTop = 0;
  }

  #turn(dir) {
    (dir > 0 ? this.#sheetNav?.next : this.#sheetNav?.prev)?.();
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
    const filtered = view === "sammlung" || view === "ordner" || view === "tauschen" || (view === "liste" && this.ctx.prefs.get("listFilter") !== "all");
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
    const undo = this.services.collection.toggle(card);
    navigator.vibrate?.(12);
    replay(tile, "just-changed");
    this.afterChange(false);
    // Abhaken wie überall mit „Rückgängig“ (holt Zustand, Kaufpreis und Ordner zurück); Hinzufügen bleibt still
    if (undo) {
      this.toast.show(`${card.name} ${cardNumber(card)} aus der Sammlung entfernt.`, {
        type: "success",
        force: true,
        action: { label: "Rückgängig", run: () => (undo(), this.afterChange(false)) },
      });
    }
  }

  // Bild fehlt → nächste Quelle (TCGdex deutsch → englisch → Limitless → pokemontcg.io, domain/card.js), sonst Platzhalter.
  // Am Bild gemerkt: womit es gestartet ist und was schon probiert wurde. Gibt es gar keins, merkt sich das
  // das Bild-Gedächtnis (components/cardTile.js) – beim nächsten Mal gleich der Platzhalter.
  #onImageError(e) {
    const img = e.target;
    const box = img instanceof HTMLImageElement && img.closest(".tile-art, .sheet-art, .batch-art, .mover-art");
    if (!box) return;
    img.dataset.first ??= img.src;
    const tried = `${img.dataset.tried ?? ""} ${img.src}`.trim();
    img.dataset.tried = tried;
    const next = nextImage(img.dataset.first, tried.split(" "), IMAGE_PROXY);
    if (next) img.src = next;
    else {
      box.classList.add("no-img");
      if (img.dataset.img) rememberImage(img.dataset.img, "");
    }
  }

  // Bild geladen: weich einblenden; kam es erst über die Ersatzkette, die Adresse fürs nächste Mal merken
  #onImageLoad(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.closest(".tile-art, .sheet-art")) img.classList.add("loaded");
    if (img.dataset.tried && img.dataset.img) rememberImage(img.dataset.img, img.src);
  }

  // Sync hat Neues gebracht. Suche/Set/Mehr nicht neu aufbauen (Eingaben gingen verloren), nur aktualisieren.
  #onRemoteChange() {
    if (["suche", "set", "mehr", "hinzufuegen"].includes(currentRoute().view)) this.refresh();
    else this.render();
  }

  // Unerwartete Fehler: kurzer Hinweis mit „Neu laden“ statt stillem Kaputtgehen
  #catchUnexpectedErrors() {
    window.addEventListener("error", (e) => this.#reportUnexpected(e.error || e.message));
    window.addEventListener("unhandledrejection", (e) => this.#reportUnexpected(e.reason));
  }

  #reportUnexpected(error) {
    console.error(error);
    this.toast.show("Da ist etwas schiefgelaufen. Deine Daten sind gespeichert – falls etwas hängt, neu laden.", {
      type: "error",
      action: { label: "Neu laden", run: () => location.reload() },
    });
  }

  #onSyncProblem(problem) {
    if (problem.kind === "offline") return; // dafür gibt es den Offline-Hinweis
    // Abgemeldet (z. B. Passwort woanders gesetzt) → neu anmelden; falsche Adresse → „Mehr“
    const toSettings =
      problem.kind === "auth" ? { label: "Anmelden", run: () => showProfiles(this.ctx) } : problem.kind === "notFound" ? { label: "Zu „Mehr“", run: () => (location.hash = "#mehr") } : null;
    const retry = problem.kind === "rejected" ? null : { label: "Nochmal", run: () => this.services.sync.run() };
    this.toast.show(`Sync: ${problem.message}`, { type: problem.kind === "rejected" ? "info" : "error", action: toSettings || retry });
  }

  // Gerät kann nicht speichern (Speicher voll / privater Modus) – sofort Sicherung anbieten
  #onStorageError() {
    this.#once("storage", () =>
      this.toast.show("Auf diesem Gerät kann gerade nicht gespeichert werden (Speicher voll oder privater Modus). Bitte eine Sicherung exportieren.", {
        type: "error",
        duration: 0,
        action: { label: "Exportieren", run: () => deliverFile(this.services.backup.createFile()) },
      })
    );
  }

  #once(key, show) {
    if (this.#shownOnce.has(key)) return;
    this.#shownOnce.add(key);
    show();
  }

  #showSyncState() {
    const { profiles } = this.services;
    const index = profiles.people.findIndex((p) => p.id === profiles.active);
    const me = profiles.people[index];
    const who = $("#who");
    who.textContent = me ? initial(me.name) : "?";
    who.style.background = me ? avatarColor(index) : "transparent";
    who.setAttribute("aria-label", me ? `${me.name} – Person wechseln` : "Wer sammelt? Person wählen");
    who.hidden = false;
    const state = this.services.sync.state;
    $("#syncDot").dataset.state = state;
    $("#syncLabel").textContent = SYNC_LABELS[state];
    this.#viewRefresh?.();
  }
}
