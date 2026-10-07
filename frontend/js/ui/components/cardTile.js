import { h, ICONS } from "../../core/dom.js";
import { fmtEur } from "../../core/format.js";
import { cardImage, cardNumber } from "../../domain/card.js";

// Kartenkachel: Bild (antippen = Kartenansicht), Haken (antippen = in Sammlung ja/nein), Name, Nummer, Wert.
const tileCards = new WeakMap();

export function cardTile(card, { checkable = true } = {}) {
  const img = cardImage(card, "low");
  const el = h("article", { class: "tile" }, [
    h("button", { type: "button", class: img ? "tile-art" : "tile-art no-img", "data-open": "", "aria-label": `${card.name} ${cardNumber(card)} anzeigen` }, [
      img ? h("img", { src: img, alt: "", loading: "lazy", decoding: "async", crossorigin: "anonymous" }) : null,
      h("span", { class: "tile-ph", "aria-hidden": "true" }, [card.name, h("br"), cardNumber(card)]),
    ]),
    checkable ? h("button", { type: "button", class: "tile-check", "data-toggle": "", html: ICONS.check }) : null,
    h("div", { class: "tile-info" }, [h("b", {}, card.name), h("span", {}, `${cardNumber(card)} · ${card.setName}`), h("span", { class: "tile-value" })]),
  ]);
  tileCards.set(el, card);
  return el;
}

export const tileCard = (el) => (el ? tileCards.get(el) : undefined);

export function updateTile(el, { qty, value }) {
  const card = tileCards.get(el);
  el.classList.toggle("is-owned", qty > 0);
  const check = el.querySelector(".tile-check");
  if (check) {
    check.setAttribute("aria-pressed", String(qty > 0));
    check.setAttribute("aria-label", `${card.name}: ${qty > 0 ? "in der Sammlung, antippen zum Entfernen" : "fehlt, antippen zum Hinzufügen"}`);
  }
  el.querySelector(".tile-value").textContent = (qty > 1 ? `${qty}× ` : "") + (value != null ? fmtEur(value) : "");
}
