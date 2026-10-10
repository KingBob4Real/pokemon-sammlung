import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { progressBar, trackFirstImages } from "./progressBar.js";
import { note, segmented, sortSelect } from "./widgets.js";

const SORT_KEYS = ["numUp", "numDown", "valueUp", "valueDown"];
const FILTERS = [
  ["all", "Alle"],
  ["missing", "Fehlend"],
  ["owned", "Vorhanden"],
];
const FILTER_DELAY_MS = 700; // abgehakte Karte erst kurz zeigen, dann ausblenden (wie in Listen)

/**
 * Alle Karten eines Sets, darüber wie viele davon in der Sammlung sind, sortiert nach Nummer oder Wert.
 * Wird von der Set-Ansicht und „Karten zur Liste hinzufügen“ benutzt.
 *   tile    – card → Kachel-Element
 *   onLoad  – optional, bekommt den Set-Namen
 *   filter  – Filter Alle · Fehlend · Vorhanden anbieten (Set-Ansicht)
 * → { element, refresh, missing() – fehlende Karten oder null, solange das Set lädt }
 */
export function setCardsPanel(ctx, setId, { tile, onLoad, filter = false }) {
  const { catalog, collection, prices, prefs, sets, setSorters } = ctx;
  const info = note("Karten werden geladen …");
  const grid = h("div", { class: "grid" });
  const bar = progressBar();
  let cards = [];
  let loaded = false;
  let tiles = new Map(); // Karten-ID → Kachel; beim Umsortieren nur verschoben, nicht neu gebaut
  let sortKey = setSorters[prefs.get("setSort")] ? prefs.get("setSort") : "numUp";
  let shown = filter && FILTERS.some(([k]) => k === prefs.get("setFilter")) ? prefs.get("setFilter") : "all";
  let filterTimer = null;
  let waitingForPrices = false;
  const retryBox = h("div", { class: "buttons center", hidden: true }, [h("button", { type: "button", class: "btn", onclick: () => load() }, "Nochmal versuchen")]);

  const pricesMissing = () => cards.some((c) => !prices.get(c.id) && !prices.hasFailed(c.id));
  const applyFilter = () => {
    for (const [id, el] of tiles) el.hidden = shown !== "all" && (shown === "owned") !== collection.has(id);
  };
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
  // Filter wie in Listen; nur die Knöpfe neu zeichnen, das Raster bleibt (sonst lädt das Set neu und die Seite springt)
  const tools = h("div", { class: filter ? "toolbar split" : "toolbar" });
  const drawTools = () =>
    tools.replaceChildren(
      ...(filter
        ? [
            segmented(FILTERS, shown, (key) => {
              shown = key;
              prefs.set("setFilter", key);
              drawTools();
              applyFilter();
            }, "Karten anzeigen"),
          ]
        : []),
      sort
    );
  drawTools();

  const load = () => {
    retryBox.hidden = true;
    info.textContent = "Karten werden geladen …";
    bar.busy();
    catalog
      .setCards(setId)
      .then((set) => {
        if (!grid.isConnected) return; // inzwischen weg navigiert
        cards = set.cards;
        loaded = true;
        tiles = new Map(cards.map((c) => [c.id, tile(c)]));
        onLoad?.(set.name);
        arrange();
        applyFilter();
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
    // gleiche Quelle wie „Meine Sets“ in der Suche: Sammlung nach Set gezählt, Kartenzahl aus der Set-Liste
    if (loaded) info.textContent = `${collection.countBySet().get(setId) ?? 0} von ${sets.info(setId)?.total || cards.length} Karten in deiner Sammlung`;
    if (waitingForPrices && !pricesMissing()) {
      waitingForPrices = false;
      order(); // ohne neue Anfrage – sonst kämen Karten, deren Preis nicht lädt, endlos wieder dran
    }
    if (shown !== "all") {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(applyFilter, FILTER_DELAY_MS);
    }
  };
  const missing = () => (loaded ? cards.filter((c) => !collection.has(c.id)) : null);
  return { element: h("div", {}, [bar.el, info, tools, retryBox, grid]), refresh, missing };
}
