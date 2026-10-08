import { h } from "../../core/dom.js";
import { fmtEur, fmtSigned, norm, plural } from "../../core/format.js";
import { orderOf, positionBetween } from "../../domain/sorting.js";
import { COLLECTION_TARGET, links } from "../router.js";
import { cardTile, tileCard } from "../components/cardTile.js";
import { enableReorder } from "../components/reorder.js";
import { scanButton } from "../components/scanSheet.js";
import { useSelection } from "../components/selection.js";
import { emptyState, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["newest", "order", "set", "pokedex", "value", "name"];
const GROUPS = [
  ["none", "Ohne Gruppen"],
  ["section", "Nach Abteilung"],
  ["set", "Nach Set"],
  ["list", "Nach Liste"],
];

// Ansicht „Sammlung“: Kennzahlen, Karten hinzufügen, filtern, sortieren (auch eigene Reihenfolge per Ziehen),
// gruppieren nach eigenen Abteilungen, Set oder Liste. „Auswählen“ markiert mehrere Karten zum Einsortieren
// (Abteilung, Liste) oder Entfernen.
export function render(main, ctx) {
  const { collection, lists, prices, sets, sorters, prefs, session } = ctx;
  const selection = useSelection(ctx, COLLECTION_TARGET);
  ctx.setTitle("Sammlung");
  const sort = sorters[prefs.get("collectionSort")] || sorters.newest;
  const entries = collection.entries().sort(sort.compare);
  const stats = h("div", { class: "stats" });
  const scan = scanButton(ctx);
  main.append(stats, h("div", { class: "buttons" }, [h("a", { class: "btn", href: links.addTo(COLLECTION_TARGET) }, "+ Karten hinzufügen"), scan.button]), scan.note);

  // Pokédex-Sortierung braucht die Kartendetails – sind sie nachgeladen, einmal neu sortieren
  let waitingForDex = prefs.get("collectionSort") === "pokedex" && entries.some((e) => !prices.get(e.card.id));
  const refresh = () => {
    scan.refresh();
    if (waitingForDex && entries.every((e) => prices.get(e.card.id))) {
      waitingForDex = false;
      return ctx.render();
    }
    const s = collection.summary((id) => prices.value(id));
    stats.replaceChildren(
      stat("Karten", String(s.count), `${s.distinct} verschiedene`),
      stat("Marktwert", fmtEur(s.worth), s.unknown ? `${s.unknown} ohne Preis` : "Cardmarket-Trend"),
      stat("Bezahlt", s.paid ? fmtEur(s.paid) : "–", "deine Kaufpreise"),
      stat("Gewinn/Verlust", s.diffCount ? fmtSigned(s.diff) : "–", s.diffCount ? `bei ${plural(s.diffCount, "Karte", "Karten")} mit Kaufpreis` : "Kaufpreise eintragen")
    );
  };

  if (!entries.length) {
    main.append(emptyState("Noch keine Karten in der Sammlung.", "Tippe auf „+ Karten hinzufügen“, such deine Karten oder öffne ein Set und tippe sie an."));
    return { refresh };
  }

  const setPref = (name) => (value) => {
    prefs.set(name, value);
    ctx.render();
  };
  const groupSelect = h(
    "select",
    { class: "field", "aria-label": "Gruppieren" },
    GROUPS.map(([k, label]) => h("option", { value: k, selected: k === prefs.get("collectionGroup") }, label))
  );
  groupSelect.addEventListener("change", () => setPref("collectionGroup")(groupSelect.value));
  const filter = h("input", { type: "search", class: "field", placeholder: "In der Sammlung suchen …", "aria-label": "In der Sammlung suchen", autocomplete: "off", enterkeyhint: "search", value: session.collectionFilter });
  const sortKey = sorters[prefs.get("collectionSort")] ? prefs.get("collectionSort") : "newest";
  const group = prefs.get("collectionGroup");
  const canReorder = sortKey === "order" && !selection.active;
  main.append(
    h("div", { class: "toolbar tight-row" }, [filter, selection.toggle()]),
    h("div", { class: "toolbar pair" }, [sortSelect(sorters, SORT_KEYS, sortKey, setPref("collectionSort")), groupSelect])
  );
  const newSection = () => {
    if (collection.createSection(prompt("Name der neuen Abteilung, z. B. „Ordner 1“:") || "")) ctx.render();
  };
  if (group === "section") main.append(h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: newSection }, "+ Neue Abteilung")]));
  if (canReorder) main.append(h("p", { class: "muted pad" }, "Karte gedrückt halten und ziehen zum Verschieben."));

  // Abschnitte bauen: [{ title, hint, entries, section? }]
  const sections = groupEntries(entries, group, { sets, lists, sections: collection.sections(), valueOf: (id) => prices.value(id) });
  const blocks = sections.map((sec) => {
    const grid = h(
      "div",
      { class: "grid" },
      sec.entries.map((e) => selection.mark(cardTile(e.card, { mode: selection.active ? "pick" : "view" }), e.card))
    );
    const head = sec.title ? h("h2", { class: "group-title" }, [h("span", {}, sec.title), h("small", {}, sec.hint), sec.section ? sectionMenu(ctx, sec.section) : null]) : null;
    main.append(...[head, grid].filter(Boolean));
    if (sec.section && !sec.entries.length) main.append(h("p", { class: "muted pad" }, "Noch leer – „Auswählen“, Karten antippen, „Einsortieren …“."));
    return { head, grid, entries: sec.entries };
  });

  // Eigene Reihenfolge: in jedem Abschnitt gedrückt halten und ziehen
  const drops = canReorder
    ? blocks.map(({ grid }) =>
        enableReorder(grid, {
          itemSelector: ".tile",
          onDrop: (el, prev, next) => {
            const at = (tile) => (tile ? orderOf(collection.entry(tileCard(tile).id)) : null);
            const position = positionBetween(at(prev), at(next));
            if (position == null) collection.renumber([...grid.querySelectorAll(".tile")].map((t) => tileCard(t).id));
            else collection.move(tileCard(el).id, position);
          },
        })
      )
    : [];
  const dispose = () => drops.forEach((stop) => stop());

  const applyFilter = () => {
    session.collectionFilter = filter.value;
    const terms = norm(filter.value).split(/\s+/).filter(Boolean);
    for (const b of blocks) {
      let any = false;
      b.entries.forEach((e, i) => {
        const show = terms.every((t) => norm(`${e.card.name} ${e.card.num} ${e.card.setName}`).includes(t));
        b.grid.children[i].hidden = !show;
        any ||= show;
      });
      if (b.head) b.head.hidden = terms.length > 0 && !any; // leere Abteilungen ohne Suche trotzdem zeigen
    }
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  prices.request(entries.map((e) => e.card.id));
  if (!selection.active) return { refresh, dispose };

  // Auswahl: „Einsortieren …“ (Abteilung oder Liste) und „Entfernen“ (mit „Rückgängig“)
  const remove = (chosen, stop) => {
    const cards = chosen();
    if (!cards.length) return;
    const undo = collection.removeAll(cards);
    stop();
    ctx.notify(`${plural(cards.length, "Karte", "Karten")} aus der Sammlung entfernt.`, {
      type: "success",
      force: true,
      duration: 8000,
      action: { label: "Rückgängig", run: () => (undo(), ctx.render()) },
    });
  };
  const inSection = (id, name) => (cards) => (collection.setSection(cards, id), { message: id ? `in „${name}“` : "ohne Abteilung" });
  const createAndPut = (cards) => {
    const name = prompt("Name der neuen Abteilung, z. B. „Ordner 1“:") || "";
    const id = collection.createSection(name);
    return id ? inSection(id, name.trim())(cards) : null;
  };
  const onPick = selection.bar(main, {
    except: COLLECTION_TARGET,
    menu: "Einsortieren …",
    groups: [
      {
        label: "Abteilung",
        items: [...collection.sections().map((s) => [`In „${s.name}“`, inSection(s.id, s.name)]), ["Neue Abteilung …", createAndPut], ["Aus der Abteilung nehmen", inSection(null)]],
      },
    ],
    buttons: (chosen, stop) => [h("button", { type: "button", class: "btn danger", onclick: () => remove(chosen, stop) }, "Entfernen")],
  });
  return { refresh, onPick };
}

// Kopf einer Abteilung: kleines Menü „⋯“ mit Umbenennen und Löschen
function sectionMenu(ctx, section) {
  const { collection } = ctx;
  const select = h("select", { class: "section-menu", "aria-label": `Abteilung „${section.name}“ bearbeiten` }, [
    h("option", { value: "" }, "⋯"),
    h("option", { value: "rename" }, "Umbenennen"),
    h("option", { value: "remove" }, "Löschen"),
  ]);
  select.addEventListener("change", () => {
    const action = select.value;
    select.value = "";
    if (action === "rename") {
      const name = prompt("Neuer Name der Abteilung:", section.name);
      if (name && name.trim()) collection.renameSection(section.id, name);
    }
    if (action === "remove" && confirm(`Abteilung „${section.name}“ löschen? Die Karten bleiben in der Sammlung, nur ohne Abteilung.`)) collection.removeSection(section.id);
    if (action) ctx.render();
  });
  return select;
}

function groupEntries(entries, group, { sets, lists, sections, valueOf }) {
  const hint = (list) => {
    const count = list.reduce((n, e) => n + e.qty, 0);
    const worth = list.reduce((sum, e) => sum + (valueOf(e.card.id) ?? 0) * e.qty, 0);
    return `${plural(count, "Karte", "Karten")}${worth ? ` · ${fmtEur(worth)}` : ""}`;
  };
  if (group === "set") {
    const bySet = new Map();
    for (const e of entries) {
      if (!bySet.has(e.card.set)) bySet.set(e.card.set, []);
      bySet.get(e.card.set).push(e);
    }
    return [...bySet.entries()]
      .sort(([a], [b]) => sets.order(b) - sets.order(a)) // neueste Sets zuerst
      .map(([, list]) => ({ title: list[0].card.setName, hint: hint(list), entries: list }));
  }
  if (group === "section") {
    // Alle Abteilungen (auch leere), dann was in keiner liegt
    const known = new Set(sections.map((s) => s.id));
    const out = sections.map((s) => {
      const own = entries.filter((e) => e.section === s.id);
      return { title: s.name, hint: own.length ? hint(own) : "leer", entries: own, section: s };
    });
    const rest = entries.filter((e) => !known.has(e.section));
    if (rest.length) out.push({ title: "Ohne Abteilung", hint: hint(rest), entries: rest });
    return out;
  }
  if (group === "list") {
    const sections = [];
    const inAnyList = new Set();
    for (const list of lists.all()) {
      const ids = new Set(lists.items(list.id).map((i) => i.card.id));
      const own = entries.filter((e) => ids.has(e.card.id));
      own.forEach((e) => inAnyList.add(e.card.id));
      if (own.length) sections.push({ title: list.name, hint: hint(own), entries: own });
    }
    const rest = entries.filter((e) => !inAnyList.has(e.card.id));
    if (rest.length) sections.push({ title: "In keiner Liste", hint: hint(rest), entries: rest });
    return sections;
  }
  return [{ title: null, hint: "", entries }];
}
