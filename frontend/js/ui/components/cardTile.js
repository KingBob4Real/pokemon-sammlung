import { IMAGE_PROXY } from "../../config.js";
import { h, ICONS } from "../../core/dom.js";
import { fmtEur, objOr } from "../../core/format.js";
import { cardImage, cardNumber, imageSources } from "../../domain/card.js";

// Bild-Gedächtnis: Für Karten ohne TCGdex-Bild probiert die App sonst bei jeder Anzeige die ganze Ersatzkette (bis zu
// 5 Adressen, app.js #onImageError) – Fehlschläge speichert der Service Worker nicht. Gemerkt: „Karten-ID|Größe“ →
// [Adresse, die geklappt hat, oder "" = keine, Zeitpunkt]; nach ttl (30 Tage) wird neu probiert, damit TCGdex-Nachträge ankommen.
// ponytail: eine Map und ein Speicher-Schlüssel für alle Personen, nur Karten, die Ersatz brauchten (wenige hundert).
let images = new Map();
let memory = { ttl: 0, save: () => {} };

export function useImageMemory(storage, key, ttl, now = Date.now()) {
  images = new Map(Object.entries(objOr(storage.get(key, {}))).filter(([, v]) => Array.isArray(v) && now - v[1] < ttl));
  memory = { ttl, save: () => storage.set(key, Object.fromEntries(images)) };
}

// Adresse fürs Bild: die gemerkte, null (gemerkt: keine → Platzhalter) oder die von TCGdex. Ist nur die andere Größe
// bekannt, gilt sie mit: „keins“ für beide (alle Quellen haben beide Größen), sonst dieselbe Quelle in dieser Größe –
// spart beim ersten Öffnen der Kartenansicht die Fehlversuche bei TCGdex.
export function imageFor(card, size, now = Date.now()) {
  const known = (s) => {
    const v = images.get(`${card.id}|${s}`);
    return v && now - v[1] < memory.ttl ? v[0] : undefined;
  };
  const own = known(size);
  if (own !== undefined) return own || null;
  const otherSize = size === "low" ? "high" : "low";
  const other = known(otherSize);
  if (other === "") return null;
  const first = cardImage(card, size);
  if (!other || !first) return first;
  const index = imageSources(cardImage(card, otherSize), IMAGE_PROXY).indexOf(other);
  return index > 0 ? imageSources(first, IMAGE_PROXY)[index] : first;
}

export function rememberImage(key, src, now = Date.now()) {
  images.set(key, [src, now]);
  memory.save();
}

// <img> mit Gedächtnis: data-img = Schlüssel; startet es mit gemerktem Ersatz, steht in data-first die TCGdex-Adresse,
// damit die Ersatzkette von vorn läuft, falls der Ersatz nicht mehr lädt
export function cardImg(card, size, src, attrs) {
  const first = cardImage(card, size);
  return h("img", { src, ...attrs, crossorigin: "anonymous", "data-img": `${card.id}|${size}`, "data-first": src !== first ? first : null });
}

/**
 * Kartenkachel in drei Arten:
 *   "default" – Bild antippen = Kartenansicht, Haken = in Sammlung ja/nein
 *   "view"    – nur Kartenansicht (z. B. in der Sammlung)
 *   "pick"    – ganze Kachel antippen = auswählen (Listen bearbeiten); Zustand über setPicked()
 */
const tileCards = new WeakMap();

export function cardTile(card, { mode = "default" } = {}) {
  const img = imageFor(card, "low");
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
        img ? cardImg(card, "low", img, { alt: "", loading: "lazy", decoding: "async", draggable: "false" }) : null,
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
