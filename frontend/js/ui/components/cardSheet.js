import { CARDMARKET_LANGUAGES, CONDITIONS, LANGUAGES } from "../../config.js";
import { h, ICONS } from "../../core/dom.js";
import { fmtDate, fmtEur, fmtPriceInput, parseEuro, positive } from "../../core/format.js";
import { cardImage, cardNumber } from "../../domain/card.js";
import { cardmarketUrl } from "../../domain/price.js";

/**
 * Kopf der Kartenansicht: Bild, Name, Nummer & Set, Seltenheit, Cardmarket-Preise.
 * Auch für die Bestätigung beim Scannen. drawPrices() zeichnet die Preise neu, sobald sie geladen sind.
 * language() → gewählte Sprache der Karte, für den Cardmarket-Link.
 */
export function cardHead(card, prices, language = () => "Deutsch") {
  const rarity = h("p", { class: "muted" });
  const priceBox = h("div", { class: "prices" });
  const drawPrices = () => {
    const p = prices.get(card.id);
    rarity.textContent = p?.rarity || "";
    const cell = (label, value) => h("div", {}, [h("span", {}, label), h("b", {}, fmtEur(value))]);
    priceBox.replaceChildren(
      p && (p.trend || p.low || p.avg30)
        ? h("div", { class: "price-grid" }, [cell("Trend", p.trend), cell("ab", p.low), cell("Ø 30 Tage", p.avg30)])
        : p
          ? h("p", { class: "muted" }, "Für diese Karte gibt es keinen Cardmarket-Richtwert.")
          : !navigator.onLine
            ? h("p", { class: "muted" }, "Du bist offline – für diese Karte ist noch kein Preis gespeichert.")
            : prices.hasFailed(card.id)
              ? h("p", { class: "muted" }, ["Der Preis konnte gerade nicht geladen werden. ", h("button", { type: "button", class: "link-button", onclick: () => (prices.request([card.id]), drawPrices()) }, "Erneut laden")])
              : h("p", { class: "muted" }, "Preis wird geladen …"),
      h("p", { class: "muted small" }, `Richtwert über alle Sprachen & Zustände${p?.updated ? ` · Stand ${fmtDate(p.updated)}` : ""}`),
      h("a", { class: "btn cm", href: cardmarketUrl(card, p, language()), target: "_blank", rel: "noopener" }, `Auf Cardmarket ansehen (${CARDMARKET_LANGUAGES[language()] ? language() : "alle Sprachen"}, ab Excellent)`)
    );
  };
  const image = cardImage(card, "high");
  const elements = [
    h("div", { class: image ? "sheet-art" : "sheet-art no-img" }, [
      image ? h("img", { src: image, alt: `${card.name} ${cardNumber(card)}`, crossorigin: "anonymous" }) : null,
      h("span", { class: "tile-ph" }, [card.name, h("br"), cardNumber(card)]),
    ]),
    h("h2", {}, card.name),
    h("p", { class: "muted" }, `${cardNumber(card)} · ${card.setName}`),
    rarity,
    priceBox,
  ];
  drawPrices();
  prices.request([card.id]);
  return { elements, drawPrices };
}

/**
 * Kartenansicht: Kopf (Bild, Preise), Sammlung (Anzahl, Zustand, Sprache, Kaufpreis) und Listen.
 * Gibt eine Funktion zurück, die die Preise neu zeichnet, sobald sie geladen sind.
 */
export function renderCardSheet(body, card, ctx) {
  const { collection, lists, prices } = ctx;
  const entry = collection.entry(card.id);

  // --- Sammlung ---
  const qtyOut = h("output", {}, String(entry?.qty || 0));
  const cond = h("select", { class: "field" }, CONDITIONS.map((c) => h("option", { selected: (entry?.cond || "Near Mint") === c }, c)));
  const lang = h("select", { class: "field" }, LANGUAGES.map((l) => h("option", { selected: (entry?.lang || "Deutsch") === l }, l)));
  const paid = h("input", { type: "text", class: "field", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done", placeholder: "z. B. 12,50 €", value: fmtPriceInput(entry?.paid) });
  const fields = [cond, lang, paid];
  // Ganz raus aus der Sammlung – mit „Rückgängig“ (Zustand & Kaufpreis bleiben ohnehin gespeichert)
  const removeAll = () => {
    const before = collection.quantity(card.id);
    collection.setQuantity(card, 0);
    ctx.afterChange(false);
    ctx.close();
    ctx.notify(`${card.name} ${cardNumber(card)} aus der Sammlung entfernt.`, {
      type: "success",
      force: true,
      action: { label: "Rückgängig", run: () => (collection.setQuantity(card, before), ctx.afterChange(false)) },
    });
  };
  const remove = h("button", { type: "button", class: "btn btn-ghost danger", onclick: removeAll }, "Aus der Sammlung entfernen");
  const syncFields = () => {
    const qty = collection.quantity(card.id);
    qtyOut.textContent = String(qty);
    for (const f of fields) f.disabled = qty === 0;
    remove.hidden = qty === 0;
  };
  const step = (delta) => {
    const next = collection.quantity(card.id) + delta;
    if (next < 0) return;
    collection.setQuantity(card, next);
    syncFields();
    ctx.afterChange(false);
  };
  cond.addEventListener("change", () => collection.update(card.id, { cond: cond.value }));
  lang.addEventListener("change", () => {
    collection.update(card.id, { lang: lang.value });
    head.drawPrices(); // Cardmarket-Link passend zur Sprache
  });
  paid.addEventListener("input", () => {
    const n = parseEuro(paid.value);
    if (Number.isNaN(n)) return; // Tippfehler ignorieren
    collection.update(card.id, { paid: n || null });
    ctx.refresh();
  });
  paid.addEventListener("blur", () => (paid.value = fmtPriceInput(positive(collection.entry(card.id)?.paid))));
  paid.addEventListener("keydown", (e) => e.key === "Enter" && paid.blur());

  // --- Listen ---
  const listBox = h("div", { class: "checks" });
  const drawLists = () => {
    const name = h("input", { type: "text", class: "field", placeholder: "Neue Liste …", "aria-label": "Neue Liste anlegen", maxlength: 80, enterkeyhint: "done" });
    const form = h("form", { class: "toolbar tight" }, [name, h("button", { type: "submit", class: "btn btn-ghost" }, "Anlegen")]);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = lists.create(name.value);
      if (!id) return;
      lists.setMembership(id, card, true);
      drawLists();
      ctx.afterChange(true);
    });
    listBox.replaceChildren(
      ...lists.all().map((list) => {
        const box = h("input", { type: "checkbox", checked: lists.contains(list.id, card.id) });
        box.addEventListener("change", () => {
          lists.setMembership(list.id, card, box.checked);
          ctx.afterChange(true);
        });
        return h("label", { class: "check-row" }, [box, h("span", {}, list.name)]);
      }),
      form
    );
  };

  const head = cardHead(card, prices, () => collection.entry(card.id)?.lang || "Deutsch");
  body.replaceChildren(
    h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: ctx.close, html: ICONS.close }),
    ...head.elements,
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
      h("div", { class: "buttons" }, [remove]),
    ]),
    h("section", { class: "sheet-part" }, [h("h3", {}, "Listen"), listBox])
  );
  syncFields();
  drawLists();
  return head.drawPrices;
}
