import { h } from "../../core/dom.js";
import { fmtEur, plural } from "../../core/format.js";
import { orderOf, positionBetween } from "../../domain/sorting.js";
import { links } from "../router.js";
import { enableReorder } from "../components/reorder.js";
import { emptyState } from "../components/widgets.js";

// Sortierungen der Listen-Übersicht; p = Fortschritt der Liste
const LIST_SORTS = {
  custom: { label: "Eigene Reihenfolge", compare: (a, b) => orderOf(a.list) - orderOf(b.list) },
  name: { label: "Name", compare: (a, b) => a.list.name.localeCompare(b.list.name, "de") },
  progress: { label: "Fortschritt", compare: (a, b) => share(b.p) - share(a.p) },
  missing: { label: "Fehlt am meisten (€)", compare: (a, b) => b.p.missingValue - a.p.missingValue },
  newest: { label: "Neueste zuerst", compare: (a, b) => b.list.created - a.list.created },
};
const share = (p) => (p.total ? p.have / p.total : 0);

// Ansicht „Listen“: neue Liste anlegen, sortieren, per Gedrückt-halten-und-ziehen umordnen
export function render(main, ctx) {
  const { lists, collection, prices, prefs } = ctx;
  ctx.setTitle("Listen");
  const progressOf = (id) => lists.progress(id, (cardId) => collection.has(cardId), (cardId) => prices.value(cardId));
  const sortKey = LIST_SORTS[prefs.get("listsSort")] ? prefs.get("listsSort") : "custom";
  const entries = lists
    .all()
    .map((list) => ({ list, p: progressOf(list.id) }))
    .sort(LIST_SORTS[sortKey].compare);

  const name = h("input", { type: "text", class: "field", placeholder: "Name der neuen Liste", "aria-label": "Name der neuen Liste", maxlength: 80, enterkeyhint: "done" });
  const form = h("form", { class: "toolbar" }, [name, h("button", { type: "submit", class: "btn" }, "Anlegen")]);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = lists.create(name.value);
    if (id) location.hash = links.list(id);
  });
  main.append(form);
  if (!entries.length) {
    main.append(emptyState("Noch keine Listen.", "Lege eine Liste an, z. B. „Wunschliste“. Karten fügst du dann mit „+ Hinzufügen“ hinzu."));
    return {};
  }

  const sort = h(
    "select",
    { class: "field", "aria-label": "Listen sortieren" },
    Object.entries(LIST_SORTS).map(([k, s]) => h("option", { value: k, selected: k === sortKey }, s.label))
  );
  sort.addEventListener("change", () => {
    prefs.set("listsSort", sort.value);
    ctx.render();
  });
  main.append(
    h("div", { class: "toolbar" }, [sort]),
    h("p", { class: "muted pad" }, sortKey === "custom" ? "Gedrückt halten und ziehen zum Verschieben." : "Zum Verschieben „Eigene Reihenfolge“ wählen.")
  );

  // Zeilen einmal bauen; refresh() aktualisiert nur die Zahlen (sonst würde Ziehen unterbrochen)
  const rows = h("div", { class: "rows" });
  const views = entries.map(({ list }) => {
    const count = h("span", { class: "count" });
    const bar = h("i");
    const text = h("small");
    const row = h("a", { class: "row", href: links.list(list.id), "data-list": list.id }, [
      h("div", { class: "row-head" }, [h("b", {}, list.name), count]),
      h("div", { class: "progress", "aria-hidden": "true" }, [bar]),
      text,
    ]);
    rows.append(row);
    return { id: list.id, count, bar, text };
  });
  main.append(rows);

  const refresh = () => {
    for (const v of views) {
      const p = progressOf(v.id);
      v.count.textContent = `${p.have}/${p.total}`;
      v.bar.style.width = `${p.total ? (p.have / p.total) * 100 : 0}%`;
      v.text.textContent = progressText(p);
    }
  };

  const dispose =
    sortKey === "custom"
      ? enableReorder(rows, {
          itemSelector: ".row",
          onDrop: (el, prev, next) => {
            const pos = (row) => (row ? orderOf(lists.get(row.dataset.list)) : null);
            const position = positionBetween(pos(prev), pos(next));
            if (position == null) lists.renumberLists([...rows.querySelectorAll(".row")].map((r) => r.dataset.list));
            else lists.moveList(el.dataset.list, position);
          },
        })
      : null;

  prices.request(lists.allItems().map((i) => i.card.id));
  return { refresh, dispose };
}

function progressText(p) {
  if (!p.total) return "leer";
  if (!p.missing) return "komplett ✓";
  if (!p.missingKnown) return `${plural(p.missing, "Karte fehlt", "Karten fehlen")}`;
  return `fehlt noch ca. ${fmtEur(p.missingValue)}${p.missingKnown < p.missing ? " + ?" : ""}`;
}
