import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { searchPanel } from "../components/searchPanel.js";
import { useSelection } from "../components/selection.js";

// Ansicht „Suche“: alle Karten (Deutsch + Englisch) nach Name/Nummer, dazu passende Sets; ohne Eingabe die Liste aller Sets.
// „Auswählen“ markiert mehrere Karten (auch über mehrere Suchen) für „Hinzufügen …“ (Sammlung oder Liste).
export function render(main, ctx) {
  ctx.setTitle("Suche");
  const selection = useSelection(ctx, "suche");
  const tile = (card) => selection.mark(cardTile(card, { mode: selection.active ? "pick" : "default" }), card);
  main.append(searchPanel(ctx, { session: ctx.session.search, tile, setHref: links.set, extra: selection.toggle() }));
  return { onPick: selection.active ? selection.bar(main) : undefined };
}
