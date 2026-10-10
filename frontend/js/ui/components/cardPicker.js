import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { cardTile, tileCard, updateTile } from "./cardTile.js";
import { progressBar } from "./progressBar.js";
import { emptyState } from "./widgets.js";

// Karte auswählen beim Scannen: Kacheln der Treffer oder eine Suche (für Einzel- und Serien-Scan).

const SEARCH_RESULTS = 30;

// Kacheln zum Antippen; zeigt Anzahl in der Sammlung und Marktwert → { grid, update }.
// Preise nur für Kacheln, die ins Bild kommen – sonst kostete jede Suche bis zu 30–60 Preis-Anfragen.
export function choiceGrid({ collection, prices }, cards, onPick) {
  const grid = h("div", { class: "grid" }, cards.map((c) => cardTile(c, { mode: "view" })));
  grid.addEventListener("click", (e) => {
    const card = tileCard(e.target.closest(".tile"));
    if (card) onPick(card);
  });
  const update = () => {
    for (const el of grid.children) updateTile(el, { qty: collection.quantity(tileCard(el).id), value: prices.value(tileCard(el).id) });
  };
  update();
  const seen = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting);
    for (const e of visible) seen.unobserve(e.target);
    if (visible.length) prices.request(visible.map((e) => tileCard(e.target).id));
  }, { rootMargin: "200px" });
  for (const el of grid.children) seen.observe(el);
  return { grid, update };
}

// Kartensuche, vorausgefüllt mit query, Treffer zum Antippen → { elements, update }. live(): Dialog noch offen?
export function cardSearch(ctx, { query, onPick, live }) {
  const input = h("input", {
    type: "search",
    class: "field",
    placeholder: "Name oder Nummer, z. B. Glurak 199",
    "aria-label": "Karte suchen",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    value: query,
  });
  const form = h("form", { class: "toolbar" }, [input, h("button", { type: "submit", class: "btn" }, "Suchen")]);
  const bar = progressBar();
  const results = h("div");
  let choice = null;
  let seq = 0;
  const run = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q) return results.replaceChildren();
    bar.busy();
    try {
      const cards = await ctx.catalog.search(q);
      if (mine !== seq || !live()) return;
      choice = choiceGrid(ctx, cards.slice(0, SEARCH_RESULTS), onPick);
      results.replaceChildren(cards.length ? choice.grid : emptyState(`Keine Karte gefunden für „${q}“.`, "Tipp: Name auf Deutsch oder Englisch, z. B. „Glurak“ oder „Charizard“, gern mit Nummer oder Set-Kürzel („MEW 199“)."));
    } catch (e) {
      if (mine !== seq) return;
      const offline = describeError(e).kind === "offline";
      results.replaceChildren(
        emptyState(offline ? "Du bist offline – die Suche braucht Internet." : "Die Kartensuche klappt gerade nicht."),
        h("div", { class: "buttons center" }, [h("button", { type: "button", class: "btn", onclick: run }, "Nochmal")])
      );
    }
    bar.done();
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    input.blur(); // Handy-Tastatur zuklappen
    run();
  });
  run();
  return { elements: [form, bar.el, results], update: () => choice?.update() };
}
