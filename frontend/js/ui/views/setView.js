import { h } from "../../core/dom.js";
import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { backLink, note } from "../components/widgets.js";

// Ansicht eines Sets: alle Karten, wie viele davon in der Sammlung sind
export function render(main, ctx, setId) {
  const { catalog, sets, collection } = ctx;
  ctx.setTitle(sets.info(setId)?.name || "Set");
  const info = note("Karten werden geladen …");
  const grid = h("div", { class: "grid" });
  main.append(h("div", { class: "list-head" }, [backLink(links.search, "Suche")]), info, grid);

  let cards = [];
  catalog
    .setCards(setId)
    .then((set) => {
      if (!grid.isConnected) return; // inzwischen weg navigiert
      cards = set.cards;
      ctx.setTitle(set.name);
      grid.append(...cards.map((card) => cardTile(card)));
      ctx.refresh();
    })
    .catch(() => {
      if (info.isConnected) info.textContent = navigator.onLine ? "Das Set konnte nicht geladen werden." : "Offline: Sets brauchen Internet.";
    });

  const refresh = () => {
    if (cards.length) info.textContent = `${cards.filter((c) => collection.has(c.id)).length} von ${cards.length} Karten in deiner Sammlung`;
  };
  return { refresh };
}
