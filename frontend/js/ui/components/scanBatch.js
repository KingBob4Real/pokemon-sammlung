import { CONDITIONS, LANGUAGES } from "../../config.js";
import { h, ICONS } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { fmtEur, plural } from "../../core/format.js";
import { cardImage, cardNumber } from "../../domain/card.js";
import { cardSearch, choiceGrid } from "./cardPicker.js";

/**
 * Serien- und Seiten-Scan: viele Karten sammeln, ohne jedes Mal ein neues Foto zu machen, am Ende alle auf einmal
 * in die Sammlung. Jede Karte (jedes Fach) ist ein Scan. Die Liste liegt in ctx.session, bis sie gespeichert ist –
 * Dialog zu oder „Weiter scannen“ verliert nichts. Die Fotos liegen nur im Speicher (Vorschau), nie auf dem Gerät.
 * Eintrag: { status: wait | read | find | ok | pick | none | error | limit, preview, rec, cards, card, qty }
 */

const PARALLEL = 3; // so viele Fotos gleichzeitig lesen lassen (Seite: 9 Fächer → 3 Runden)
export const LANGUAGE_NAMES = { de: "Deutsch", en: "Englisch", ja: "Japanisch" };
const STATUS = {
  wait: "wartet …",
  read: "wird gelesen …",
  find: "wird gesucht …",
  pick: "unsicher – bitte wählen",
  none: "nicht gefunden",
  error: "hat nicht geklappt",
  limit: "nicht gescannt (Tageslimit)",
};
const ACTIONS = { pick: "Wählen", none: "Suchen", limit: "Suchen", error: "Nochmal" };
let uid = 0;

export const MAX_EMPTY_AUTO = 3; // so oft hintereinander automatisch nichts erkannt → Automatik pausiert

export function batchOf(ctx) {
  return (ctx.session.scanBatch ??= { items: [], queue: [], running: 0, note: "", emptyAutos: 0, changed: () => {} });
}

// Fotos dazu (Serie: eins, Seite: eins pro Fach) und lesen lassen
export function addShots(ctx, blobs, { auto = false, page = false } = {}) {
  const b = batchOf(ctx);
  for (const blob of blobs) {
    const item = { id: ++uid, blob, preview: URL.createObjectURL(blob), status: "wait", auto, page, qty: 1, rec: null, cards: [], card: null };
    b.items.push(item);
    b.queue.push(item);
  }
  b.note = "";
  pump(ctx);
  b.changed();
}

function pump(ctx) {
  const b = batchOf(ctx);
  while (b.running < PARALLEL && b.queue.length) {
    b.running++;
    read(ctx, b.queue.shift()).finally(() => {
      b.running--;
      pump(ctx);
      b.changed();
    });
  }
}

function drop(b, item, note = "") {
  const i = b.items.indexOf(item);
  if (i >= 0) b.items.splice(i, 1);
  URL.revokeObjectURL(item.preview);
  if (note) b.note = note;
}

async function read(ctx, item) {
  const b = batchOf(ctx);
  if (!b.items.includes(item)) return; // inzwischen gelöscht
  item.status = "read";
  b.changed();
  try {
    item.rec = await ctx.scanner.recognize(item.blob);
  } catch (e) {
    if (e.status === 429) {
      for (const it of [item, ...b.queue]) it.status = "limit";
      b.queue.length = 0;
      b.note = "Tageslimit erreicht – morgen geht es weiter. Die Liste bleibt; fehlende Karten über „Suchen“ hinzufügen.";
    } else {
      item.status = "error";
      b.note = describeError(e).kind === "offline" ? "Du bist offline – zum Scannen braucht es Internet." : "Erkennung gerade nicht möglich – später „Nochmal“ tippen.";
    }
    return;
  }
  // nichts lesbar: leeres Fach (Seite) einfach weglassen
  if (!item.rec.name && !item.rec.number) {
    if (item.auto) b.emptyAutos++;
    return drop(b, item, item.page ? "" : "Keine Karte erkannt – Karte gerade und ruhig in den Rahmen halten.");
  }
  if (item.auto) b.emptyAutos = 0;
  await find(ctx, item);
}

async function find(ctx, item) {
  const b = batchOf(ctx);
  item.status = "find";
  b.changed();
  let result;
  try {
    result = await ctx.scanner.match(item.rec);
  } catch {
    item.status = "error";
    b.note = "Die Kartensuche klappt gerade nicht – später „Nochmal“ tippen.";
    return;
  }
  item.cards = result.cards;
  if (!result.sure) {
    item.status = result.cards.length ? "pick" : "none";
    return;
  }
  // Automatisch ausgelöst und dieselbe Karte wie eben? Dann lag sie nur etwas anders im Rahmen.
  const prev = b.items[b.items.indexOf(item) - 1];
  if (item.auto && prev?.card?.id === result.cards[0].id) return drop(b, item, "Gleiche Karte wie eben – nicht doppelt gezählt. Zweites Exemplar? Bei der Karte + tippen.");
  item.card = result.cards[0];
  item.status = "ok";
  ctx.prices.request([item.card.id]);
}

function retry(ctx, item) {
  const b = batchOf(ctx);
  b.note = "";
  if (item.rec) find(ctx, item).finally(b.changed);
  else {
    item.status = "wait";
    b.queue.push(item);
    pump(ctx);
  }
  b.changed();
}

const cardsIn = (b) => b.items.filter((it) => it.card).reduce((n, it) => n + it.qty, 0);

// Eine Zeile: Bild, Name, Nummer, Preis, Anzahl ±, löschen. onResolve(item): unsichere/fehlende Karte klären
function itemRow(ctx, item, onResolve = null) {
  const b = batchOf(ctx);
  const { card } = item;
  const src = (card && cardImage(card, "low")) || item.preview;
  const title = card?.name || item.rec?.name || "Karte";
  const value = card ? ctx.prices.value(card.id) : null;
  const step = (d) => {
    item.qty = Math.max(1, Math.min(99, item.qty + d));
    b.changed();
  };
  const action = onResolve && ACTIONS[item.status];
  return h("li", { class: `batch-row is-${item.status}` }, [
    h("span", { class: "batch-art" }, [h("img", { src, alt: "", decoding: "async", ...(src === item.preview ? {} : { crossorigin: "anonymous" }) })]),
    h("div", { class: "batch-info" }, [
      h("b", {}, title),
      h("span", {}, card ? `${cardNumber(card)} · ${card.setName}` : STATUS[item.status]),
      value != null ? h("span", { class: "batch-price" }, fmtEur(value)) : null,
    ]),
    card
      ? h("div", { class: "batch-qty" }, [
          h("button", { type: "button", "aria-label": `${title}: eine weniger`, onclick: () => step(-1), disabled: item.qty <= 1 }, "−"),
          h("output", {}, String(item.qty)),
          h("button", { type: "button", "aria-label": `${title}: eine mehr`, onclick: () => step(1) }, "+"),
        ])
      : action
        ? h("button", { type: "button", class: "btn batch-action", onclick: () => onResolve(item) }, action)
        : null,
    h("button", { type: "button", class: "batch-remove", "aria-label": `${title} aus der Liste nehmen`, html: ICONS.close, onclick: () => (drop(b, item), b.changed()) }),
  ]);
}

// Liste in der Kamera (über dem Auslöser), neueste oben. → { el, draw }
export function batchTray(ctx, { onDone }) {
  const b = batchOf(ctx);
  const note = h("p", { class: "batch-note", "aria-live": "polite" });
  const list = h("ul", { class: "batch-list" });
  const done = h("button", { type: "button", class: "btn batch-done", onclick: onDone });
  const el = h("div", { class: "batch-tray" }, [note, list, done]);
  // Höhe bleibt immer gleich (leer: Hinweis statt Zeilen, „Fertig“ ausgegraut) – der Rahmen darüber springt nicht
  const draw = () => {
    note.textContent = b.note;
    note.hidden = !b.note;
    list.replaceChildren(...(b.items.length ? [...b.items].reverse().map((it) => itemRow(ctx, it)) : [h("li", { class: "batch-empty" }, "Gescannte Karten erscheinen hier")]));
    done.disabled = !b.items.length;
    done.textContent = b.items.length ? `Fertig · ${plural(b.items.length, "Karte", "Karten")} prüfen` : "Fertig";
  };
  return { el, draw };
}

/**
 * Prüfen und speichern: unsichere Karten klären, Zustand/Sprache/Abteilung/Liste für alle, „12 Karten in die Sammlung“.
 * Gibt die Funktion zum Neuzeichnen zurück (Preise, Fortschritt).
 */
export function batchReview(body, ctx, { listId, onScanMore }) {
  const b = batchOf(ctx);
  const { collection, lists } = ctx;
  const closeButton = h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: ctx.close, html: ICONS.close });
  const live = () => closeButton.isConnected && body.closest("dialog").open;
  const option = (value, label, selected = false) => h("option", { value, selected }, label);
  // Auswahl bleibt beim Neuzeichnen erhalten (einmal gebaut)
  const cond = h("select", { class: "field" }, CONDITIONS.map((c) => option(c, c, c === "Near Mint")));
  const lang = h("select", { class: "field" }, [option("", "Wie erkannt"), ...LANGUAGES.map((l) => option(l, l))]);
  const section = h("select", { class: "field" }, [option("", "Keine"), ...collection.sections().map((s) => option(s.id, s.name))]);
  const list = h("select", { class: "field" }, [option("", "Keine"), ...lists.all().map((l) => option(l.id, l.name, l.id === listId))]);
  const title = h("h2");
  const note = h("p", { class: "muted", "aria-live": "polite" });
  const rows = h("ul", { class: "batch-list big" });
  const save = h("button", { type: "button", class: "btn btn-big", onclick: () => store() });
  const show = (...children) => body.replaceChildren(...children.filter(Boolean));
  let redraw = null;

  const draw = () => {
    if (!live() || redraw !== draw) return;
    const open = b.items.filter((it) => !it.card).length;
    const busy = b.items.filter((it) => ["wait", "read", "find"].includes(it.status)).length;
    title.textContent = b.items.length ? `${plural(b.items.length, "Karte", "Karten")} gescannt` : "Liste ist leer";
    note.textContent = [b.note, busy ? `${busy} ${busy === 1 ? "wird" : "werden"} noch gelesen …` : "", open - busy > 0 ? `${open - busy} ungeklärt – antippen zum Wählen, sonst bleiben sie draußen.` : ""].filter(Boolean).join(" ");
    rows.replaceChildren(...b.items.map((it) => itemRow(ctx, it, resolve)));
    const n = cardsIn(b);
    save.disabled = !n;
    save.textContent = n ? `${plural(n, "Karte", "Karten")} in die Sammlung` : "In die Sammlung";
  };

  function showList() {
    show(
      closeButton,
      title,
      note,
      rows,
      h("section", { class: "sheet-part" }, [
        h("h3", {}, "Für alle Karten"),
        h("label", { class: "label" }, ["Zustand", cond]),
        h("label", { class: "label" }, ["Sprache", lang]),
        h("label", { class: "label" }, ["Abteilung", section]),
        h("label", { class: "label" }, ["Liste", list]),
        h("p", { class: "muted batch-hint" }, "Zustand und Sprache gelten für Karten, die neu in die Sammlung kommen – bei vorhandenen erhöht sich nur die Anzahl."),
      ]),
      h("div", { class: "scan-bar" }, [save, h("button", { type: "button", class: "btn btn-ghost", onclick: onScanMore }, "📷 Weiter scannen")])
    );
    redraw = draw;
    draw();
  }

  // Unsichere/fehlende Karte klären: Foto-Ausschnitt, Treffer, Suche
  function resolve(item) {
    if (item.status === "error") return retry(ctx, item);
    const pick = (card) => {
      item.card = card;
      item.status = "ok";
      ctx.prices.request([card.id]);
      showList();
    };
    const choices = item.cards.length ? choiceGrid(ctx, item.cards, pick) : null;
    const search = cardSearch(ctx, { query: item.rec?.name || item.rec?.number || "", onPick: pick, live });
    show(
      closeButton,
      h("button", { type: "button", class: "back", onclick: showList }, "‹ Zurück zur Liste"),
      h("h2", {}, "Welche Karte ist es?"),
      h("img", { class: "batch-photo", src: item.preview, alt: "Foto der Karte" }),
      choices ? h("p", { class: "muted" }, "Diese passen – tippe die richtige an:") : null,
      choices?.grid,
      h("h3", {}, "Oder suchen"),
      ...search.elements
    );
    body.scrollTop = 0;
    redraw = () => (choices?.update(), search.update());
  }

  function store() {
    const ready = b.items.filter((it) => it.card);
    if (!ready.length) return;
    const cards = ready.map((it) => it.card);
    const count = cardsIn(b);
    ctx.store.batch(() => {
      for (const it of ready) {
        const owned = collection.quantity(it.card.id);
        collection.setQuantity(it.card, owned + it.qty);
        if (!owned) collection.update(it.card.id, { cond: cond.value, lang: lang.value || LANGUAGE_NAMES[it.rec?.language] || "Deutsch" });
      }
      if (section.value) collection.setSection(cards, section.value);
      if (list.value) lists.addCards(list.value, cards);
    });
    ctx.afterChange(Boolean(list.value));
    for (const it of ready) drop(b, it); // Ungeklärte bleiben für später in der Liste
    b.note = "";
    navigator.vibrate?.(15);
    redraw = null;
    show(
      closeButton,
      h("div", { class: "scan-done" }, [
        h("span", { class: "scan-done-icon", html: ICONS.check }),
        h("h2", {}, `${plural(count, "Karte", "Karten")} in der Sammlung`),
        b.items.length ? h("p", { class: "muted" }, `${plural(b.items.length, "ungeklärte Karte bleibt", "ungeklärte Karten bleiben")} in der Scan-Liste.`) : null,
      ]),
      h("div", { class: "scan-bar" }, [h("button", { type: "button", class: "btn btn-big", onclick: onScanMore }, "📷 Weiter scannen"), h("button", { type: "button", class: "btn btn-ghost", onclick: ctx.close }, "Fertig")])
    );
  }

  b.changed = () => redraw === draw && draw();
  showList();
  return () => redraw?.();
}
