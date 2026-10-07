import { h, ICONS } from "../../core/dom.js";
import { fmtEur } from "../../core/format.js";
import { cardImage, cardNumber } from "../../domain/card.js";

/**
 * Kartenkachel in drei Arten:
 *   "default" – Bild antippen = Kartenansicht, Haken = in Sammlung ja/nein
 *   "view"    – nur Kartenansicht (z. B. in der Sammlung)
 *   "pick"    – ganze Kachel antippen = auswählen (Listen bearbeiten); Zustand über setPicked()
 */
const tileCards = new WeakMap();

export function cardTile(card, { mode = "default" } = {}) {
  const img = cardImage(card, "low");
  const pick = mode === "pick";
  const el = h("article", { class: "tile", "data-pick": pick }, [
    h(
      "button",
      {
        type: "button",
        class: img ? "tile-art" : "tile-art no-img",
        "data-open": !pick,
        "aria-label": pick ? `${card.name} ${cardNumber(card)} auswählen` : `${card.name} ${cardNumber(card)} anzeigen`,
      },
      [
        img ? h("img", { src: img, alt: "", loading: "lazy", decoding: "async", crossorigin: "anonymous" }) : null,
        h("span", { class: "tile-ph", "aria-hidden": "true" }, [card.name, h("br"), cardNumber(card)]),
      ]
    ),
    mode === "default" ? h("button", { type: "button", class: "tile-check", "data-toggle": "", html: ICONS.check }) : null,
    pick ? h("span", { class: "tile-pick", "aria-hidden": "true" }) : null,
    h("div", { class: "tile-info" }, [h("b", {}, card.name), h("span", {}, `${cardNumber(card)} · ${card.setName}`), h("span", { class: "tile-value" })]),
  ]);
  tileCards.set(el, card);
  return el;
}

export const tileCard = (el) => (el ? tileCards.get(el) : undefined);

export function setPicked(el, picked) {
  el.classList.toggle("is-picked", picked);
  el.querySelector(".tile-art").setAttribute("aria-pressed", String(picked));
}

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
