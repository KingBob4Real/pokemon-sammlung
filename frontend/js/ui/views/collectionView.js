import { h } from "../../core/dom.js";
import { fmtEur, fmtSigned, norm, plural } from "../../core/format.js";
import { COLLECTION_TARGET, links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { emptyState, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["newest", "pokedex", "value", "name", "set"];
const GROUPS = [
  ["none", "Ohne Gruppen"],
  ["set", "Nach Set"],
  ["list", "Nach Liste"],
];

// Ansicht „Sammlung“: Kennzahlen, Karten hinzufügen, filtern, sortieren, nach Set oder Liste gruppieren
export function render(main, ctx) {
  const { collection, lists, prices, sets, sorters, prefs, session } = ctx;
  ctx.setTitle("Sammlung");
  const sort = sorters[prefs.get("collectionSort")] || sorters.newest;
  const entries = collection.entries().sort(sort.compare);
  const stats = h("div", { class: "stats" });
  main.append(stats, h("div", { class: "buttons" }, [h("a", { class: "btn", href: links.addTo(COLLECTION_TARGET) }, "+ Karten hinzufügen")]));

  // Pokédex-Sortierung braucht die Kartendetails – sind sie nachgeladen, einmal neu sortieren
  let waitingForDex = prefs.get("collectionSort") === "pokedex" && entries.some((e) => !prices.get(e.card.id));
  const refresh = () => {
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
  main.append(h("div", { class: "toolbar wrap" }, [filter, sortSelect(sorters, SORT_KEYS, prefs.get("collectionSort"), setPref("collectionSort")), groupSelect]));

  // Abschnitte bauen: [{ title, hint, entries }]
  const sections = groupEntries(entries, prefs.get("collectionGroup"), { sets, lists, valueOf: (id) => prices.value(id) });
  const blocks = sections.map((sec) => {
    const grid = h("div", { class: "grid" }, sec.entries.map((e) => cardTile(e.card, { mode: "view" })));
    const head = sec.title ? h("h2", { class: "group-title" }, [h("span", {}, sec.title), h("small", {}, sec.hint)]) : null;
    main.append(...[head, grid].filter(Boolean));
    return { head, grid, entries: sec.entries };
  });

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
      if (b.head) b.head.hidden = !any;
    }
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  prices.request(entries.map((e) => e.card.id));
  return { refresh };
}

function groupEntries(entries, group, { sets, lists, valueOf }) {
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
