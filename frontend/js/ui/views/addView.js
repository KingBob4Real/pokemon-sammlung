import { h } from "../../core/dom.js";
import { plural } from "../../core/format.js";
import { COLLECTION_TARGET, links } from "../router.js";
import { cardTile, setPicked } from "../components/cardTile.js";
import { searchPanel } from "../components/searchPanel.js";
import { setCardsPanel } from "../components/setCardsPanel.js";
import { backLink, emptyState } from "../components/widgets.js";

// Wohin wird hinzugefügt? Sammlung oder eine Liste – beide mit derselben Schnittstelle.
function resolveTarget(ctx, targetId) {
  const { collection, lists } = ctx;
  if (targetId === COLLECTION_TARGET) {
    return {
      name: "Sammlung",
      backHref: "#sammlung",
      has: (card) => collection.has(card.id),
      toggle: (card) => collection.toggle(card),
      // mehrere Exemplare nicht per Antippen auf 0 setzen – Anzahl in der Kartenansicht ändern
      needsSheet: (card) => collection.quantity(card.id) > 1,
      count: () => `${plural(collection.entries().length, "Karte", "Karten")} in der Sammlung`,
    };
  }
  const list = lists.get(targetId);
  if (!list) return null;
  return {
    name: list.name,
    backHref: links.list(targetId),
    has: (card) => lists.contains(targetId, card.id),
    toggle: (card) => lists.setMembership(targetId, card, !lists.contains(targetId, card.id)),
    count: () => `${plural(lists.items(targetId).length, "Karte", "Karten")} in „${list.name}“`,
  };
}

// „Karten hinzufügen“: suchen oder ein Set öffnen, Karte antippen = rein, nochmal = wieder raus.
// Adresse: #hinzufuegen/<sammlung|listId> oder #hinzufuegen/<…>/<setId>
export function render(main, ctx, arg) {
  const [targetId, setId] = arg.split("/");
  const target = resolveTarget(ctx, targetId);
  if (!target) {
    ctx.setTitle("Liste");
    main.append(emptyState("Diese Liste gibt es nicht mehr."), h("a", { class: "btn", href: links.lists }, "Zu den Listen"));
    return {};
  }
  ctx.setTitle(`${target.name} +`);

  const pickTile = (card) => {
    const el = cardTile(card, { mode: "pick" });
    setPicked(el, target.has(card));
    return el;
  };
  const count = h("span");
  const updateCount = () => (count.textContent = target.count());

  let refreshPanel = null;
  const hint = h("p", { class: "muted pad" }, "Karte antippen = hinzufügen, nochmal antippen = wieder raus.");
  if (setId) {
    const panel = setCardsPanel(ctx, setId, { tile: pickTile });
    refreshPanel = panel.refresh;
    main.append(h("div", { class: "list-head" }, [backLink(links.addTo(targetId), "Sets & Suche")]), hint, panel.element);
  } else {
    main.append(
      h("div", { class: "list-head" }, [backLink(target.backHref, target.name)]),
      hint,
      searchPanel(ctx, { session: ctx.session.add, tile: pickTile, setHref: (id) => links.addTo(targetId, id) })
    );
  }
  main.append(h("div", { class: "action-bar" }, [count, h("a", { class: "btn", href: target.backHref }, "Fertig")]));
  main.classList.add("has-action-bar");

  const onPick = (card, el) => {
    if (target.needsSheet?.(card)) return ctx.openCard(card);
    target.toggle(card);
    setPicked(el, target.has(card));
    ctx.bounce(el);
    updateCount();
    navigator.vibrate?.(10);
  };
  return {
    refresh: () => {
      updateCount();
      refreshPanel?.();
    },
    onPick,
  };
}
