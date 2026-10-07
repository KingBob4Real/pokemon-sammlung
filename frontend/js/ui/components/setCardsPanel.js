import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { progressBar, trackFirstImages } from "./progressBar.js";
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
  const bar = progressBar();
  let cards = [];
  const retryBox = h("div", { class: "buttons center", hidden: true }, [h("button", { type: "button", class: "btn", onclick: () => load() }, "Nochmal versuchen")]);

  const load = () => {
    retryBox.hidden = true;
    info.textContent = "Karten werden geladen …";
    bar.busy();
    catalog
      .setCards(setId)
      .then((set) => {
        if (!grid.isConnected) return; // inzwischen weg navigiert
        cards = set.cards;
        onLoad?.(set.name);
        grid.replaceChildren(...cards.map(tile));
        ctx.refresh();
        trackFirstImages(grid, bar);
      })
      .catch((e) => {
        bar.done();
        if (!info.isConnected) return;
        const { kind, message } = describeError(e);
        info.textContent = kind === "offline" ? "Du bist offline – Sets brauchen Internet." : `Das Set konnte nicht geladen werden. ${message}`;
        retryBox.hidden = false;
      });
  };
  load();

  const refresh = () => {
    if (cards.length) info.textContent = `${cards.filter((c) => collection.has(c.id)).length} von ${cards.length} Karten in deiner Sammlung`;
  };
  return { element: h("div", {}, [bar.el, info, retryBox, grid]), refresh };
}
