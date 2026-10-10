import { h, ICONS } from "../../core/dom.js";
import { fmtEur, fmtSigned } from "../../core/format.js";
import { cardNumber } from "../../domain/card.js";
import { movers } from "../../domain/price.js";
import { cardImg, imageFor } from "./cardTile.js";

const shortDay = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`; // „2026-10-10“ → „10.10.“

// Unter „Marktwert“ in der Sammlung: Änderung seit 7 und 30 Tagen (services/historyService.js)
export function worthHint(history, unknown) {
  const [d7, d30] = [history.change(7), history.change(30)];
  const change = d7 == null ? "Verlauf ansehen" : `7 T: ${fmtSigned(d7)} · 30 T: ${d30 == null ? "–" : fmtSigned(d30)}`;
  return unknown ? `${change} · ${unknown} ohne Preis` : change;
}

// Verlaufskurve als selbst gezeichnetes SVG: Fläche + Linie, x nach Datum (Lücken bleiben Lücken), y von niedrigstem
// bis höchstem Wert
function chart(series) {
  const [W, H, PAD] = [320, 120, 6];
  const t = series.map((e) => Date.parse(e.day));
  const span = Math.max(t.at(-1) - t[0], 1);
  const values = series.map((e) => e.worth);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const x = (i) => (PAD + ((t[i] - t[0]) / span) * (W - 2 * PAD)).toFixed(1);
  const y = (v) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD)).toFixed(1);
  const line = series.map((e, i) => `${x(i)},${y(e.worth)}`).join(" ");
  const [first, last] = [series[0], series.at(-1)];
  const label = `Wert deiner Sammlung vom ${shortDay(first.day)} bis ${shortDay(last.day)}: zwischen ${fmtEur(lo)} und ${fmtEur(hi)}`;
  return h("figure", { class: "worth-chart" }, [
    h("div", {
      html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="worth-svg" role="img" aria-label="${label}">
        <polygon class="worth-area" points="${x(0)},${H} ${line} ${x(series.length - 1)},${H}"/>
        <polyline class="worth-line" points="${line}" vector-effect="non-scaling-stroke"/></svg>`,
    }),
    h("figcaption", { class: "worth-axis" }, [h("span", {}, shortDay(first.day)), h("span", {}, `${fmtEur(lo)} – ${fmtEur(hi)}`), h("span", {}, shortDay(last.day))]),
  ]);
}

/**
 * „Wert deiner Sammlung“ (Antippen von „Marktwert“): Verlauf, Änderung seit 7/30 Tagen und Gestiegen/Gefallen –
 * die 5 Karten mit dem größten Unterschied Ø 7 Tage gegen Ø 30 Tage; Antippen öffnet die Karte.
 */
export function openWorthSheet(ctx) {
  ctx.openSheet((body, sheet) => {
    const { history, collection, prices } = sheet;
    const series = history.series();
    const last = series.at(-1);
    const { up, down } = movers(collection.entries(), (id) => prices.get(id));
    const cell = (label, value) => h("div", {}, [h("span", {}, label), h("b", {}, value)]);
    const change = (days) => {
      const diff = history.change(days);
      return diff == null ? "–" : fmtSigned(diff);
    };
    const row = ({ entry: { card }, price, diff }) => {
      const img = imageFor(card, "low");
      return h("button", { type: "button", class: "mover", onclick: () => sheet.openCard(card) }, [
        h("span", { class: img ? "mover-art" : "mover-art no-img" }, img ? [cardImg(card, "low", img, { alt: "", loading: "lazy" })] : []),
        h("span", { class: "mover-info" }, [h("b", {}, card.name), h("small", {}, `${cardNumber(card)} · ${card.setName}`), h("small", {}, `Ø 7 T ${fmtEur(price.avg7)} · Ø 30 T ${fmtEur(price.avg30)}`)]),
        h("span", { class: `mover-diff ${diff > 0 ? "up" : "down"}` }, [fmtSigned(diff), h("small", {}, `${diff > 0 ? "+" : "−"}${Math.round(Math.abs(diff / price.avg30) * 100)} %`)]),
      ]);
    };
    const list = (title, items, empty) => h("section", { class: "sheet-part" }, [h("h3", {}, title), items.length ? h("div", { class: "movers" }, items.map(row)) : h("p", { class: "muted" }, empty)]);
    body.replaceChildren(
      h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: sheet.close, html: ICONS.close }),
      h("div", { class: "sheet-head" }, [
        h("h2", {}, "Wert deiner Sammlung"),
        h("p", { class: "muted" }, "Einmal am Tag gemerkt, sobald alle Preise geladen sind – nur auf diesem Gerät. Neue Karten erhöhen den Wert auch, er ist also kein Gewinn."),
      ]),
      h("div", { class: "prices" }, [
        h("div", { class: "price-grid three" }, [
          cell(`Stand ${shortDay(last.day)}`, fmtEur(last.worth)),
          cell("Seit 7 Tagen", change(7)),
          cell("Seit 30 Tagen", change(30)),
        ]),
        series.length > 1 ? chart(series) : h("p", { class: "muted" }, "Ab morgen siehst du hier eine Kurve."),
      ]),
      list("Gestiegen", up, "Gerade keine Karte über ihrem 30-Tage-Schnitt."),
      list("Gefallen", down, "Gerade keine Karte unter ihrem 30-Tage-Schnitt."),
      h("p", { class: "muted small" }, "Gestiegen/Gefallen: Ø 7 Tage gegen Ø 30 Tage bei Cardmarket, pro Stück.")
    );
  });
}
