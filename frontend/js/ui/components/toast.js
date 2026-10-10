import { h, ICONS } from "../../core/dom.js";

const SAME_MESSAGE_PAUSE_MS = 15000; // dieselbe Meldung nicht dauernd wiederholen

/**
 * Dezenter Hinweis unten über der Navigation – nur für Fehler und wichtige Ergebnisse,
 * nicht für jedes Antippen. Optional mit Knopf (z. B. „Nochmal“, „Neu laden“).
 *   show(text, { type: "info" | "success" | "error", action: { label, run }, duration })
 */
export class Toaster {
  #el;
  #timer = null;
  #recent = new Map(); // Text → wann zuletzt gezeigt

  constructor(root = document.body) {
    this.#el = h("div", { class: "toast", hidden: true });
    root.append(this.#el);
  }

  show(message, { type = "info", action = null, duration = type === "error" ? 7000 : 3500, force = false } = {}) {
    const last = this.#recent.get(message);
    if (!force && last && Date.now() - last < SAME_MESSAGE_PAUSE_MS) return;
    this.#recent.set(message, Date.now());
    clearTimeout(this.#timer);
    const button = action
      ? h("button", {
          type: "button",
          class: "toast-action",
          onclick: () => {
            this.hide();
            action.run();
          },
        }, action.label)
      : null;
    // ohne Knopf nicht null übergeben – replaceChildren macht daraus den Text „null“
    this.#el.replaceChildren(
      ...[
        h("span", { class: "toast-text" }, message),
        button,
        h("button", { type: "button", class: "toast-close", "aria-label": "Hinweis schließen", html: ICONS.close, onclick: () => this.hide() }),
      ].filter(Boolean)
    );
    this.#el.dataset.type = type;
    this.#el.setAttribute("role", type === "error" ? "alert" : "status");
    this.#el.hidden = false;
    this.#el.classList.remove("leaving");
    if (duration) this.#timer = setTimeout(() => this.hide(), duration);
  }

  hide() {
    clearTimeout(this.#timer);
    if (this.#el.hidden) return;
    this.#el.classList.add("leaving");
    setTimeout(() => {
      this.#el.hidden = true;
      this.#el.classList.remove("leaving");
    }, 180);
  }
}
