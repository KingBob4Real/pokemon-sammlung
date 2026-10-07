import { SEARCH_LIMIT } from "../../config.js";
import { h } from "../../core/dom.js";
import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { emptyState, note } from "../components/widgets.js";

// Ansicht „Suche“: alle deutschen Karten nach Name/Nummer; ohne Eingabe die Liste aller Sets
export function render(main, ctx) {
  const { catalog, sets, session } = ctx;
  ctx.setTitle("Suche");
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
  main.append(h("div", { class: "toolbar" }, [input]), box);

  let timer = null;
  let seq = 0; // nur das Ergebnis der letzten Eingabe anzeigen
  input.addEventListener("input", () => {
    session.query = input.value;
    clearTimeout(timer);
    timer = setTimeout(run, 350);
  });
  input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur()); // Handy-Tastatur zuklappen

  async function run() {
    const query = session.query.trim();
    const mine = ++seq;
    if (!query) {
      session.results = null;
      return showSets();
    }
    box.replaceChildren(note("Suche läuft …"));
    try {
      const cards = await catalog.search(query);
      if (mine === seq) session.results = { query, cards };
    } catch {
      if (mine === seq) session.results = { query, error: navigator.onLine ? "Die Kartensuche ist gerade nicht erreichbar." : "Offline: Die Suche braucht Internet." };
    }
    if (mine === seq && box.isConnected) showResults();
  }

  async function showSets() {
    box.replaceChildren(note("Sets werden geladen …"));
    await sets.ready;
    if (!box.isConnected || session.results) return;
    if (!sets.loaded) return box.replaceChildren(emptyState("Sets brauchen beim ersten Mal Internet."));
    box.replaceChildren(
      h("h2", { class: "section-title" }, "Sets durchstöbern"),
      h(
        "div",
        { class: "rows" },
        [...sets.all()].reverse().map((s) => h("a", { class: "row set-row", href: links.set(s.id) }, [h("b", {}, s.name), h("small", {}, s.total ? `${s.total} Karten` : "")]))
      )
    );
  }

  function showResults() {
    const r = session.results;
    if (r.error) return box.replaceChildren(emptyState(r.error));
    if (!r.cards.length) return box.replaceChildren(emptyState(`Keine Karte gefunden für „${r.query}“.`, "Tipp: deutschen Namen verwenden, z. B. „Glurak“ statt „Charizard“."));
    box.replaceChildren(
      note(r.cards.length > SEARCH_LIMIT ? `${r.cards.length} Treffer, die ersten ${SEARCH_LIMIT} werden angezeigt. Genauer suchen, z. B. mit Nummer.` : `${r.cards.length} Treffer`),
      h("div", { class: "grid" }, r.cards.slice(0, SEARCH_LIMIT).map((card) => cardTile(card)))
    );
    ctx.refresh();
  }

  if (session.results && session.results.query === session.query.trim()) showResults();
  else run();
  return {};
}
