/**
 * Erkennt eine neue Version der App: holt index.html frisch und vergleicht die Versionsnummer von main.js (?v=).
 * Wichtig für die iPhone-App vom Home-Bildschirm – die hat keinen Neu-laden-Knopf.
 * Pro Version wird höchstens einmal neu geladen, damit es bei schlechtem Netz keine Schleife gibt.
 */
export class UpdateService {
  constructor(currentVersion, sessionStore = sessionStorage) {
    this.currentVersion = currentVersion;
    this.sessionStore = sessionStore;
  }

  // → neuere Versionsnummer oder null
  async latestVersion() {
    if (!navigator.onLine || !this.currentVersion) return null;
    try {
      const html = await (await fetch("./", { cache: "no-store" })).text();
      const latest = html.match(/js\/main\.js\?v=(\d+)/)?.[1];
      return latest && latest !== this.currentVersion ? latest : null;
    } catch {
      return null;
    }
  }

  // Neue Version da? Dann einmal neu laden. → true, wenn neu geladen wird
  async reloadIfUpdated() {
    const latest = await this.latestVersion();
    let alreadyTried = false;
    try {
      alreadyTried = this.sessionStore.getItem("ps.reloadedFor") === latest;
      if (latest) this.sessionStore.setItem("ps.reloadedFor", latest);
    } catch {
      /* Privatmodus */
    }
    if (!latest || alreadyTried) return false;
    location.reload();
    return true;
  }
}
