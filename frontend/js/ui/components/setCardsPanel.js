import { h } from "../../core/dom.js";
import { note } from "./widgets.js";

/**
 * Alle Karten eines Sets, darüber wie viele davon in der Sammlung sind.
 * Wird von der Set-Ansicht und „Karten zur Liste hinzufügen“ benutzt.
 *   tile    – card → Kachel-Element
 *   onLoad  – optional, bekommt den Set-Namen
 * → { element, refresh }
 */
export function setCardsPanel(ctx, setId, { tile, onLoad }) {
  const { catalog, collection } = ctx;
  const info = note("Karten werden geladen …");
  const grid = h("div", { class: "grid" });
  let cards = [];

  catalog
    .setCards(setId)
    .then((set) => {
      if (!grid.isConnected) return; // inzwischen weg navigiert
      cards = set.cards;
      onLoad?.(set.name);
      grid.append(...cards.map(tile));
      ctx.refresh();
    })
    .catch(() => {
      if (info.isConnected) info.textContent = navigator.onLine ? "Das Set konnte nicht geladen werden." : "Offline: Sets brauchen Internet.";
    });

  const refresh = () => {
    if (cards.length) info.textContent = `${cards.filter((c) => collection.has(c.id)).length} von ${cards.length} Karten in deiner Sammlung`;
  };
  return { element: h("div", {}, [info, grid]), refresh };
}
