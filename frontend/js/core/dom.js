// Kleine DOM-Helfer.

export const $ = (selector, root = document) => root.querySelector(selector);

// h("button", { class: "btn", onclick: fn }, ["Text"])
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) if (c != null) el.append(c);
  return el;
}

// Kurzes Ticken beim Antippen des Pokéballs. iPhone kennt navigator.vibrate nicht – dort tickt ein angetippter Schalter (iOS 18+).
// ponytail: Trick über <input switch>, ersetzen, sobald Safari eine Vibrations-Schnittstelle hat
export function haptic() {
  if (navigator.vibrate) return navigator.vibrate(12);
  const label = h("label", { hidden: true }, [h("input", { type: "checkbox", switch: true })]);
  document.body.append(label);
  label.click();
  label.remove();
}

export const ICONS = {
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  // „Habe ich“ auf Kartenkacheln – Farben je Zustand im CSS (.tile-check)
  ball:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ball-top" d="M2 12a10 10 0 0 1 20 0z"/><path class="ball-bottom" d="M2 12a10 10 0 0 0 20 0z"/><circle cx="12" cy="12" r="10" fill="none"/><path d="M2 12h6.8M15.2 12H22"/><circle class="ball-btn" cx="12" cy="12" r="3.2"/></svg>',
  camera:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};
