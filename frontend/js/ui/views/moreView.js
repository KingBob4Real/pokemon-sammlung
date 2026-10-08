import { h } from "../../core/dom.js";
import { deliverFile } from "../../core/files.js";
import { describeError } from "../../core/errors.js";
import { fmtDateTime, plural } from "../../core/format.js";
import { panel } from "../components/widgets.js";

// Ansicht „Mehr“: Sync einrichten, Sicherung, alte Checkliste übernehmen, Hinweise zu Preisen
export function render(main, ctx) {
  const { sync, backup, legacyImport, updates } = ctx;
  ctx.setTitle("Mehr");

  // --- Sync ---
  const key = h("input", { type: "password", class: "field", value: sync.config.key, placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
  const status = h("p", { class: "muted" });
  const keyNote = h("p", { class: "field-note", role: "alert" });
  const showKey = () => (key.type = key.type === "password" ? "text" : "password");
  const copyKey = () => navigator.clipboard?.writeText(key.value).then(() => (status.textContent = "Schlüssel kopiert."), () => {});
  const save = () => {
    // anderer Schlüssel = andere Person → Daten dieses Geräts gehören nicht dazu
    if (sync.isOtherKey(key.value) && !ctx.store.isEmpty) {
      const unsaved = sync.pendingCount ? `

Achtung: ${plural(sync.pendingCount, "Änderung ist", "Änderungen sind")} noch nicht hochgeladen und gehen dabei verloren.` : "";
      if (!confirm(`Das ist ein anderer Schlüssel. Die Daten auf diesem Gerät werden durch die der neuen Person ersetzt (im Backend bleibt alles erhalten).${unsaved}

Weiter?`)) return;
    }
    keyNote.textContent = "";
    sync.configure(key.value).then((problem) => {
      if (problem) keyNote.textContent = problem;
      else key.value = sync.config.key;
    });
  };

  // --- Sicherung ---
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  file.addEventListener("change", async () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen) return;
    try {
      const result = await backup.importFile(chosen);
      ctx.notify(result.message, { type: result.ok ? "success" : "error" });
    } catch (e) {
      ctx.notifyError(e, { prefix: "Import fehlgeschlagen: " });
    }
    ctx.render();
  });

  // --- Alte Checkliste ---
  const legacy = legacyImport.readLocal();
  const importLegacy = async () => {
    try {
      const r = await legacyImport.import(legacy);
      ctx.notify(`Übernommen: ${plural(r.cards, "Karte", "Karten")} in die Sammlung, ${plural(r.lists, "neue Liste", "neue Listen")}.`, { type: "success" });
    } catch (e) {
      ctx.notifyError(e, { prefix: "Die alte Checkliste ist gerade nicht erreichbar. ", retry: importLegacy });
    }
    ctx.render();
  };

  main.append(
    accountPanel(ctx),
    panel("Sync zwischen Geräten", [
      h("p", {}, "Anmelden geht oben unter „Wer sammelt?“ per Antippen. Hier nur, falls du lieber deinen Sync-Schlüssel nutzt – er gilt immer, auch wenn du dein Passwort vergessen hast."),
      h("label", { class: "label" }, ["Sync-Schlüssel", h("div", { class: "toolbar tight" }, [key, h("button", { type: "button", class: "btn btn-ghost", onclick: showKey }, "Anzeigen")])]),
      keyNote,
      h("div", { class: "buttons" }, [
        h("button", { type: "button", class: "btn", onclick: save }, "Speichern & synchronisieren"),
        h("button", { type: "button", class: "btn btn-ghost", onclick: copyKey }, "Schlüssel kopieren"),
      ]),
      status,
    ]),
    panel("Sicherung", [
      h("p", {}, "Alle Daten als Datei sichern oder eine Sicherung zurückholen. Import nimmt auch die Export-Datei der alten Checkliste."),
      h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn", onclick: () => deliverFile(backup.createFile()).then((ok) => ok && ctx.notify("Sicherung erstellt.", { type: "success" })) }, "Export (JSON)"), h("label", { class: "btn btn-ghost" }, ["Import (JSON)", file])]),
    ]),
    panel("Alte Checkliste übernehmen", [
      h("p", {}, "Legt für jede Gruppe der alten Checkliste eine Liste an und übernimmt abgehakte Karten samt „Mein Preis“ als Kaufpreis in die Sammlung. Mehrfach ausführen ist ok, es entsteht nichts doppelt."),
      legacy
        ? h("button", { type: "button", class: "btn", onclick: importLegacy }, `Aus diesem Browser übernehmen (${legacy.owned.length} abgehakt)`)
        : h("p", { class: "muted" }, "In diesem Browser ist keine alte Checkliste gespeichert. Exportiere sie dort und wähle die Datei oben bei „Import“."),
    ]),
    panel("App", [
      h("p", {}, "Neue Versionen lädt die App automatisch, sobald du sie öffnest oder zu ihr zurückkehrst."),
      h("div", { class: "buttons" }, [
        h("button", {
          type: "button",
          class: "btn btn-ghost",
          onclick: async (e) => {
            if (!navigator.onLine) return ctx.notify(describeError(null).message, { type: "info" });
            const latest = await updates.latestVersion();
            if (latest) location.reload();
            else e.target.textContent = "Du hast die neueste Version ✓";
          },
        }, "Nach Update suchen"),
      ]),
      h("p", { class: "muted small" }, `Version ${updates.currentVersion || "?"}`),
    ]),
    panel("Zu den Preisen", [
      h("p", {}, "Der Marktwert ist der Cardmarket-Durchschnitt der letzten 7 Tage aus der TCGdex-API (fehlt er: 30 Tage; Trend und „ab“ zählen nicht). Er mischt alle Sprachen und Zustände. Echte Preise für Karten in deiner Sprache ab Excellent zeigt der Cardmarket-Link in der Kartenansicht."),
      h("p", { class: "muted small" }, ["Kartenbilder & Daten: ", h("a", { href: "https://tcgdex.dev", target: "_blank", rel: "noopener" }, "TCGdex"), ". Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket."]),
    ])
  );

  const refresh = () => (status.textContent = syncStatusText(sync));
  return { refresh };
}

function syncStatusText(sync) {
  const pending = sync.pendingCount ? ` · ${plural(sync.pendingCount, "Änderung wartet", "Änderungen warten")} aufs Hochladen` : "";
  switch (sync.state) {
    case "off":
      return "Sync ist aus. Deine Daten liegen nur auf diesem Gerät.";
    case "offline":
      return `Offline – Änderungen werden hochgeladen, sobald du wieder Internet hast.${pending}`;
    case "busy":
      return "Synchronisiere …";
    case "error":
      return `Problem: ${sync.config.error}`;
    default: {
      const who = sync.config.user ? `Verbunden als ${sync.config.user} · ` : "";
      return sync.config.at ? `${who}Zuletzt synchronisiert: ${fmtDateTime(sync.config.at)}${pending}` : `Noch nicht synchronisiert${pending}`;
    }
  }
}

// „Wer sammelt?“: wer angemeldet ist, Person wechseln, Name und Passwort
function accountPanel(ctx) {
  const { profiles, sync } = ctx;
  const me = profiles.people.find((p) => p.id === profiles.active);
  const switchButton = h("button", { type: "button", class: "btn", onclick: ctx.openProfiles }, "Person wechseln");
  if (!me || !sync.enabled) {
    return panel("Wer sammelt?", [h("p", {}, "Noch niemand angemeldet – Sammlung und Listen liegen nur auf diesem Gerät."), h("div", { class: "buttons" }, [switchButton])]);
  }
  const note = h("p", { class: "field-note", role: "alert" });
  const run = async (button, action, success) => {
    note.textContent = "";
    button.disabled = true;
    const result = await action();
    button.disabled = false;
    if (result.error) {
      note.textContent = result.error;
      return;
    }
    ctx.notify(success, { type: "success" });
    ctx.render();
  };

  const name = h("input", { type: "text", class: "field", value: me.name, maxlength: 40, "aria-label": "Name", autocomplete: "off", enterkeyhint: "done" });
  const renameButton = h("button", { type: "button", class: "btn btn-ghost" }, "Speichern");
  renameButton.addEventListener("click", () => run(renameButton, () => profiles.rename(name.value), "Name gespeichert."));

  const old = h("input", { type: "password", class: "field", placeholder: "Bisheriges Passwort", "aria-label": "Bisheriges Passwort", autocomplete: "current-password" });
  const fresh = h("input", { type: "password", class: "field", placeholder: "Neues Passwort (mind. 4 Zeichen)", "aria-label": "Neues Passwort", autocomplete: "new-password" });
  const setButton = h("button", { type: "button", class: "btn" }, me.locked ? "Passwort ändern" : "Passwort festlegen");
  setButton.addEventListener("click", () => run(setButton, () => profiles.setPassword(fresh.value, old.value), "Passwort gespeichert. Andere Geräte von dir sind jetzt abgemeldet."));
  const removeButton = h("button", { type: "button", class: "btn btn-ghost danger" }, "Passwort entfernen");
  removeButton.addEventListener("click", () => run(removeButton, () => profiles.setPassword("", old.value), "Passwort entfernt."));

  return panel("Wer sammelt?", [
    h("p", {}, `Angemeldet als ${me.name}.`),
    h("div", { class: "buttons" }, [switchButton]),
    h("label", { class: "label" }, ["Dein Name", h("div", { class: "toolbar tight" }, [name, renameButton])]),
    h("h3", { class: "label" }, "Passwort"),
    h("p", { class: "muted" }, me.locked ? "Dein Profil ist mit Passwort geschützt. Ändern oder entfernen geht nur mit dem bisherigen." : "Ohne Passwort kann jeder mit der App dein Profil öffnen. Mit Passwort wird es bei jedem Wechsel zu dir abgefragt."),
    me.locked ? h("label", { class: "label" }, ["Bisheriges Passwort", old]) : null,
    h("label", { class: "label" }, ["Neues Passwort", fresh]),
    note,
    h("div", { class: "buttons" }, [setButton, me.locked ? removeButton : null]),
  ]);
}
