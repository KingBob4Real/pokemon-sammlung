import { h } from "../../core/dom.js";
import { fmtEur, fmtSigned, norm, plural } from "../../core/format.js";
import { cardTile } from "../components/cardTile.js";
import { emptyState, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["newest", "value", "name", "set"];

// Ansicht „Sammlung“: Kennzahlen, Filter, Sortierung, alle Karten mit Anzahl > 0
export function render(main, ctx) {
  const { collection, prices, sorters, prefs, session } = ctx;
  ctx.setTitle("Sammlung");
  const sort = sorters[prefs.get("collectionSort")] || sorters.newest;
  const entries = collection.entries().sort(sort.compare);
  const stats = h("div", { class: "stats" });
  main.append(stats);

  const refresh = () => {
    const s = collection.summary((id) => prices.value(id));
    stats.replaceChildren(
      stat("Karten", String(s.count), `${s.distinct} verschiedene`),
      stat("Marktwert", fmtEur(s.worth), s.unknown ? `${s.unknown} ohne Preis` : "Cardmarket-Trend"),
      stat("Bezahlt", s.paid ? fmtEur(s.paid) : "–", "deine Kaufpreise"),
      stat("Gewinn/Verlust", s.diffCount ? fmtSigned(s.diff) : "–", s.diffCount ? `bei ${plural(s.diffCount, "Karte", "Karten")} mit Kaufpreis` : "Kaufpreise eintragen")
    );
  };

  if (!entries.length) {
    main.append(emptyState("Noch keine Karten in der Sammlung.", "Über „Suche“ findest du alle deutschen Karten. Karte antippen und die Anzahl erhöhen."));
    return { refresh };
  }

  const filter = h("input", { type: "search", class: "field", placeholder: "In der Sammlung suchen …", "aria-label": "In der Sammlung suchen", autocomplete: "off", enterkeyhint: "search", value: session.collectionFilter });
  const grid = h("div", { class: "grid" }, entries.map((e) => cardTile(e.card, { checkable: false })));
  const onSort = (key) => {
    prefs.set("collectionSort", key);
    ctx.render();
  };
  main.append(h("div", { class: "toolbar" }, [filter, sortSelect(sorters, SORT_KEYS, prefs.get("collectionSort"), onSort)]), grid);

  const applyFilter = () => {
    session.collectionFilter = filter.value;
    const terms = norm(filter.value).split(/\s+/).filter(Boolean);
    entries.forEach((e, i) => {
      const text = norm(`${e.card.name} ${e.card.num} ${e.card.setName}`);
      grid.children[i].hidden = !terms.every((t) => text.includes(t));
    });
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  prices.request(entries.map((e) => e.card.id));
  return { refresh };
}
