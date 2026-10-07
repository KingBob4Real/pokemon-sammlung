import { h } from "../../core/dom.js";
import { deliverFile } from "../../core/files.js";
import { fmtDateTime, plural } from "../../core/format.js";
import { panel } from "../components/widgets.js";

// Ansicht „Mehr“: Sync einrichten, Sicherung, alte Checkliste übernehmen, Hinweise zu Preisen
export function render(main, ctx) {
  const { sync, backup, legacyImport } = ctx;
  ctx.setTitle("Mehr");

  // --- Sync ---
  const url = h("input", { type: "url", class: "field", value: sync.config.url, placeholder: "https://pokemon-sammlung.….workers.dev", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const key = h("input", { type: "password", class: "field", value: sync.config.key, placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
  const status = h("p", { class: "muted" });
  const showKey = () => (key.type = key.type === "password" ? "text" : "password");
  const copyKey = () => navigator.clipboard?.writeText(key.value).then(() => (status.textContent = "Schlüssel kopiert."), () => {});
  const save = () => {
    // anderer Schlüssel = andere Person → Daten dieses Geräts gehören nicht dazu
    if (sync.isOtherKey(key.value) && !ctx.store.isEmpty && !confirm("Das ist ein anderer Schlüssel. Die Daten auf diesem Gerät werden entfernt und durch die der neuen Person ersetzt (im Backend bleibt alles erhalten). Weiter?")) return;
    sync.configure(url.value, key.value).then(() => (key.value = sync.config.key));
  };

  // --- Sicherung ---
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  file.addEventListener("change", async () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen) return;
    alert(await backup.importFile(chosen).catch(() => "Import fehlgeschlagen. Bitte mit Internet nochmal versuchen."));
    ctx.render();
  });

  // --- Alte Checkliste ---
  const legacy = legacyImport.readLocal();
  const importLegacy = async () => {
    try {
      const r = await legacyImport.import(legacy);
      alert(`Übernommen: ${plural(r.cards, "Karte", "Karten")} in die Sammlung, ${plural(r.lists, "neue Liste", "neue Listen")}.`);
    } catch {
      alert("Die alte Checkliste ist gerade nicht erreichbar. Bitte mit Internet nochmal versuchen.");
    }
    ctx.render();
  };

  main.append(
    panel("Sync zwischen Geräten", [
      h("p", {}, "Jede Person hat einen eigenen Schlüssel und damit eine eigene Sammlung. Trag deinen Schlüssel auf jedem deiner Geräte einmal ein, dann sind Sammlung und Listen überall gleich."),
      h("label", { class: "label" }, ["Backend-Adresse", url]),
      h("label", { class: "label" }, ["Sync-Schlüssel", h("div", { class: "toolbar tight" }, [key, h("button", { type: "button", class: "btn btn-ghost", onclick: showKey }, "Anzeigen")])]),
      h("div", { class: "buttons" }, [
        h("button", { type: "button", class: "btn", onclick: save }, "Speichern & synchronisieren"),
        h("button", { type: "button", class: "btn btn-ghost", onclick: copyKey }, "Schlüssel kopieren"),
      ]),
      status,
    ]),
    panel("Sicherung", [
      h("p", {}, "Alle Daten als Datei sichern oder eine Sicherung zurückholen. Import nimmt auch die Export-Datei der alten Checkliste."),
      h("div", { class: "buttons" }, [h("button", { type: "button", class: "btn", onclick: () => deliverFile(backup.createFile()) }, "Export (JSON)"), h("label", { class: "btn btn-ghost" }, ["Import (JSON)", file])]),
    ]),
    panel("Alte Checkliste übernehmen", [
      h("p", {}, "Legt für jede Gruppe der alten Checkliste eine Liste an und übernimmt abgehakte Karten samt „Mein Preis“ als Kaufpreis in die Sammlung. Mehrfach ausführen ist ok, es entsteht nichts doppelt."),
      legacy
        ? h("button", { type: "button", class: "btn", onclick: importLegacy }, `Aus diesem Browser übernehmen (${legacy.owned.length} abgehakt)`)
        : h("p", { class: "muted" }, "In diesem Browser ist keine alte Checkliste gespeichert. Exportiere sie dort und wähle die Datei oben bei „Import“."),
    ]),
    panel("Zu den Preisen", [
      h("p", {}, "Der Marktwert ist der Cardmarket-Trend aus der TCGdex-API. Er mischt alle Sprachen und Zustände. Echte Preise für deutsche Karten ab Excellent zeigt der Cardmarket-Link in der Kartenansicht."),
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
    case "busy":
      return "Synchronisiere …";
    case "error":
      return `Fehler: ${sync.config.error}`;
    default: {
      const who = sync.config.user ? `Verbunden als ${sync.config.user} · ` : "";
      return sync.config.at ? `${who}Zuletzt synchronisiert: ${fmtDateTime(sync.config.at)}${pending}` : `Noch nicht synchronisiert${pending}`;
    }
  }
}
