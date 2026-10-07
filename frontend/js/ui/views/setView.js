import { h } from "../../core/dom.js";
import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { setCardsPanel } from "../components/setCardsPanel.js";
import { backLink } from "../components/widgets.js";

// Ansicht eines Sets: alle Karten, wie viele davon in der Sammlung sind
export function render(main, ctx, setId) {
  ctx.setTitle(ctx.sets.info(setId)?.name || "Set");
  const panel = setCardsPanel(ctx, setId, { tile: (card) => cardTile(card), onLoad: (name) => ctx.setTitle(name) });
  main.append(h("div", { class: "list-head" }, [backLink(links.search, "Suche")]), panel.element);
  return { refresh: panel.refresh };
}
