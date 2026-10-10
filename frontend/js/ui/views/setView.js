import { h } from "../../core/dom.js";
import { plural } from "../../core/format.js";
import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { setCardsPanel } from "../components/setCardsPanel.js";
import { backLink } from "../components/widgets.js";

// Ansicht eines Sets: alle Karten, wie viele davon in der Sammlung sind, Filter Alle · Fehlend · Vorhanden,
// „Fehlende als Liste“ legt eine Liste mit dem Set-Namen an (oder ergänzt die vorhandene) und öffnet sie
export function render(main, ctx, setId) {
  let name = ctx.sets.info(setId)?.name || "Set";
  ctx.setTitle(name);
  const panel = setCardsPanel(ctx, setId, { tile: (card) => cardTile(card), filter: true, onLoad: (n) => ctx.setTitle((name = n)) });
  const toList = () => {
    const missing = panel.missing();
    if (!missing) return ctx.notify("Das Set lädt noch – gleich nochmal.", { type: "info" });
    if (!missing.length) return ctx.notify("Dir fehlt keine Karte aus diesem Set. 🎉", { type: "success" });
    const { id, added } = ctx.lists.fill(name, missing);
    location.hash = links.list(id);
    ctx.notify(added ? `${plural(added, "fehlende Karte", "fehlende Karten")} in „${name}“.` : `Alle fehlenden Karten stehen schon in „${name}“.`, { type: "success" });
  };
  main.append(
    h("div", { class: "list-head" }, [backLink(links.search, "Suche"), h("button", { type: "button", class: "btn btn-ghost", onclick: toList }, "Fehlende als Liste anlegen")]),
    panel.element
  );
  return { refresh: panel.refresh };
}
