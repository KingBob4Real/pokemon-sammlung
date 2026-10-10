import { SEARCH_LIMIT } from "../../config.js";
import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { progressBar, trackFirstImages } from "./progressBar.js";
import { emptyState, note } from "./widgets.js";

const TYPING_PAUSE_MS = 250;

/**
 * Suchfeld + Ergebnisse (passende Sets und Karten); ohne Eingabe „Meine Sets“ (mit Fortschritt) und alle Sets.
 * Wird von „Suche“ und „Karten zur Liste hinzufügen“ benutzt.
 *   session  – { query, results }, bleibt beim Wechseln der Ansicht erhalten
 *   tile     – card → Kachel-Element
 *   setHref  – setId → Link zur Set-Ansicht
 *   extra    – optional ein Knopf neben dem Suchfeld (z. B. „Auswählen“)
 */
export function searchPanel(ctx, { session, tile, setHref, extra = null }) {
  const { catalog, sets } = ctx;
  const input = h("input", {
    type: "search",
    class: "field",
    placeholder: "Karte, Nummer oder Set, z. B. Glurak 199 oder MEW 199",
    "aria-label": "Alle Karten und Sets durchsuchen",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    value: session.query,
  });
  const box = h("div");
  const bar = progressBar();
  const panel = h("div", {}, [h("div", { class: "toolbar" }, [input, extra]), bar.el, box]);
  const setRow = (s) => h("a", { class: "row set-row", href: setHref(s.id) }, [h("b", {}, s.name), h("small", {}, [s.en ? "nur Englisch · " : "", s.total ? `${s.total} Karten` : ""].join(""))]);
  // „Erhabene Helden“ → das Set zum Öffnen, über den Karten
  const matchingSets = (query) => {
    const found = sets.search(query).reverse(); // neueste zuerst
    return found.length ? [h("h2", { class: "section-title" }, "Sets"), h("div", { class: "rows" }, found.slice(0, 8).map(setRow))] : [];
  };

  let timer = null;
  let seq = 0; // nur das Ergebnis der letzten Eingabe anzeigen
  input.addEventListener("input", () => {
    session.query = input.value;
    clearTimeout(timer);
    timer = setTimeout(run, TYPING_PAUSE_MS);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(timer);
    run(); // sofort suchen …
    input.blur(); // … und die Handy-Tastatur zuklappen
  });

  async function run() {
    const query = session.query.trim();
    const mine = ++seq;
    if (!query) {
      session.results = null;
      return showSets();
    }
    if (session.results?.query === query) return; // schon angezeigt
    bar.busy();
    box.replaceChildren(note("Suche läuft …"));
    try {
      const cards = await catalog.search(query);
      if (mine === seq) session.results = { query, cards };
    } catch (e) {
      const { kind, message } = describeError(e);
      if (mine === seq) session.results = { query, error: kind === "offline" ? "Du bist offline – die Suche braucht Internet. Deine Sammlung und Listen gehen trotzdem." : `Die Kartensuche klappt gerade nicht. ${message}` };
    }
    if (mine === seq && box.isConnected) showResults();
    else if (mine === seq) bar.done();
  }

  async function showSets() {
    if (!sets.loaded) {
      bar.busy();
      box.replaceChildren(note("Sets werden geladen …"));
    }
    await sets.ready;
    bar.done();
    if (!box.isConnected || session.results) return;
    if (!sets.loaded) return box.replaceChildren(emptyState("Sets brauchen beim ersten Mal Internet."));
    box.replaceChildren(
      ...mySets(),
      h("h2", { class: "section-title" }, "Sets durchstöbern"),
      h("div", { class: "rows" }, [...sets.all()].reverse().map(setRow))
    );
  }

  // „Meine Sets“: jedes Set mit mindestens einer Karte in der Sammlung, Fortschritt wie bei den Listen, am weitesten
  // zuerst. Offline gezählt – dieselbe Quelle wie „x von y“ in der Set-Ansicht (setCardsPanel.js).
  function mySets() {
    const mine = [...ctx.collection.countBySet()]
      .map(([id, have]) => ({ s: sets.info(id), have }))
      .filter((m) => m.s)
      .map((m) => ({ ...m, total: Math.max(m.s.total || 0, m.have) }))
      .sort((a, b) => b.have / b.total - a.have / a.total || b.have - a.have);
    if (!mine.length) return [];
    const row = ({ s, have, total }) =>
      h("a", { class: "row", href: setHref(s.id) }, [
        h("div", { class: "row-head" }, [h("b", {}, s.name), h("span", { class: "count" }, `${have}/${total}`)]),
        h("div", { class: "progress", "aria-hidden": "true" }, [h("i", { style: `width: ${(have / total) * 100}%` })]),
      ]);
    return [h("h2", { class: "section-title" }, "Meine Sets"), h("div", { class: "rows" }, mine.map(row))];
  }

  function showResults() {
    const r = session.results;
    const setBlock = matchingSets(r.query);
    if (r.error || !r.cards.length) bar.done();
    if (r.error) {
      return box.replaceChildren(
        ...setBlock,
        emptyState(r.error),
        h("div", { class: "buttons center" }, [h("button", { type: "button", class: "btn", onclick: () => ((session.results = null), run()) }, "Nochmal versuchen")])
      );
    }
    if (!r.cards.length) return box.replaceChildren(...(setBlock.length ? setBlock : [emptyState(`Keine Karte gefunden für „${r.query}“.`, "Tipp: Name auf Deutsch oder Englisch, z. B. „Glurak“ oder „Charizard“, gern mit Nummer – oder Set-Kürzel und Nummer wie auf der Karte („MEW 199“, „BS 11“).")]));
    box.replaceChildren(
      ...setBlock,
      setBlock.length ? h("h2", { class: "section-title" }, "Karten") : "",
      note(r.cards.length > SEARCH_LIMIT ? `${r.cards.length} Treffer, die ersten ${SEARCH_LIMIT} werden angezeigt. Genauer suchen, z. B. mit Nummer.` : `${r.cards.length} Treffer`),
      h("div", { class: "grid" }, r.cards.slice(0, SEARCH_LIMIT).map(tile))
    );
    ctx.refresh();
    trackFirstImages(box, bar); // Balken läuft weiter, bis die ersten Bilder da sind
  }

  if (session.results && session.results.query === session.query.trim()) showResults();
  else run();
  return panel;
}
