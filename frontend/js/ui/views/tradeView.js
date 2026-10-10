import { h } from "../../core/dom.js";
import { describeError } from "../../core/errors.js";
import { fmtDateTime, fmtEur, plural } from "../../core/format.js";
import { isOffered } from "../../domain/trade.js";
import { cardTile } from "../components/cardTile.js";
import { tradeCalculator } from "../components/tradeCalculator.js";
import { emptyState, note } from "../components/widgets.js";

const FRESH_MS = 60_000; // so lange gilt die letzte Antwort, ohne neu zu fragen (z. B. beim Neuzeichnen nach dem Abhaken)

// Reiter „Tauschen“ (#tauschen): oben der Tauschrechner (mit jedem, auch ohne App), darunter „Mit den anderen“ – was du
// anbietest, und pro Person „Tim bietet an, was dir fehlt“ und „Du bietest an, was Tim fehlt“, je mit Anzahl und Marktwert,
// ein Knopf übernimmt beides in den Rechner, aufklappbar alles, was Tim anbietet. Angeboten wird, was doppelt ist – oder was
// in der Kartenansicht unter „Tauschen“ selbst festgelegt ist (domain/trade.js: isOffered). Antippen öffnet die Karte. „Mit den anderen“ braucht Internet und
// Anmeldung; die letzte Antwort bleibt im Speicher (services/tradeService.js), der Rechner auf dem Gerät (tradeDraftService.js).
export function render(main, ctx) {
  const { trade, tradeDraft, sync, prices } = ctx;
  ctx.setTitle("Tauschen");
  const calc = tradeCalculator(ctx);
  main.append(calc.element, h("h2", { class: "section-title trade-others" }, "Mit den anderen in der App"));
  if (!sync.enabled) {
    main.append(
      note("Angemeldet siehst du hier, wer anbietet, was dir fehlt – und umgekehrt."),
      h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn", onclick: ctx.openProfiles }, "Anmelden")])
    );
    return { refresh: calc.refresh };
  }
  const status = h("div");
  const body = h("div");
  const mine = ctx.collection.entries().filter(isOffered);
  main.append(
    h("p", { class: "muted pad" }, "Angeboten wird, was doppelt ist – oder was ihr in der Kartenansicht unter „Tauschen“ selbst festlegt. Was in Listen steht und fehlt, zählt als Wunsch. Die Sprache zählt nicht."),
    h("details", { class: "trade-all" }, [
      h("summary", {}, `Was du anbietest (${mine.length})`),
      mine.length ? h("div", { class: "grid" }, mine.map((e) => cardTile(e.card, { mode: "view" }))) : h("p", { class: "muted pad" }, "Nichts – keine Karte doppelt und keine auf „Tauschen: Ja“."),
    ]),
    status,
    body
  );

  const hints = []; // [Element, Karten] – Anzahl und Marktwert, sobald die Preise da sind
  const tiles = (items) => h("div", { class: "grid" }, items.map((d) => cardTile(d.card, { mode: "view" })));
  const section = (title, items, empty) => {
    const hint = h("small");
    hints.push([hint, items]);
    return [h("h3", { class: "group-title" }, [h("span", {}, title), hint]), items.length ? tiles(items) : h("p", { class: "muted pad" }, empty)];
  };
  const refresh = () => {
    calc.refresh();
    for (const [el, items] of hints) {
      const known = items.map((d) => prices.value(d.card.id)).filter((v) => v != null);
      el.textContent = items.length ? `${plural(items.length, "Karte", "Karten")} · ${fmtEur(known.reduce((s, v) => s + v, 0))}${known.length < items.length ? " + ?" : ""}` : "";
    }
  };
  // Vorschlag in den Rechner: ich gebe, was ich anbiete und Tim fehlt, und bekomme, was er anbietet und mir fehlt
  const toCalculator = (name, forThem, forMe) => {
    tradeDraft.fill(forThem, forMe);
    ctx.render();
    window.scrollTo(0, 0);
    ctx.notify(`Tausch mit ${name} im Rechner – Karten rausnehmen oder dazusuchen, bis es passt.`, { type: "success" });
  };

  const draw = () => {
    hints.length = 0;
    const people = trade.last?.people;
    if (!people) return;
    if (!people.length) return body.replaceChildren(emptyState("Noch niemand anderes da."));
    const ids = [];
    body.replaceChildren(
      ...people.flatMap((p) => {
        const { forMe, forThem } = trade.matches(p);
        ids.push(...p.offers.map((d) => d.card.id), ...forThem.map((d) => d.card.id));
        return [
          h("h2", { class: "section-title trade-person" }, p.name),
          ...section(`${p.name} bietet an, was dir fehlt`, forMe, `${p.name} bietet gerade nichts an, was in deinen Listen fehlt.`),
          ...section(`Du bietest an, was ${p.name} fehlt`, forThem, `Du bietest nichts an, was in den Listen von ${p.name} fehlt.`),
          forMe.length || forThem.length
            ? h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: () => toCalculator(p.name, forThem, forMe) }, "Im Rechner durchrechnen")])
            : "",
          h("details", { class: "trade-all" }, [
            h("summary", {}, `Alles, was ${p.name} anbietet (${p.offers.length})`),
            p.offers.length ? tiles(p.offers) : h("p", { class: "muted pad" }, "Nichts."),
          ]),
        ];
      })
    );
    prices.request(ids);
  };

  const showStatus = (text, retry = null) =>
    status.replaceChildren(...(text ? [note(text)] : []), ...(retry ? [h("div", { class: "buttons center" }, [h("button", { type: "button", class: "btn", onclick: retry }, "Nochmal")])] : []));
  const load = async () => {
    if (!navigator.onLine) {
      return showStatus(trade.last ? `Du bist offline – Stand von ${fmtDateTime(trade.last.at)}.` : "Du bist offline – das braucht Internet. Der Rechner oben geht mit gespeicherten Preisen trotzdem.");
    }
    showStatus(trade.last ? "" : "Wird geladen …");
    try {
      await trade.load();
      if (!body.isConnected) return; // inzwischen weg navigiert oder neu gezeichnet
      showStatus("");
      draw();
      ctx.refresh(); // Kacheln und Summen (beim ersten Zeichnen macht das die App nach render)
    } catch (e) {
      if (!body.isConnected) return;
      const { kind, message } = describeError(e);
      showStatus(kind === "offline" ? "Du bist offline – das braucht Internet." : `Das klappt gerade nicht. ${message}`, load);
    }
  };
  draw();
  if (!trade.last || Date.now() - trade.last.at > FRESH_MS) load();
  return { refresh };
}
