import { h } from "../../core/dom.js";
import { fmtEur, plural } from "../../core/format.js";
import { links } from "../router.js";
import { emptyState } from "../components/widgets.js";

// Ansicht „Listen“: neue Liste anlegen, alle Listen mit Fortschritt und was noch fehlt
export function render(main, ctx) {
  const { lists, collection, prices } = ctx;
  ctx.setTitle("Listen");
  const all = lists.all();

  const name = h("input", { type: "text", class: "field", placeholder: "Name der neuen Liste", "aria-label": "Name der neuen Liste", maxlength: 80, enterkeyhint: "done" });
  const form = h("form", { class: "toolbar" }, [name, h("button", { type: "submit", class: "btn" }, "Anlegen")]);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = lists.create(name.value);
    if (id) location.hash = links.list(id);
  });

  const rows = h("div", { class: "rows" });
  const refresh = () =>
    rows.replaceChildren(
      ...all.map((list) => {
        const p = lists.progress(list.id, (id) => collection.has(id), (id) => prices.value(id));
        return h("a", { class: "row", href: links.list(list.id) }, [
          h("div", { class: "row-head" }, [h("b", {}, list.name), h("span", { class: "count" }, `${p.have}/${p.total}`)]),
          h("div", { class: "progress", "aria-hidden": "true" }, [h("i", { style: `width:${p.total ? (p.have / p.total) * 100 : 0}%` })]),
          h("small", {}, progressText(p)),
        ]);
      })
    );

  main.append(form, all.length ? rows : emptyState("Noch keine Listen.", "Lege eine Liste an, z. B. „Wunschliste“. Karten fügst du in der Kartenansicht unter „Listen“ hinzu."));
  prices.request(lists.allItems().map((i) => i.card.id));
  return { refresh };
}

function progressText(p) {
  if (!p.total) return "leer";
  if (!p.missing) return "komplett ✓";
  if (!p.missingKnown) return `${plural(p.missing, "Karte fehlt", "Karten fehlen")}`;
  return `fehlt noch ca. ${fmtEur(p.missingValue)}${p.missingKnown < p.missing ? " + ?" : ""}`;
}
