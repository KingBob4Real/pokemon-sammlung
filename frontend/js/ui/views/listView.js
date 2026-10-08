import { h } from "../../core/dom.js";
import { fmtEur, plural } from "../../core/format.js";
import { orderOf, positionBetween } from "../../domain/sorting.js";
import { links } from "../router.js";
import { cardTile, tileCard } from "../components/cardTile.js";
import { enableReorder } from "../components/reorder.js";
import { useSelection } from "../components/selection.js";
import { backLink, emptyState, segmented, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["order", "pokedex", "set", "name", "value"];
const FILTERS = [
  ["all", "Alle"],
  ["missing", "Fehlend"],
  ["owned", "Vorhanden"],
];

/**
 * Ansicht einer Liste: Fortschritt, filtern, sortieren, Karten abhaken (= in die Sammlung).
 * „Karten hinzufügen“ öffnet Suche/Sets zum Antippen, „Auswählen“ markiert mehrere Karten
 * für „Hinzufügen …“ (Sammlung, andere Liste) oder „Entfernen“ (aus dieser Liste).
 */
export function render(main, ctx, listId) {
  const { lists, collection, prices, sorters, prefs } = ctx;
  const list = lists.get(listId);
  if (!list) {
    ctx.setTitle("Liste");
    main.append(emptyState("Diese Liste gibt es nicht mehr."), h("a", { class: "btn", href: links.lists }, "Zu den Listen"));
    return {};
  }
  ctx.setTitle(list.name);

  const selection = useSelection(ctx, `liste:${listId}`);
  const selecting = selection.active;
  const filter = prefs.get("listFilter");
  const sortKey = sorters[prefs.get("listSort")] ? prefs.get("listSort") : "order";
  const items = lists.items(listId).sort(sorters[sortKey].compare);
  // Verschieben nur, wenn man die eigene Reihenfolge vollständig sieht
  const canReorder = sortKey === "order" && filter === "all" && !selecting && items.length > 1;
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
  const grid = h(
    "div",
    { class: "grid checklist" },
    shown.map((i) => selection.mark(cardTile(i.card, { mode: selecting ? "pick" : "default" }), i.card))
  );
  // Pokédex-Sortierung braucht die Kartendetails – sind sie nachgeladen, einmal neu sortieren
  let waitingForDex = sortKey === "pokedex" && items.some((i) => !prices.get(i.card.id));
  const refresh = () => {
    if (waitingForDex && items.every((i) => prices.get(i.card.id))) {
      waitingForDex = false;
      return ctx.render();
    }
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
    h("div", { class: "buttons" }, [
      h("a", { class: "btn", href: links.addTo(listId) }, "+ Hinzufügen"),
      items.length ? selection.toggle() : null,
    ]),
    h("div", { class: "toolbar split" }, [segmented(FILTERS, filter, setPref("listFilter"), "Karten anzeigen"), sortSelect(sorters, SORT_KEYS, sortKey, setPref("listSort"))]),
    items.length > 1 && !selecting
      ? h("p", { class: "muted pad" }, canReorder ? "Karte gedrückt halten und ziehen zum Verschieben." : "Zum Verschieben „Eigene Reihenfolge“ und „Alle“ wählen.")
      : "", // nicht null: main.append() würde „null“ als Text zeigen
    grid
  );
  if (!items.length) main.append(emptyState("Noch keine Karten in dieser Liste.", "Tippe auf „+ Hinzufügen“ und dann einfach auf die Karten, die rein sollen."));
  else if (!shown.length) main.append(emptyState(filter === "missing" ? "Alles gesammelt! 🎉" : "Noch keine Karte aus dieser Liste in der Sammlung."));

  // Auswahl: „Hinzufügen …“ (Sammlung, andere Liste) und „Entfernen“ aus dieser Liste
  const onPick = selecting
    ? selection.bar(main, {
        except: listId,
        buttons: (chosen, stop) => [h("button", { type: "button", class: "btn danger", onclick: () => (lists.removeCards(listId, chosen()), stop()) }, "Entfernen")],
      })
    : undefined;
  const dispose = canReorder
    ? enableReorder(grid, {
        itemSelector: ".tile",
        onDrop: (el, prev, next) => {
          const item = (tile) => tile && lists.items(listId).find((i) => i.card.id === tileCard(tile).id);
          const position = positionBetween(prev ? orderOf(item(prev)) : null, next ? orderOf(item(next)) : null);
          if (position == null) lists.renumberItems(listId, [...grid.querySelectorAll(".tile")].map((t) => tileCard(t).id));
          else lists.moveItem(listId, tileCard(el).id, position);
        },
      })
    : null;
  prices.request(items.map((i) => i.card.id));
  return { refresh, onPick, dispose };
}
