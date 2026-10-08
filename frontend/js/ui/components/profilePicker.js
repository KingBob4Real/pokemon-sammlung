import { h, ICONS } from "../../core/dom.js";

const COLORS = ["#e8443a", "#3b7fd6", "#3a9a48", "#f0a020", "#8e5bd8", "#e0609a"];
const CHOSEN = "ps.profileChosen"; // pro Sitzung nur einmal fragen (nicht nach jedem Update-Neuladen)

export const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();
export const avatarColor = (index) => COLORS[index % COLORS.length];

export function chosenThisSession() {
  try {
    return sessionStorage.getItem(CHOSEN) === "1";
  } catch {
    return false;
  }
}

function markChosen() {
  try {
    sessionStorage.setItem(CHOSEN, "1");
  } catch {
    /* privater Modus: dann fragt die App eben beim nächsten Start wieder */
  }
}

/**
 * „Wer sammelt?“ – die Personen auf diesem Gerät zum Antippen, wie die Profilauswahl bei Netflix.
 * Antippen = wechseln (die App lädt mit deren Daten neu). „Person hinzufügen“ fragt einmal den Sync-Schlüssel ab.
 *   start – beim App-Start: ohne Schließen-Knopf; auf einem neuen Gerät mit „Ohne Sync weiter“
 */
export function showProfiles(ctx, { start = false } = {}) {
  const { profiles, sync } = ctx;
  const dialog = h("dialog", { class: "profiles", "aria-label": "Person wählen" });
  let editing = false;

  const done = () => {
    markChosen();
    dialog.close();
  };
  const switchTo = (id) => {
    markChosen();
    profiles.switchTo(id);
    location.reload(); // neu starten, damit alles mit den Daten (und dem Schlüssel) dieser Person läuft
  };
  const choose = (id) => (id === profiles.active ? done() : switchTo(id));

  const key = h("input", { type: "text", class: "field", placeholder: "Sync-Schlüssel, z. B. ABCD-1234", "aria-label": "Sync-Schlüssel", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", enterkeyhint: "go" });
  const note = h("p", { class: "field-note", role: "alert" });
  const addButton = h("button", { type: "submit", class: "btn" }, "Hinzufügen");
  const form = h("form", { class: "profiles-add", hidden: true }, [
    h("p", { class: "muted" }, "Jede Person hat ihren eigenen Sync-Schlüssel. Auf diesem Gerät musst du ihn nur einmal eingeben."),
    h("div", { class: "toolbar tight" }, [key, addButton]),
    note,
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    note.textContent = "";
    addButton.disabled = true;
    const result = await profiles.add(sync.config.url, key.value);
    addButton.disabled = false;
    if (result.error) {
      note.textContent = result.error;
      return key.focus();
    }
    switchTo(result.id); // auch die gerade aktive: ihr Schlüssel ist neu
  });

  const grid = h("div", { class: "profiles-grid" });
  const draw = () => {
    grid.replaceChildren(
      ...profiles.list.map((p, i) => {
        const current = p.id === profiles.active;
        const remove = editing && !current;
        return h("button", {
          type: "button",
          class: `profile${current ? " is-current" : ""}${remove ? " is-removable" : ""}`,
          "aria-label": remove ? `${p.name} von diesem Gerät entfernen` : `${p.name}${current ? " (aktuell)" : ""}`,
          onclick: () => {
            if (!remove) return choose(p.id);
            if (!confirm(`${p.name} von diesem Gerät entfernen? Im Backend bleibt alles, mit dem Schlüssel ist die Person jederzeit wieder da.`)) return;
            profiles.remove(p.id);
            draw();
          },
        }, [h("span", { class: "profile-avatar", style: `background:${avatarColor(i)}`, html: remove ? ICONS.close : "" }, remove ? [] : initial(p.name)), h("span", { class: "profile-name" }, p.name)]);
      }),
      h("button", {
        type: "button",
        class: "profile",
        onclick: () => {
          form.hidden = false;
          key.focus();
        },
      }, [h("span", { class: "profile-avatar profile-plus" }, "+"), h("span", { class: "profile-name" }, "Person hinzufügen")])
    );
  };

  const others = profiles.list.some((p) => p.id !== profiles.active);
  dialog.append(
    h("div", { class: "profiles-inner" }, [
      h("h1", {}, "Wer sammelt?"),
      grid,
      form,
      h("div", { class: "buttons center" }, [
        others ? h("button", { type: "button", class: "btn btn-ghost", onclick: (e) => ((editing = !editing), (e.target.textContent = editing ? "Fertig" : "Bearbeiten"), draw()) }, "Bearbeiten") : null,
        start && !profiles.list.length ? h("button", { type: "button", class: "btn btn-ghost", onclick: done }, "Ohne Sync weiter") : null,
        start ? null : h("button", { type: "button", class: "btn btn-ghost", onclick: done }, "Abbrechen"),
      ]),
    ])
  );
  // Escape: bleibt bei der aktuellen Person
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    done();
  });
  dialog.addEventListener("close", () => dialog.remove());
  draw();
  document.body.append(dialog);
  dialog.showModal();
}
