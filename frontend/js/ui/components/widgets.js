import { h } from "../../core/dom.js";

// Kleine wiederverwendbare Bausteine der Oberfläche.

export const stat = (label, value, hint) => h("div", { class: "stat" }, [h("span", {}, label), h("b", {}, value), hint ? h("small", {}, hint) : null]);

export const emptyState = (title, text) => h("div", { class: "empty" }, [h("b", {}, title), text ? h("p", {}, text) : null]);

export const note = (text) => h("p", { class: "muted pad" }, text);

export const panel = (title, children) => h("section", { class: "panel" }, [h("h2", {}, title), ...children]);

export const backLink = (href, text) => h("a", { class: "back", href }, `‹ ${text}`);

export function sortSelect(sorters, keys, current, onChange) {
  const select = h(
    "select",
    { class: "field", "aria-label": "Sortieren" },
    keys.map((k) => h("option", { value: k, selected: k === current }, sorters[k].label))
  );
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

// options: [[key, label], …]
export function segmented(options, current, onChange, label) {
  return h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": label },
    options.map(([key, text]) => h("button", { type: "button", role: "radio", "aria-checked": String(key === current), onclick: () => onChange(key) }, text))
  );
}
