import { $, h } from "../../core/dom.js";

/**
 * Eigene Rückfragen statt der Systemdialoge prompt/confirm – die wirken auf dem iPhone fremd.
 * Eigener <dialog id="ask"> (index.html), nicht #sheet: gefragt wird auch aus der offenen Kartenansicht heraus,
 * die dabei offen bleibt. Escape und Tipp daneben = Abbrechen, Enter = OK.
 *   ask("Name des neuen Ordners", { value, placeholder, ok }) → Text oder null
 *   confirmDialog("Liste löschen?", { ok, danger }) → true/false
 */
function open(text, { input = null, ok = "OK", danger = false } = {}) {
  const dialog = $("#ask");
  if (dialog.open) dialog.close(); // doppelt getippt: die alte Frage gilt als abgebrochen
  return new Promise((resolve) => {
    // method="dialog": Enter im Feld oder der OK-Knopf schließen mit returnValue "ok"
    dialog.replaceChildren(
      h("form", { method: "dialog", class: "ask-inner" }, [
        h("p", { class: "ask-text" }, text),
        input,
        h("div", { class: "buttons" }, [
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => dialog.close() }, "Abbrechen"),
          h("button", { type: "submit", class: danger ? "btn btn-danger" : "btn", value: "ok" }, ok),
        ]),
      ])
    );
    dialog.returnValue = "";
    // Tipp daneben = Abbrechen (Block statt &&: gibt ein onclick false zurück, bricht der Browser jeden Klick im Dialog ab)
    dialog.onclick = (e) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
    dialog.showModal();
    input?.focus();
  });
}

export async function ask(question, { value = "", placeholder = "", ok = "OK" } = {}) {
  const input = h("input", { type: "text", class: "field", value, placeholder, maxlength: 80, autocomplete: "off", enterkeyhint: "done", "aria-label": question });
  // Enter = OK, auch wo das Formular nicht von selbst abschickt
  input.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && (e.preventDefault(), $("#ask").close("ok")));
  return (await open(question, { input, ok })) ? input.value : null;
}

export const confirmDialog = (text, { ok = "OK", danger = false } = {}) => open(text, { ok, danger });
