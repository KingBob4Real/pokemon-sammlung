import { CONDITIONS, LANGUAGES } from "../../config.js";
import { h, ICONS } from "../../core/dom.js";
import { fmtEur, fmtPriceInput, fmtSigned, parseEuro, plural } from "../../core/format.js";
import { cardNumber } from "../../domain/card.js";
import { cardmarketUrl } from "../../domain/price.js";
import { TRADE_PRICES, tradeSums } from "../../domain/trade.js";
import { confirmDialog } from "./ask.js";
import { cardSearch } from "./cardPicker.js";
import { cardImg, imageFor } from "./cardTile.js";

const SIDES = [
  ["give", "Ich gebe", "Karte, die du gibst"],
  ["get", "Ich bekomme", "Karte, die du bekommst"],
];

/**
 * Tauschrechner: was du gibst und was du bekommst – beliebige Karten, auch mit Leuten ohne App. Pro Karte die
 * Cardmarket-Werte ab · Ø 1 Tag · Ø 7 Tage · Ø 30 Tage und unten je Wert die Summen und die Differenz.
 * Die Werte mischen Sprachen und Zustände (mehr gibt es kostenlos nicht). Sprache und Zustand der Karte stellen darum
 * den Cardmarket-Link ein; den echten Preis dort nachsehen und als „Eigener Preis“ eintragen – der zählt dann vor allem.
 * → { element, refresh } – refresh() zeichnet nur Zahlen neu (Eingaben behalten den Fokus)
 */
export function tradeCalculator(ctx) {
  const { tradeDraft, prices } = ctx;
  const element = h("section", { class: "panel trade-calc" });
  let updates = []; // zeichnen Preise und Links der Zeilen neu

  const select = (options, value, onchange) => {
    const el = h("select", { class: "field" }, options.map((o) => h("option", { selected: o === value }, o)));
    el.addEventListener("change", () => onchange(el.value));
    return el;
  };

  const row = (side, it) => {
    const { card } = it;
    const img = imageFor(card, "low");
    const priceLine = h("div", { class: "trade-prices" });
    const link = h("a", { class: "link-button", target: "_blank", rel: "noopener" }, "Auf Cardmarket ↗");
    const qty = h("output", {}, String(it.qty));
    const step = (d) => (tradeDraft.change(side, card.id, { qty: it.qty + d }), draw());
    const own = h("input", { type: "text", class: "field", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done", placeholder: "Eigener Preis", "aria-label": `Eigener Preis für ${card.name}`, value: fmtPriceInput(it.own) });
    own.addEventListener("input", () => {
      const n = parseEuro(own.value);
      if (Number.isNaN(n)) return; // Tippfehler ignorieren
      tradeDraft.change(side, card.id, { own: n || null });
      refresh();
    });
    own.addEventListener("keydown", (e) => e.key === "Enter" && own.blur());
    const update = () => {
      const p = prices.get(card.id);
      priceLine.replaceChildren(...TRADE_PRICES.map(([key, label]) => h("span", {}, [h("small", {}, label), h("b", {}, fmtEur(p?.[key] ?? null))])));
      link.href = cardmarketUrl(card, p, it.lang, CONDITIONS.indexOf(it.cond) + 1);
    };
    const set = (patch) => (tradeDraft.change(side, card.id, patch), update());
    updates.push(update);
    return h("div", { class: "trade-item" }, [
      h("span", { class: img ? "mover-art" : "mover-art no-img" }, img ? [cardImg(card, "low", img, { alt: "", loading: "lazy" })] : []),
      h("div", { class: "trade-item-body" }, [
        h("div", { class: "trade-item-head" }, [
          h("span", { class: "mover-info" }, [h("b", {}, card.name), h("small", {}, `${cardNumber(card)} · ${card.setName}`)]),
          h("span", { class: "trade-qty" }, [
            h("button", { type: "button", "aria-label": it.qty > 1 ? "Eine weniger" : "Rausnehmen", onclick: () => step(-1) }, "−"),
            qty,
            h("button", { type: "button", "aria-label": "Eine mehr", onclick: () => step(1) }, "+"),
          ]),
        ]),
        priceLine,
        h("div", { class: "trade-fields" }, [select(LANGUAGES, it.lang, (lang) => set({ lang })), select(CONDITIONS, it.cond, (cond) => set({ cond })), own, link]),
      ]),
    ]);
  };

  // Summen je Wert: Ich gebe · Ich bekomme · Differenz (= bekommen − geben; Plus = du bekommst mehr)
  const table = h("table", { class: "trade-sum" });
  const drawTable = () => {
    const [give, get] = SIDES.map(([side]) => tradeSums(tradeDraft.draft[side], (id) => prices.get(id)));
    const cell = (s) => h("td", {}, [fmtEur(s.sum), s.unknown ? h("small", {}, " + ?") : ""]);
    table.replaceChildren(
      h("thead", {}, h("tr", {}, [h("th"), h("th", {}, "Ich gebe"), h("th", {}, "Ich bekomme"), h("th", {}, "Differenz")])),
      h(
        "tbody",
        {},
        TRADE_PRICES.map(([key, label]) => {
          const diff = get[key].sum - give[key].sum;
          return h("tr", {}, [h("th", {}, label), cell(give[key]), cell(get[key]), h("td", { class: Math.abs(diff) < 0.005 ? "" : diff > 0 ? "up" : "down" }, fmtSigned(diff))]);
        })
      )
    );
  };

  const pick = (side, title) =>
    ctx.openSheet((body, sheet) => {
      const found = cardSearch(sheet, {
        query: "",
        live: () => true,
        onPick: (card) => {
          tradeDraft.add(side, card);
          prices.request([card.id]);
          draw();
          sheet.close();
        },
      });
      body.replaceChildren(h("button", { type: "button", class: "sheet-close", "aria-label": "Schließen", onclick: sheet.close, html: ICONS.close }), h("div", { class: "sheet-head" }, [h("h2", {}, title)]), ...found.elements);
      found.elements[0].querySelector("input").autofocus = true; // showModal fokussiert sonst den Schließen-Knopf
      return found.update;
    });

  const clear = async () => {
    if (await confirmDialog("Tauschrechner leeren?", { ok: "Leeren", danger: true })) (tradeDraft.clear(), draw());
  };

  function draw() {
    updates = [];
    const empty = !tradeDraft.draft.give.length && !tradeDraft.draft.get.length;
    element.replaceChildren(
      h("h2", {}, "Tausch berechnen"),
      h("p", { class: "muted" }, "Mit jedem – auch ohne App. Karten suchen, die ihr tauschen wollt, und die Werte vergleichen."),
      ...SIDES.flatMap(([side, label, title]) => [
        h("h3", { class: "group-title" }, [h("span", {}, label), h("small", {}, plural(tradeDraft.draft[side].reduce((n, i) => n + i.qty, 0), "Karte", "Karten"))]),
        ...tradeDraft.draft[side].map((it) => row(side, it)),
        h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: () => pick(side, title) }, "+ Karte")]),
      ]),
      ...(empty
        ? []
        : [
            table,
            h("p", { class: "muted small" }, "Differenz = was du bekommst minus was du gibst. Cardmarket-Werte mischen alle Sprachen und Zustände; „ab“ ist oft eine beschädigte oder fremdsprachige Karte. Den echten Preis für Sprache und Zustand zeigt der Cardmarket-Link – als „Eigener Preis“ eingetragen, zählt er in allen Zeilen."),
            h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn btn-ghost danger", onclick: clear }, "Leeren")]),
          ])
    );
    prices.request([...tradeDraft.draft.give, ...tradeDraft.draft.get].map((i) => i.card.id));
    refresh();
  }

  function refresh() {
    updates.forEach((u) => u());
    drawTable();
  }

  draw();
  return { element, refresh };
}
