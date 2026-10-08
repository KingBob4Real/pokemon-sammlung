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

function markChosen() {
  try {
    sessionStorage.setItem(CHOSEN, "1");
  } catch {
    /* privater Modus: dann fragt die App eben beim nächsten Start wieder */
  }
}

/**
 * „Wer sammelt?“ – alle Personen zum Antippen, wie die Profilauswahl bei Netflix.
 * Antippen = wechseln (die App lädt mit deren Daten neu); mit Schloss = erst das Passwort.
 *   start – beim ersten Öffnen auf einem Gerät: ohne „Abbrechen“, dafür „Später“
 */
export function showProfiles(ctx, { start = false } = {}) {
  const { profiles } = ctx;
  const dialog = h("dialog", { class: "profiles", "aria-label": "Person wählen" });
  const grid = h("div", { class: "profiles-grid" });
  const info = h("p", { class: "muted" });
  let asking = null; // Person, deren Passwort gerade gefragt ist
  let switched = false; // schon gewechselt (nur noch Passwort-Angebot offen) → beim Schließen neu laden

  const done = () => {
    markChosen();
    if (switched) return location.reload();
    dialog.close();
  };

  const password = h("input", { type: "password", class: "field", placeholder: "Passwort", "aria-label": "Passwort", autocomplete: "current-password", enterkeyhint: "go" });
  const note = h("p", { class: "field-note", role: "alert" });
  const go = h("button", { type: "submit", class: "btn" }, "Weiter");
  const form = h("form", { class: "toolbar tight profiles-add", hidden: true }, [password, go]);

  async function choose(person, pw = "") {
    if (person.id === profiles.active) return done();
    note.textContent = "";
    go.disabled = true;
    const result = await profiles.choose(person.id, pw);
    go.disabled = false;
    if (result.needPassword) {
      asking = person;
      draw();
      form.hidden = false;
      password.value = "";
      return password.focus();
    }
    if (result.error) {
      note.textContent = result.error;
      return asking && password.select();
    }
    markChosen();
    switched = true;
    if (result.firstLogin) return offerPassword(person);
    location.reload(); // neu starten, damit alles mit den Daten dieser Person läuft
  }

  // Zum ersten Mal da und ohne Passwort: eins anbieten (freiwillig). Ändern geht später nur mit diesem.
  function offerPassword(person) {
    const fresh = h("input", { type: "password", class: "field", placeholder: "Neues Passwort (mind. 4 Zeichen)", "aria-label": "Neues Passwort", autocomplete: "new-password", enterkeyhint: "done" });
    const hint = h("p", { class: "field-note", role: "alert" });
    const save = h("button", { type: "submit", class: "btn" }, "Festlegen");
    const setForm = h("form", { class: "toolbar tight profiles-add" }, [fresh, save]);
    setForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      const result = await profiles.setPassword(fresh.value);
      save.disabled = false;
      if (result.error) {
        hint.textContent = result.error;
        return fresh.select();
      }
      location.reload();
    });
    inner.replaceChildren(
      h("h1", {}, `Hallo, ${person.name}!`),
      h("p", { class: "profiles-text" }, "Möchtest du ein Passwort festlegen? Dann kann nur, wer es kennt, dein Profil öffnen. Ändern oder entfernen geht später nur mit diesem Passwort."),
      setForm,
      hint,
      h("div", { class: "buttons center" }, [h("button", { type: "button", class: "btn btn-ghost", onclick: () => location.reload() }, "Ohne Passwort weiter")])
    );
    fresh.focus();
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (asking) choose(asking, password.value);
  });

  function draw() {
    const people = profiles.people;
    info.textContent = people.length ? "" : "Die Personen werden geladen … (beim ersten Mal braucht es Internet)";
    grid.replaceChildren(
      ...people.map((p, i) =>
        h("button", {
          type: "button",
          class: `profile${p.id === profiles.active ? " is-current" : ""}${asking?.id === p.id ? " is-asking" : ""}`,
          "aria-label": `${p.name}${p.locked ? " (mit Passwort)" : ""}${p.id === profiles.active ? " (aktuell)" : ""}`,
          onclick: () => {
            asking = null;
            form.hidden = true;
            choose(p);
          },
        }, [
          h("span", { class: "profile-avatar", style: `background:${avatarColor(i)}` }, [initial(p.name), p.locked ? h("span", { class: "profile-lock", "aria-hidden": "true" }, "🔒") : null]),
          h("span", { class: "profile-name" }, p.name),
        ])
      )
    );
  }

  const inner = h("div", { class: "profiles-inner" }, [
    h("h1", {}, "Wer sammelt?"),
    grid,
    form,
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
  // Liste auffrischen (neue Namen, Schloss gesetzt?), dann neu zeichnen
  profiles.refresh().then((ok) => {
    if (!dialog.isConnected) return;
    if (!ok && !profiles.people.length) info.textContent = "Keine Verbindung – zum ersten Mal braucht es Internet.";
    draw();
  });
}
