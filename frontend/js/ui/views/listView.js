import { h } from "../../core/dom.js";
import { fmtEur, plural } from "../../core/format.js";
import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { backLink, emptyState, segmented, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["order", "set", "name", "value"];
const FILTERS = [
  ["all", "Alle"],
  ["missing", "Fehlend"],
  ["owned", "Vorhanden"],
];

// Ansicht einer Liste: umbenennen, löschen, Fortschritt, filtern, sortieren, Karten abhaken
export function render(main, ctx, listId) {
  const { lists, collection, prices, sorters, prefs } = ctx;
  const list = lists.get(listId);
  if (!list) {
    ctx.setTitle("Liste");
    main.append(emptyState("Diese Liste gibt es nicht mehr."), h("a", { class: "btn", href: links.lists }, "Zu den Listen"));
    return {};
  }
  ctx.setTitle(list.name);

  const filter = prefs.get("listFilter");
  const items = lists.items(listId).sort((sorters[prefs.get("listSort")] || sorters.order).compare);
  const shown = items.filter((i) => filter === "all" || (filter === "owned") === collection.has(i.card.id));

  const rename = () => {
    const name = prompt("Neuer Name der Liste:", list.name);
    if (!name || !name.trim()) return;
    lists.rename(listId, name);
    ctx.render();
  };
  const remove = () => {
    if (!confirm(`Liste „${list.name}“ löschen? Die Karten bleiben in deiner Sammlung.`)) return;
    lists.remove(listId);
    location.hash = links.lists;
  };
  const setPref = (name) => (value) => {
    prefs.set(name, value);
    ctx.render();
  };

  const stats = h("div", { class: "stats" });
  const refresh = () => {
    const p = lists.progress(listId, (id) => collection.has(id), (id) => prices.value(id));
    stats.replaceChildren(
      stat("Fortschritt", `${p.have}/${p.total}`, p.total ? `${Math.round((p.have / p.total) * 100)} %` : "leer"),
      stat(
        "Fehlt noch ca.",
        p.missingKnown ? fmtEur(p.missingValue) : "–",
        p.missing ? `${plural(p.missing, "Karte", "Karten")}${p.missingKnown < p.missing ? `, ${p.missing - p.missingKnown} ohne Preis` : ""}` : "komplett ✓"
      )
    );
  };

  main.append(
    h("div", { class: "list-head" }, [
      backLink(links.lists, "Listen"),
      h("div", { class: "actions" }, [
        h("button", { type: "button", class: "btn btn-ghost", onclick: rename }, "Umbenennen"),
        h("button", { type: "button", class: "btn btn-ghost danger", onclick: remove }, "Löschen"),
      ]),
    ]),
    stats,
    h("div", { class: "toolbar" }, [segmented(FILTERS, filter, setPref("listFilter"), "Karten anzeigen"), sortSelect(sorters, SORT_KEYS, prefs.get("listSort"), setPref("listSort"))]),
    h("div", { class: "grid" }, shown.map((i) => cardTile(i.card)))
  );
  if (!items.length) main.append(emptyState("Noch keine Karten in dieser Liste.", "Über „Suche“ eine Karte antippen und unten bei „Listen“ diese Liste anhaken."));
  else if (!shown.length) main.append(emptyState(filter === "missing" ? "Alles gesammelt! 🎉" : "Noch keine Karte aus dieser Liste in der Sammlung."));
  prices.request(items.map((i) => i.card.id));
  return { refresh };
}
