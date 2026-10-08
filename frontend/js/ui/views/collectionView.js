import { h } from "../../core/dom.js";
import { fmtEur, fmtSigned, norm, plural } from "../../core/format.js";
import { orderOf, positionBetween } from "../../domain/sorting.js";
import { COLLECTION_TARGET, links } from "../router.js";
import { cardTile, tileCard } from "../components/cardTile.js";
import { enableReorder } from "../components/reorder.js";
import { scanButton } from "../components/scanSheet.js";
import { useSelection } from "../components/selection.js";
import { backLink, emptyState, sortSelect, stat } from "../components/widgets.js";

const SORT_KEYS = ["newest", "order", "set", "pokedex", "value", "name"];
const GROUPS = [
  ["none", "Ohne Gruppen"],
  ["section", "Nach Ordner"],
  ["set", "Nach Set"],
  ["list", "Nach Liste"],
];
const NO_FOLDER = "ohne"; // #ordner/ohne = Karten ohne Ordner
const CONFIRM_FROM = 10; // ab so vielen Karten vor dem Löschen nachfragen
const NEW_FOLDER = "Name des neuen Ordners, z. B. „Ordner 1“ oder „Tauschkarten“:";

// Ansicht „Sammlung“ oder ein Ordner (#ordner/<id>): oben Suchen + „Auswählen“ (wie in der Suche), Kennzahlen; in der
// Sammlung Karten hinzufügen/scannen und die Ordner-Übersicht. Dann sortieren (auch eigene Reihenfolge per Ziehen),
// gruppieren (Ordner, Set, Liste). „Auswählen“ → in einen Ordner (auch neu) oder eine Liste, aus dem Ordner nehmen, löschen.
// Ordner sind Daten der Art „section“ (hießen früher Abteilungen).
export function render(main, ctx, folderId = "") {
  const { collection, lists, prices, sets, sorters, prefs, session } = ctx;
  const folders = collection.sections();
  const folder = folders.find((f) => f.id === folderId) || null;
  const inFolder = Boolean(folderId);
  if (inFolder && !folder && folderId !== NO_FOLDER) {
    ctx.setTitle("Ordner");
    main.append(emptyState("Diesen Ordner gibt es nicht mehr."), h("a", { class: "btn", href: "#sammlung" }, "Zur Sammlung"));
    return {};
  }
  const known = new Set(folders.map((f) => f.id));
  const inThis = (e) => !inFolder || (folder ? e.section === folder.id : !known.has(e.section));
  const selection = useSelection(ctx, inFolder ? `ordner:${folderId}` : COLLECTION_TARGET);
  ctx.setTitle(folder ? folder.name : inFolder ? "Ohne Ordner" : "Sammlung");
  const valueOf = (id) => prices.value(id);
  const sortKey = sorters[prefs.get("collectionSort")] ? prefs.get("collectionSort") : "newest";
  const all = collection.entries();
  const entries = all.filter(inThis).sort(sorters[sortKey].compare);
  const stats = h("div", { class: "stats" });
  const scan = inFolder ? null : scanButton(ctx);
  const filter = h("input", { type: "search", class: "field", placeholder: inFolder ? "Im Ordner suchen …" : "In der Sammlung suchen …", "aria-label": "Karten filtern", autocomplete: "off", enterkeyhint: "search", value: session.collectionFilter });

  if (inFolder) main.append(folderHead(ctx, folder));
  // „Auswählen“ ganz oben, ohne Scrollen zu sehen – wie in der Suche
  if (entries.length) main.append(h("div", { class: "toolbar tight-row" }, [filter, selection.toggle()]));
  main.append(stats);
  if (scan) main.append(h("div", { class: "buttons" }, [h("a", { class: "btn", href: links.addTo(COLLECTION_TARGET) }, "+ Karten hinzufügen"), scan.button]), scan.note);
  const overview = inFolder || !all.length ? null : folderOverview(ctx, folders, all, valueOf);
  if (overview) main.append(...overview.elements);

  // Pokédex-Sortierung braucht die Kartendetails – sind sie nachgeladen, einmal neu sortieren
  let waitingForDex = sortKey === "pokedex" && entries.some((e) => !prices.get(e.card.id));
  const refresh = () => {
    scan?.refresh();
    overview?.refresh();
    if (waitingForDex && entries.every((e) => prices.get(e.card.id))) {
      waitingForDex = false;
      return ctx.render();
    }
    const s = collection.summary(valueOf, entries);
    stats.replaceChildren(
      stat("Karten", String(s.count), `${s.distinct} verschiedene`),
      stat("Marktwert", fmtEur(s.worth), s.unknown ? `${s.unknown} ohne Preis` : "Cardmarket-Trend"),
      stat("Bezahlt", s.paid ? fmtEur(s.paid) : "–", "deine Kaufpreise"),
      stat("Gewinn/Verlust", s.diffCount ? fmtSigned(s.diff) : "–", s.diffCount ? `bei ${plural(s.diffCount, "Karte", "Karten")} mit Kaufpreis` : "Kaufpreise eintragen")
    );
  };

  if (!entries.length) {
    main.append(
      inFolder
        ? emptyState("Noch keine Karten in diesem Ordner.", "In der Sammlung „Auswählen“ tippen, Karten antippen und „In Ordner …“ wählen.")
        : emptyState("Noch keine Karten in der Sammlung.", "Tippe auf „+ Karten hinzufügen“, such deine Karten oder öffne ein Set und tippe sie an.")
    );
    return { refresh };
  }

  const setPref = (name) => (value) => {
    prefs.set(name, value);
    ctx.render();
  };
  const groups = GROUPS.filter(([k]) => !(inFolder && k === "section")); // im Ordner nicht nach Ordner gruppieren
  const group = groups.some(([k]) => k === prefs.get("collectionGroup")) ? prefs.get("collectionGroup") : "none";
  const groupSelect = h(
    "select",
    { class: "field", "aria-label": "Gruppieren" },
    groups.map(([k, label]) => h("option", { value: k, selected: k === group }, label))
  );
  groupSelect.addEventListener("change", () => setPref("collectionGroup")(groupSelect.value));
  const canReorder = sortKey === "order" && !selection.active;
  main.append(h("div", { class: "toolbar pair" }, [sortSelect(sorters, SORT_KEYS, sortKey, setPref("collectionSort")), groupSelect]));
  if (canReorder) main.append(h("p", { class: "muted pad" }, "Karte gedrückt halten und ziehen zum Verschieben."));

  // Abschnitte bauen: [{ title, hint, entries }]
  const sections = groupEntries(entries, group, { sets, lists, folders, valueOf });
  const blocks = sections.map((sec) => {
    const grid = h(
      "div",
      { class: "grid" },
      sec.entries.map((e) => selection.mark(cardTile(e.card, { mode: selection.active ? "pick" : "view" }), e.card))
    );
    const head = sec.title ? h("h2", { class: "group-title" }, [h("span", {}, sec.title), h("small", {}, sec.hint)]) : null;
    main.append(...[head, grid].filter(Boolean));
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
      if (b.head) b.head.hidden = terms.length > 0 && !any;
    }
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  prices.request(entries.map((e) => e.card.id));
  if (!selection.active) return { refresh, dispose };

  // Auswahl: „In Ordner …“ (Ordner, neuer Ordner, Liste), im Ordner „Aus dem Ordner nehmen“, „Löschen“ (mit „Rückgängig“)
  const remove = (chosen, stop) => {
    const cards = chosen();
    if (!cards.length) return ctx.notify("Erst Karten antippen.", { type: "info" });
    if (cards.length >= CONFIRM_FROM && !confirm(`${plural(cards.length, "Karte", "Karten")} aus der Sammlung löschen? Mit „Rückgängig“ holst du sie zurück.`)) return;
    const undo = collection.removeAll(cards);
    stop();
    ctx.notify(`${plural(cards.length, "Karte", "Karten")} aus der Sammlung gelöscht.`, {
      type: "success",
      force: true,
      duration: 8000,
      action: { label: "Rückgängig", run: () => (undo(), ctx.render()) },
    });
  };
  const inFolderTo = (id, name) => (cards) => (collection.setSection(cards, id), { message: id ? `in „${name}“` : "ohne Ordner", href: id ? links.folder(id) : null });
  const createAndPut = (cards) => {
    const name = prompt(NEW_FOLDER) || "";
    const id = collection.createSection(name);
    return id ? inFolderTo(id, name.trim())(cards) : null;
  };
  const takeOut = (chosen, stop) => {
    const cards = chosen();
    if (!cards.length) return ctx.notify("Erst Karten antippen.", { type: "info" });
    collection.setSection(cards, null);
    stop();
    ctx.notify(`${plural(cards.length, "Karte", "Karten")} aus dem Ordner genommen – ${cards.length === 1 ? "sie bleibt" : "sie bleiben"} in der Sammlung.`, { type: "success" });
  };
  const button = (text, onclick, cls = "btn") => h("button", { type: "button", class: cls, onclick }, text);
  const onPick = selection.bar(main, {
    except: COLLECTION_TARGET,
    menu: "In Ordner …",
    groups: [
      {
        label: "Ordner",
        items: [
          ...folders.filter((f) => f.id !== folderId).map((f) => [`In „${f.name}“`, inFolderTo(f.id, f.name)]),
          ["+ Neuer Ordner …", createAndPut],
          ...(inFolder ? [] : [["Aus dem Ordner nehmen", inFolderTo(null)]]),
        ],
      },
    ],
    buttons: (chosen, stop) =>
      folder
        ? [button("Aus dem Ordner nehmen", () => takeOut(chosen, stop)), button("Aus der Sammlung löschen", () => remove(chosen, stop), "btn danger")]
        : [button("Entfernen", () => remove(chosen, stop), "btn danger")],
  });
  return { refresh, onPick, dispose };
}

// Kopf eines Ordners: zurück zur Sammlung, Umbenennen, Löschen (die Karten bleiben in der Sammlung, nur ohne Ordner)
function folderHead(ctx, folder) {
  const { collection } = ctx;
  const rename = () => {
    const name = prompt("Neuer Name des Ordners:", folder.name);
    if (!name || !name.trim()) return;
    collection.renameSection(folder.id, name);
    ctx.render();
  };
  const remove = () => {
    if (!confirm(`Ordner „${folder.name}“ löschen? Die Karten bleiben in der Sammlung, nur ohne Ordner.`)) return;
    collection.removeSection(folder.id);
    location.hash = "#sammlung";
  };
  return h("div", { class: "list-head" }, [
    backLink("#sammlung", "Sammlung"),
    folder
      ? h("div", { class: "actions" }, [
          h("button", { type: "button", class: "btn btn-ghost", onclick: rename }, "Umbenennen"),
          h("button", { type: "button", class: "btn btn-ghost danger", onclick: remove }, "Löschen"),
        ])
      : "",
  ]);
}

// Übersicht der Ordner in der Sammlung: Name, Kartenzahl, Wert; „Ohne Ordner“; „+ Neuer Ordner“. → { elements, refresh }
function folderOverview(ctx, folders, all, valueOf) {
  const { collection } = ctx;
  const known = new Set(folders.map((f) => f.id));
  const rows = [
    ...folders.map((f) => [links.folder(f.id), f.name, all.filter((e) => e.section === f.id)]),
    ...(folders.length ? [[links.folder(NO_FOLDER), "Ohne Ordner", all.filter((e) => !known.has(e.section))]] : []),
  ].map(([href, name, own]) => {
    const hint = h("small");
    return { own, hint, el: h("a", { class: "row set-row", href }, [h("b", {}, name), hint]) };
  });
  const create = () => {
    const id = collection.createSection(prompt(NEW_FOLDER) || "");
    if (id) location.hash = links.folder(id);
  };
  return {
    elements: [
      h("h2", { class: "section-title" }, "Ordner"),
      rows.length ? h("div", { class: "rows" }, rows.map((r) => r.el)) : h("p", { class: "muted pad" }, "Sortiere Karten in Ordner, z. B. „Ordner 1“ oder „Tauschkarten“."),
      h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: create }, "+ Neuer Ordner")]),
    ],
    refresh: () => rows.forEach((r) => (r.hint.textContent = r.own.length ? groupHint(r.own, valueOf) : "leer")),
  };
}

// „12 Karten · 34,50 €“
function groupHint(list, valueOf) {
  const count = list.reduce((n, e) => n + e.qty, 0);
  const worth = list.reduce((sum, e) => sum + (valueOf(e.card.id) ?? 0) * e.qty, 0);
  return `${plural(count, "Karte", "Karten")}${worth ? ` · ${fmtEur(worth)}` : ""}`;
}

function groupEntries(entries, group, { sets, lists, folders, valueOf }) {
  const hint = (list) => groupHint(list, valueOf);
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
    // Ordner mit Karten, dann was in keinem liegt
    const known = new Set(folders.map((f) => f.id));
    const out = folders.map((f) => ({ title: f.name, entries: entries.filter((e) => e.section === f.id) })).filter((s) => s.entries.length);
    const rest = entries.filter((e) => !known.has(e.section));
    if (rest.length) out.push({ title: "Ohne Ordner", entries: rest });
    return out.map((s) => ({ ...s, hint: hint(s.entries) }));
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
