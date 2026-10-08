import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { searchPanel } from "../components/searchPanel.js";

// Ansicht „Suche“: alle Karten (Deutsch + Englisch) nach Name/Nummer, dazu passende Sets; ohne Eingabe die Liste aller Sets
export function render(main, ctx) {
  ctx.setTitle("Suche");
  main.append(searchPanel(ctx, { session: ctx.session.search, tile: (card) => cardTile(card), setHref: links.set }));
  return {};
}
