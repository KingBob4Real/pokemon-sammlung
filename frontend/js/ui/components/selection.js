import { h } from "../../core/dom.js";
import { plural } from "../../core/format.js";
import { COLLECTION_TARGET, links } from "../router.js";
import { ask } from "./ask.js";
import { setPicked, tileCard } from "./cardTile.js";

/**
 * Mehrfach-Auswahl in Sammlung, Liste und Suche: „Auswählen“ → Karten antippen → Leiste unten mit
 * Anzahl, „Alle“, einem Menü „Hinzufügen …“ (Sammlung, jede Liste, neue Liste – plus eigene Gruppen der Ansicht,
 * z. B. Ordner) und eigenen Knöpfen (z. B. „Entfernen“).
 * Gemerkt in ctx.session.selection = { where, cards: Map(id → Karte) } – in der Suche auch über neue Suchen hinweg.
 *   where – welche Ansicht gerade auswählt („sammlung“, „suche“, „liste:<id>“); woanders hin = Auswahl vorbei
 */
export function useSelection(ctx, where) {
  const sel = ctx.session.selection;
  if (sel.where !== where) {
    sel.where = null;
    sel.cards.clear();
  }
  const active = sel.where === where;
  const set = (on) => {
    sel.where = on ? where : null;
    sel.cards.clear();
    ctx.render();
  };
  return {
    active,
    toggle: () => h("button", { type: "button", class: "btn btn-ghost", onclick: () => set(!active) }, active ? "Auswahl beenden" : "Auswählen"),
    // Kachel passend zur Auswahl markieren
    mark(el, card) {
      if (active) setPicked(el, sel.cards.has(card.id));
      return el;
    },
    // Leiste unten anhängen → onPick für die Ansicht.
    //   except  – Ziel, das das Menü nicht anbietet (hier ist man ja)
    //   menu    – Beschriftung des Menüs; groups: weitere Gruppen [{ label, items: [[Text, (Karten) → Meldung | null]] }]
    //   buttons – (chosen, stop) → weitere Knöpfe
    bar: (main, { except = null, menu = "Hinzufügen …", groups = [], buttons = () => [] } = {}) =>
      actionBar(ctx, main, sel, { except, menu, groups, buttons, stop: () => set(false) }),
  };
}

function actionBar(ctx, main, sel, { except, menu, groups, buttons, stop }) {
  const label = h("span");
  const chosen = () => [...sel.cards.values()];
  const update = () => (label.textContent = sel.cards.size ? `${sel.cards.size} ausgewählt` : "Karten antippen zum Auswählen");
  // „Alle“: was gerade zu sehen ist (Filter beachtet); sind schon alle markiert, wieder alle ab
  const selectAll = () => {
    const visible = [...main.querySelectorAll(".tile")].filter((el) => !el.closest("[hidden]"));
    const all = visible.length > 0 && visible.every((el) => sel.cards.has(tileCard(el).id));
    for (const el of visible) {
      const card = tileCard(el);
      if (all) sel.cards.delete(card.id);
      else sel.cards.set(card.id, card);
      setPicked(el, !all);
    }
    update();
  };
  main.append(
    h("div", { class: "action-bar" }, [
      label,
      h("button", { type: "button", class: "btn btn-ghost", onclick: selectAll }, "Alle"),
      actionMenu(ctx, chosen, { except, menu, groups }, stop),
      ...buttons(chosen, stop),
      h("button", { type: "button", class: "btn btn-ghost", onclick: stop }, "Fertig"),
    ])
  );
  main.classList.add("has-action-bar");
  update();
  return (card, el) => {
    if (sel.cards.has(card.id)) sel.cards.delete(card.id);
    else sel.cards.set(card.id, card);
    setPicked(el, sel.cards.has(card.id));
    ctx.bounce(el);
    update();
  };
}

// Menü als eingebautes Auswahlmenü (am iPhone die Liste von unten): Sammlung, jede Liste, neue Liste (+ Gruppen der Ansicht).
// Jeder Eintrag: (Karten) → { message, href? } oder null (abgebrochen, z. B. kein Name eingegeben)
function actionMenu(ctx, chosen, { except, menu, groups }, stop) {
  const { collection, lists } = ctx;
  const toList = (listId, cards) => {
    if (!listId) return null;
    lists.addCards(listId, cards);
    return { message: `in „${lists.get(listId).name}“`, href: links.list(listId) };
  };
  const targets = [
    except === COLLECTION_TARGET ? null : ["Zur Sammlung", (cards) => (collection.markOwned(cards), { message: "in der Sammlung", href: "#sammlung" })],
    ...lists.all().filter((l) => l.id !== except).map((l) => [`Zu „${l.name}“`, (cards) => toList(l.id, cards)]),
    ["Neue Liste …", async (cards) => toList(lists.create((await ask("Name der neuen Liste", { placeholder: "z. B. Wunschliste", ok: "Anlegen" })) || ""), cards)],
  ].filter(Boolean);

  const runs = new Map();
  const option = ([text, run]) => {
    const value = String(runs.size + 1);
    runs.set(value, run);
    return h("option", { value }, text);
  };
  const all = groups.length ? [...groups, { label: "Listen", items: targets }].map((g) => h("optgroup", { label: g.label }, g.items.map(option))) : targets.map(option);
  const select = h("select", { class: "btn", "aria-label": `Ausgewählte Karten: ${menu}` }, [h("option", { value: "" }, menu), ...all]);
  select.addEventListener("change", async () => {
    const run = runs.get(select.value);
    select.value = "";
    if (!run) return;
    const cards = chosen();
    if (!cards.length) return ctx.notify("Erst Karten antippen.", { type: "info" });
    const result = await run(cards); // „Neue Liste …“/„+ Neuer Ordner …“ fragen erst nach dem Namen
    if (!result) return;
    stop();
    ctx.notify(`${plural(cards.length, "Karte", "Karten")} ${result.message}.`, {
      type: "success",
      action: result.href ? { label: "Ansehen", run: () => (location.hash = result.href) } : null,
    });
  });
  return select;
}
