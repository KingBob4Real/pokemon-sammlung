import { h } from "../../core/dom.js";

const COLORS = ["#e8443a", "#3b7fd6", "#3a9a48", "#f0a020", "#8e5bd8", "#e0609a"];
const CHOSEN = "ps.profileChosen"; // nach „Später“ in dieser Sitzung nicht nochmal fragen

export const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();
export const avatarColor = (index) => COLORS[Math.max(0, index) % COLORS.length];

export function chosenThisSession() {
  try {
    return sessionStorage.getItem(CHOSEN) === "1";
  } catch {
    return false;
  }
}

// Nach dem Abmelden: beim nächsten Start wieder fragen, wer sammelt
export function forgetChoice() {
  try {
    sessionStorage.removeItem(CHOSEN);
  } catch {
    /* privater Modus: dann fragt die App ohnehin */
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
 * „Wer sammelt?“ – alle Personen zum Antippen, wie die Profilauswahl bei Netflix.
 * Antippen = wechseln (die App lädt mit deren Daten neu).
 *   start – beim ersten Öffnen auf einem Gerät: ohne „Abbrechen“, dafür „Später“
 */
export function showProfiles(ctx, { start = false } = {}) {
  const { profiles } = ctx;
  const dialog = h("dialog", { class: "profiles", "aria-label": "Person wählen" });
  const grid = h("div", { class: "profiles-grid" });
  const info = h("p", { class: "muted" });

  const done = () => {
    markChosen();
    dialog.close();
  };

  const note = h("p", { class: "field-note", role: "alert" });

  async function choose(person) {
    if (person.id === profiles.active) return done();
    note.textContent = "";
    const result = await profiles.choose(person.id);
    if (result.error) {
      note.textContent = result.error;
      return;
    }
    markChosen();
    location.reload(); // neu starten, damit alles mit den Daten dieser Person läuft
  }

  function draw() {
    const people = profiles.people;
    info.textContent = people.length ? "" : "Die Personen werden geladen … (beim ersten Mal braucht es Internet)";
    grid.replaceChildren(
      ...people.map((p, i) =>
        h("button", {
          type: "button",
          class: `profile${p.id === profiles.active ? " is-current" : ""}`,
          "aria-label": `${p.name}${p.id === profiles.active ? " (aktuell)" : ""}`,
          onclick: () => choose(p),
        }, [
          h("span", { class: "profile-avatar", style: `background:${avatarColor(i)}` }, initial(p.name)),
          h("span", { class: "profile-name" }, p.name),
        ])
      )
    );
  }

  const inner = h("div", { class: "profiles-inner" }, [
    h("h1", {}, "Wer sammelt?"),
    grid,
    note,
    info,
    h("div", { class: "buttons center" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: done }, start ? "Später" : "Abbrechen")]),
  ]);
  dialog.append(inner);
  // Escape: bleibt bei der aktuellen Person
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    done();
  });
  dialog.addEventListener("close", () => dialog.remove());
  draw();
  document.body.append(dialog);
  dialog.showModal();
  // Liste auffrischen (neue Namen?), dann neu zeichnen
  profiles.refresh().then((ok) => {
    if (!dialog.isConnected) return;
    if (!ok && !profiles.people.length) info.textContent = "Keine Verbindung – zum ersten Mal braucht es Internet.";
    draw();
  });
}
