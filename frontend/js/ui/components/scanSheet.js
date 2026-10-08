import { CONDITIONS, LANGUAGES } from "../../config.js";
import { h, ICONS } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { fmtPriceInput, parseEuro } from "../../core/format.js";
import { cardNumber } from "../../domain/card.js";
import { cardHead } from "./cardSheet.js";
import { cardTile, tileCard, updateTile } from "./cardTile.js";
import { progressBar } from "./progressBar.js";
import { emptyState } from "./widgets.js";

const SEARCH_RESULTS = 30;
let picker = null; // ein unsichtbares Datei-Feld für alle Scans; „capture“ öffnet am Handy die Rückkamera

/**
 * Karten-Scanner: Foto aufnehmen → erkennen → bestätigen → in die Sammlung.
 * Läuft in der Kartenansicht (Dialog), Meldungen stehen deshalb dort statt unten als Hinweis.
 * Jeder Fehler hat einen Ausweg: Nochmal, manuell suchen, schließen.
 *   listId – beim Scannen aus einer Liste ist diese Liste schon angehakt
 */
export function startScan(ctx, { listId = null } = {}) {
  if (!navigator.onLine) return ctx.notify("Zum Scannen braucht es Internet.", { type: "info" });
  if (!ctx.scanner.ready) {
    return ctx.notify("Zum Scannen bitte erst unter „Mehr“ den Sync-Schlüssel eintragen.", { type: "info", action: { label: "Zu „Mehr“", run: () => (location.hash = "#mehr") } });
  }
  picker ??= document.body.appendChild(h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true }));
  picker.onchange = () => {
    const file = picker.files[0];
    picker.value = ""; // dasselbe Foto später nochmal wählen können
    if (file) ctx.openSheet((body, sheet) => scanFlow(body, sheet, file, listId)); // abgebrochen: nichts tun
  };
  picker.click();
}

// Knopf „📷 Scannen“ für Ansichten; offline ausgegraut mit Hinweis. refresh() bei online/offline aufrufen.
export function scanButton(ctx, options) {
  const button = h("button", { type: "button", class: "btn", onclick: () => startScan(ctx, options) }, "📷 Scannen");
  const note = h("p", { class: "muted pad" }, "Zum Scannen braucht es Internet.");
  const refresh = () => {
    button.disabled = !navigator.onLine;
    note.hidden = navigator.onLine;
  };
  refresh();
  return { button, note, refresh };
}

// Ablauf im Dialog. Gibt die Funktion zurück, die nach dem Laden von Preisen neu zeichnet.
function scanFlow(body, ctx, file, listId) {
  const { scanner, collection, lists, prices, catalog } = ctx;
  const closeButton = h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: ctx.close, html: ICONS.close });
  let redraw = null;
  // Antwort kommt erst, nachdem der Dialog zu ist oder eine Karte geöffnet wurde? Dann nichts mehr zeigen.
  const live = () => closeButton.isConnected && body.closest("dialog").open;
  const show = (...children) => {
    redraw = null;
    body.replaceChildren(closeButton, ...children.filter(Boolean));
    body.scrollTop = 0;
  };
  const button = (label, run, cls = "btn") => h("button", { type: "button", class: cls, onclick: run }, label);
  const ghost = (label, run) => button(label, run, "btn btn-ghost");
  const scanAgain = () => (navigator.onLine ? startScan(ctx, { listId }) : failed(new Error("offline")));
  const manualSearch = (rec) => () => search(rec, "Karte suchen");

  function busy(title) {
    const bar = progressBar();
    show(h("h2", {}, title), bar.el, h("p", { class: "muted" }, "Dauert meist nur ein paar Sekunden."), h("div", { class: "buttons" }, [ghost("Abbrechen", ctx.close)]));
    bar.busy();
  }

  async function recognize() {
    busy("Karte wird erkannt …");
    let rec;
    try {
      rec = await scanner.recognize(file);
    } catch (e) {
      if (live()) failed(e, recognize);
      return;
    }
    if (live()) match(rec);
  }

  async function match(rec) {
    busy("Karte wird gesucht …");
    let result;
    try {
      result = await scanner.match(rec);
    } catch (e) {
      if (live()) failed(e, () => match(rec), rec);
      return;
    }
    if (!live()) return;
    const { cards, sure } = result;
    if (sure) confirm(cards[0], rec, cards.length > 1 ? () => choose(cards, rec) : null);
    else if (cards.length) choose(cards, rec);
    else search(rec, "Karte nicht erkannt");
  }

  // Fehler → verständlich, mit passendem Ausweg. rec da = Erkennung hat geklappt, nur die Suche nicht.
  function failed(error, retry, rec = null) {
    const { kind, message } = describeError(error);
    const status = error?.status;
    let text = rec ? "Die Kartensuche klappt gerade nicht." : "Erkennung gerade nicht möglich.";
    let actions = [retry && button("Nochmal", retry), ghost("Manuell suchen", manualSearch(rec))];
    if (kind === "offline") {
      text = "Zum Scannen braucht es Internet.";
      actions = [retry && button("Nochmal", retry), ghost("Schließen", ctx.close)];
    } else if (status === 429) {
      text = "Tageslimit für Scans erreicht – morgen geht es weiter. Du kannst die Karte so lange über die Suche hinzufügen.";
      actions = [button("Manuell suchen", manualSearch(rec)), ghost("Schließen", ctx.close)];
    } else if (kind === "auth") {
      text = message;
      actions = [button("Zu „Mehr“", () => (ctx.close(), (location.hash = "#mehr"))), ghost("Schließen", ctx.close)];
    } else if (status === 413 || error?.photo) {
      text = status === 413 ? "Foto zu groß – bitte nochmal." : "Das Foto konnte nicht gelesen werden – bitte nochmal.";
      actions = [button("Nochmal scannen", scanAgain), ghost("Manuell suchen", manualSearch(rec))];
    }
    show(emptyState(text), h("div", { class: "buttons" }, actions.filter(Boolean)));
  }

  // Kacheln zum Antippen; zeigt Anzahl in der Sammlung und Marktwert
  function choiceGrid(cards, onPick) {
    const grid = h("div", { class: "grid" }, cards.map((c) => cardTile(c, { mode: "view" })));
    grid.addEventListener("click", (e) => {
      const card = tileCard(e.target.closest(".tile"));
      if (card) onPick(card);
    });
    const update = () => {
      for (const el of grid.children) updateTile(el, { qty: collection.quantity(tileCard(el).id), value: prices.value(tileCard(el).id) });
    };
    update();
    prices.request(cards.map((c) => c.id));
    return { grid, update };
  }

  function choose(cards, rec) {
    const { grid, update } = choiceGrid(cards, (card) => confirm(card, rec, () => choose(cards, rec)));
    show(
      h("h2", {}, "Welche Karte ist es?"),
      h("p", { class: "muted" }, "Mehrere Karten passen – tippe die richtige an."),
      grid,
      h("div", { class: "buttons" }, [ghost("Manuell suchen", manualSearch(rec)), ghost("Nochmal scannen", scanAgain)])
    );
    redraw = update;
  }

  // Nichts (Passendes) gefunden: Suche, vorausgefüllt mit dem Gelesenen
  function search(rec, title) {
    const input = h("input", {
      type: "search",
      class: "field",
      placeholder: "Name oder Nummer, z. B. Glurak 199",
      "aria-label": "Karte suchen",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      enterkeyhint: "search",
      value: rec?.name || rec?.number || "",
    });
    const form = h("form", { class: "toolbar" }, [input, h("button", { type: "submit", class: "btn" }, "Suchen")]);
    const bar = progressBar();
    const results = h("div");
    let seq = 0;
    const run = async () => {
      const query = input.value.trim();
      const mine = ++seq;
      if (!query) return results.replaceChildren();
      bar.busy();
      try {
        const cards = await catalog.search(query);
        if (mine !== seq || !live()) return;
        const choice = choiceGrid(cards.slice(0, SEARCH_RESULTS), (card) => confirm(card, rec, () => search(rec, title)));
        redraw = choice.update;
        results.replaceChildren(cards.length ? choice.grid : emptyState(`Keine Karte gefunden für „${query}“.`, "Tipp: deutschen Namen verwenden, z. B. „Glurak“ statt „Charizard“."));
      } catch (e) {
        if (mine !== seq) return;
        const offline = describeError(e).kind === "offline";
        results.replaceChildren(emptyState(offline ? "Du bist offline – die Suche braucht Internet." : "Die Kartensuche klappt gerade nicht."), h("div", { class: "buttons center" }, [button("Nochmal", run)]));
      }
      bar.done();
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      input.blur(); // Handy-Tastatur zuklappen
      run();
    });
    const read = [rec?.name, rec?.number && (rec.total ? `${rec.number}/${rec.total}` : rec.number), rec?.setCode].filter(Boolean).join(" · ");
    show(
      h("h2", {}, title),
      read ? h("p", { class: "muted" }, `Gelesen: ${read}`) : null,
      form,
      bar.el,
      results,
      h("div", { class: "buttons" }, [ghost("Nochmal scannen", scanAgain), ghost("Schließen", ctx.close)])
    );
    run();
  }

  // Bestätigung: Karte mit Preisen, Angaben wählen, „In Sammlung“. back: zurück zur Auswahl
  function confirm(card, rec, back) {
    const entry = collection.entry(card.id);
    const owned = collection.quantity(card.id);
    const head = cardHead(card, prices);
    head.elements[0].classList.add("small"); // Bild kleiner, damit Angaben und Preise gleich zu sehen sind
    let qty = 1;
    const qtyOut = h("output", { "aria-live": "polite" }, "1");
    const cond = h("select", { class: "field" }, CONDITIONS.map((c) => h("option", { selected: (entry?.cond || "Near Mint") === c }, c)));
    const lang = h("select", { class: "field" }, LANGUAGES.map((l) => h("option", { selected: (entry?.lang || "Deutsch") === l }, l)));
    const paid = h("input", { type: "text", class: "field", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done", placeholder: "z. B. 12,50 €", value: fmtPriceInput(entry?.paid) });
    const paidNote = h("p", { class: "field-note", role: "alert" });
    const trend = h("button", { type: "button", class: "btn btn-ghost", onclick: () => (paid.value = fmtPriceInput(prices.get(card.id)?.trend)) }, "Trend übernehmen");
    const checks = lists.all().map((list) => [list, h("input", { type: "checkbox", checked: list.id === listId || lists.contains(list.id, card.id) })]);
    const add = button("", () => save(), "btn btn-big");
    const label = () => (add.textContent = owned ? `Anzahl erhöhen (${owned} → ${owned + qty})` : qty > 1 ? `${qty}× in die Sammlung` : "In Sammlung");
    const step = (delta) => {
      qty = Math.max(1, Math.min(99, qty + delta));
      qtyOut.textContent = String(qty);
      label();
    };
    const drawTrend = () => (trend.disabled = !prices.get(card.id)?.trend);

    const save = () => {
      const price = parseEuro(paid.value);
      if (Number.isNaN(price)) {
        paidNote.textContent = "Bitte den Kaufpreis als Zahl eingeben, z. B. 12,50.";
        return paid.focus();
      }
      let structural = false;
      ctx.store.batch(() => {
        collection.setQuantity(card, owned + qty);
        collection.update(card.id, { cond: cond.value, lang: lang.value, paid: price });
        for (const [list, box] of checks) {
          if (box.checked === lists.contains(list.id, card.id)) continue;
          lists.setMembership(list.id, card, box.checked);
          structural = true;
        }
      });
      ctx.afterChange(structural);
      navigator.vibrate?.(15);
      done(card, owned + qty);
    };

    show(
      back ? h("button", { type: "button", class: "back", onclick: back }, "‹ Andere Karte wählen") : null,
      ...head.elements,
      h("section", { class: "sheet-part" }, [
        h("h3", {}, owned ? `Schon ${owned}× in der Sammlung` : "In die Sammlung"),
        h("div", { class: "stepper" }, [
          h("button", { type: "button", class: "btn btn-ghost", "aria-label": "Eine weniger", onclick: () => step(-1) }, "−"),
          qtyOut,
          h("button", { type: "button", class: "btn", "aria-label": "Eine mehr", onclick: () => step(1) }, "+"),
        ]),
        h("label", { class: "label" }, ["Zustand", cond]),
        h("label", { class: "label" }, ["Sprache", lang]),
        h("label", { class: "label" }, ["Kaufpreis pro Stück", h("div", { class: "toolbar tight" }, [paid, trend])]),
        paidNote,
      ]),
      checks.length ? h("section", { class: "sheet-part" }, [h("h3", {}, "Listen"), h("div", { class: "checks" }, checks.map(([list, box]) => h("label", { class: "check-row" }, [box, h("span", {}, list.name)])))]) : null,
      h("div", { class: "buttons" }, [ghost("Falsche Karte? Manuell suchen", manualSearch(rec))]),
      h("div", { class: "scan-bar" }, [add])
    );
    label();
    drawTrend();
    redraw = () => (head.drawPrices(), drawTrend());
  }

  function done(card, total) {
    show(
      h("div", { class: "scan-done" }, [
        h("span", { class: "scan-done-icon", html: ICONS.check }),
        h("h2", {}, `${card.name} ${cardNumber(card)} hinzugefügt`),
        h("p", { class: "muted" }, `Jetzt ${total}× in der Sammlung.`),
      ]),
      h("div", { class: "scan-bar" }, [button("📷 Nächste Karte scannen", scanAgain, "btn btn-big"), ghost("Fertig", ctx.close)])
    );
  }

  recognize();
  return () => redraw?.();
}
