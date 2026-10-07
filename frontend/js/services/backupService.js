import { isObj, plural } from "../core/format.js";

// Sicherung als Datei: alles exportieren oder zurückholen. Erkennt auch den Export der alten Checkliste.
export class BackupService {
  constructor(store, legacyImport) {
    this.store = store;
    this.legacyImport = legacyImport;
  }

  createFile() {
    const payload = { app: "pokemon-sammlung", version: 2, exportedAt: new Date().toISOString(), entities: this.store.snapshot() };
    return new File([JSON.stringify(payload)], `pokemon-sammlung-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
  }

  // → { ok, message } für den Nutzer (Netzwerkfehler beim Import der alten Checkliste werden geworfen)
  async importFile(file) {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return { ok: false, message: "Diese Datei kann nicht gelesen werden. Ist es eine JSON-Sicherung?" };
    }
    if (isObj(payload) && Array.isArray(payload.owned)) {
      const r = await this.legacyImport.import(payload);
      return { ok: true, message: `Übernommen: ${plural(r.cards, "Karte", "Karten")} in die Sammlung, ${plural(r.lists, "neue Liste", "neue Listen")}.` };
    }
    if (!isObj(payload) || !Array.isArray(payload.entities)) return { ok: false, message: "Die Datei sieht nicht nach einer Sicherung dieser App aus." };
    const n = this.store.importEntities(payload.entities);
    return { ok: true, message: n ? `${plural(n, "Eintrag", "Einträge")} übernommen.` : "Nichts Neues in der Datei, dein Stand ist aktueller." };
  }
}
