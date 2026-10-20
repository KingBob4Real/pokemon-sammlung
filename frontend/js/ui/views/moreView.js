import { APP_VERSION, IS_DEV } from "../../config.js";
import { h } from "../../core/dom.js";
import { deliverFile } from "../../core/files.js";
import { describeError } from "../../core/errors.js";
import { fmtDateTime, plural } from "../../core/format.js";
import { confirmDialog } from "../components/ask.js";
import { forgetChoice } from "../components/profilePicker.js";
import { panel } from "../components/widgets.js";

// Ansicht „Mehr“: Konto & Sync-Stand (Person wechseln, abmelden), Sicherung, Hinweise zu Preisen.
// Schlüssel und Sitzungen sieht der Nutzer nie – angemeldet wird nur über „Wer sammelt?“.
export function render(main, ctx) {
  const { sync, backup, updates } = ctx;
  ctx.setTitle("Mehr");
  const status = h("p", { class: "muted" });

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

  main.append(
    accountPanel(ctx, status),
    panel("Sicherung", [
      h("p", {}, "Alle Daten als Datei sichern oder eine Sicherung zurückholen. Import nimmt auch die Export-Datei der alten Checkliste."),
      h("div", { class: "buttons" }, [
        h("button", { type: "button", class: "btn", onclick: () => deliverFile(backup.createFile()).then((ok) => ok && ctx.notify("Sicherung erstellt.", { type: "success" })) }, "Export (JSON)"),
        h("label", { class: "btn btn-ghost" }, ["Import (JSON)", file]),
      ]),
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
      h("p", { class: "muted small" }, `Version ${APP_VERSION}${IS_DEV ? " · Dev" : ""}`),
    ]),
    panel("Zu den Preisen", [
      h("p", {}, "Der Marktwert ist der Cardmarket-Durchschnitt der letzten 7 Tage aus Cardmarkets täglicher Preisliste (fehlt er: 30 Tage; Trend und „ab“ zählen nicht). Er mischt alle Sprachen und Zustände. Echte Preise für Karten in deiner Sprache ab Excellent zeigt der Cardmarket-Link in der Kartenansicht."),
      h("p", { class: "muted small" }, [
        "Kartenbilder & Daten: ",
        h("a", { href: "https://tcgdex.dev", target: "_blank", rel: "noopener" }, "TCGdex"),
        ". Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket.",
      ]),
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
      return `Problem: ${sync.config.error}${pending}`;
    default: {
      const who = sync.config.user ? `Verbunden als ${sync.config.user} · ` : "";
      return sync.config.at ? `${who}Zuletzt synchronisiert: ${fmtDateTime(sync.config.at)}${pending}` : `Noch nicht synchronisiert${pending}`;
    }
  }
}

// „Wer sammelt?“: wer angemeldet ist, Sync-Stand (status), Person wechseln, Name und Passwort
function accountPanel(ctx, status) {
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

  // Abmelden, z. B. auf einem geliehenen Handy: Sitzung beenden, Daten der Person vom Gerät, danach „Wer sammelt?“
  const logout = async () => {
    if (!me.locked) return (note.textContent = "Leg erst ein Passwort fest – ohne kommst du auf diesem Gerät nicht wieder rein.");
    const unsaved = sync.pendingCount ? ` Achtung: ${plural(sync.pendingCount, "Änderung ist", "Änderungen sind")} noch nicht hochgeladen und gehen dabei verloren.` : "";
    if (!(await confirmDialog(`Auf diesem Gerät abmelden? Deine Sammlung und Listen verschwinden von diesem Gerät, im Backend bleibt alles.${unsaved}`, { ok: "Abmelden", danger: true }))) return;
    await profiles.logout();
    forgetChoice();
    location.reload();
  };

  const name = h("input", { type: "text", class: "field", value: me.name, maxlength: 40, "aria-label": "Name", autocomplete: "off", enterkeyhint: "done" });
  const renameButton = h("button", { type: "button", class: "btn btn-ghost" }, "Speichern");
  renameButton.addEventListener("click", () => run(renameButton, () => profiles.rename(name.value), "Name gespeichert."));

  const old = h("input", { type: "password", class: "field", placeholder: "Bisheriges Passwort", "aria-label": "Bisheriges Passwort", autocomplete: "current-password" });
  const fresh = h("input", { type: "password", class: "field", placeholder: "Neues Passwort (mind. 4 Zeichen)", "aria-label": "Neues Passwort", autocomplete: "new-password" });
  const setButton = h("button", { type: "button", class: "btn" }, me.locked ? "Passwort ändern" : "Passwort festlegen");
  setButton.addEventListener("click", () => run(setButton, () => profiles.setPassword(fresh.value, old.value), me.locked ? "Passwort geändert. Andere Geräte fragen einmal nach dem neuen." : "Passwort gespeichert."));

  return panel("Wer sammelt?", [
    h("p", {}, `Angemeldet als ${me.name}.`),
    status,
    h("div", { class: "buttons" }, [switchButton, h("button", { type: "button", class: "btn btn-ghost danger", onclick: logout }, "Abmelden")]),
    h("label", { class: "label" }, ["Dein Name", h("div", { class: "toolbar tight" }, [name, renameButton])]),
    h("h3", { class: "label" }, "Passwort"),
    h("p", { class: "muted" }, me.locked ? "Dein Profil ist mit Passwort geschützt. Gefragt wird es nur auf einem neuen Gerät; ändern geht nur mit dem bisherigen." : "Du hast noch kein Passwort – ohne kommst du auf einem neuen Gerät nicht rein. Leg eins fest; gefragt wird es nur einmal pro Gerät."),
    me.locked ? h("label", { class: "label" }, ["Bisheriges Passwort", old]) : null,
    h("label", { class: "label" }, ["Neues Passwort", fresh]),
    note,
    h("div", { class: "buttons" }, [setButton]),
  ]);
}
