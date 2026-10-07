import { SEARCH_LIMIT } from "../../config.js";
import { h } from "../../core/dom.js";
import { progressBar, trackFirstImages } from "./progressBar.js";
import { emptyState, note } from "./widgets.js";

const TYPING_PAUSE_MS = 250;

/**
 * Suchfeld + Ergebnisse; ohne Eingabe die Liste aller Sets.
 * Wird von „Suche“ und „Karten zur Liste hinzufügen“ benutzt.
 *   session  – { query, results }, bleibt beim Wechseln der Ansicht erhalten
 *   tile     – card → Kachel-Element
 *   setHref  – setId → Link zur Set-Ansicht
 */
export function searchPanel(ctx, { session, tile, setHref }) {
  const { catalog, sets } = ctx;
  const input = h("input", {
    type: "search",
    class: "field",
    placeholder: "Name oder Nummer, z. B. Glurak 199",
    "aria-label": "Alle deutschen Karten durchsuchen",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    value: session.query,
  });
  const box = h("div");
  const bar = progressBar();
  const panel = h("div", {}, [h("div", { class: "toolbar" }, [input]), bar.el, box]);

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
    } catch {
      if (mine === seq) session.results = { query, error: navigator.onLine ? "Die Kartensuche ist gerade nicht erreichbar." : "Offline: Die Suche braucht Internet." };
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
      h("h2", { class: "section-title" }, "Sets durchstöbern"),
      h(
        "div",
        { class: "rows" },
        [...sets.all()].reverse().map((s) => h("a", { class: "row set-row", href: setHref(s.id) }, [h("b", {}, s.name), h("small", {}, s.total ? `${s.total} Karten` : "")]))
      )
    );
  }

  function showResults() {
    const r = session.results;
    if (r.error || !r.cards.length) bar.done();
    if (r.error) return box.replaceChildren(emptyState(r.error));
    if (!r.cards.length) return box.replaceChildren(emptyState(`Keine Karte gefunden für „${r.query}“.`, "Tipp: deutschen Namen verwenden, z. B. „Glurak“ statt „Charizard“."));
    box.replaceChildren(
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
