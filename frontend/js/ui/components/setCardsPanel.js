import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { progressBar, trackFirstImages } from "./progressBar.js";
import { note, sortSelect } from "./widgets.js";

const SORT_KEYS = ["numUp", "numDown", "valueUp", "valueDown"];

/**
 * Alle Karten eines Sets, darüber wie viele davon in der Sammlung sind, sortiert nach Nummer oder Wert.
 * Wird von der Set-Ansicht und „Karten zur Liste hinzufügen“ benutzt.
 *   tile    – card → Kachel-Element
 *   onLoad  – optional, bekommt den Set-Namen
 * → { element, refresh }
 */
export function setCardsPanel(ctx, setId, { tile, onLoad }) {
  const { catalog, collection, prices, prefs, setSorters } = ctx;
  const info = note("Karten werden geladen …");
  const grid = h("div", { class: "grid" });
  const bar = progressBar();
  let cards = [];
  let tiles = new Map(); // Karten-ID → Kachel; beim Umsortieren nur verschoben, nicht neu gebaut
  let sortKey = setSorters[prefs.get("setSort")] ? prefs.get("setSort") : "numUp";
  let waitingForPrices = false;
  const retryBox = h("div", { class: "buttons center", hidden: true }, [h("button", { type: "button", class: "btn", onclick: () => load() }, "Nochmal versuchen")]);

  const pricesMissing = () => cards.some((c) => !prices.get(c.id) && !prices.hasFailed(c.id));
  // Nach Wert: Preise aller Karten laden und einmal neu sortieren, sobald sie da sind (nicht bei jedem Zwischenstand)
  const order = () => grid.replaceChildren(...cards.map((card, i) => ({ card, i })).sort(setSorters[sortKey].compare).map(({ card }) => tiles.get(card.id)));
  const arrange = () => {
    if (sortKey.startsWith("value")) {
      prices.request(cards.map((c) => c.id));
      waitingForPrices = pricesMissing();
    }
    order();
  };
  const sort = sortSelect(setSorters, SORT_KEYS, sortKey, (key) => {
    sortKey = key;
    prefs.set("setSort", key);
    arrange();
  });

  const load = () => {
    retryBox.hidden = true;
    info.textContent = "Karten werden geladen …";
    bar.busy();
    catalog
      .setCards(setId)
      .then((set) => {
        if (!grid.isConnected) return; // inzwischen weg navigiert
        cards = set.cards;
        tiles = new Map(cards.map((c) => [c.id, tile(c)]));
        onLoad?.(set.name);
        arrange();
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
    if (waitingForPrices && !pricesMissing()) {
      waitingForPrices = false;
      order(); // ohne neue Anfrage – sonst kämen Karten, deren Preis nicht lädt, endlos wieder dran
    }
  };
  return { element: h("div", {}, [bar.el, info, h("div", { class: "toolbar" }, [sort]), retryBox, grid]), refresh };
}
