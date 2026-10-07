import { links } from "../router.js";
import { cardTile } from "../components/cardTile.js";
import { searchPanel } from "../components/searchPanel.js";

// Ansicht „Suche“: alle deutschen Karten nach Name/Nummer; ohne Eingabe die Liste aller Sets
export function render(main, ctx) {
  ctx.setTitle("Suche");
  main.append(searchPanel(ctx, { session: ctx.session.search, tile: (card) => cardTile(card), setHref: links.set }));
  return {};
}
