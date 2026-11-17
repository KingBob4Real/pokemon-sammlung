import { requestUser } from "./auth.js";
import { log } from "./log.js";
import { error, preflight } from "./responses.js";

// Ordnet „Methode + Pfad“ einem Handler zu. CORS-Vorabanfragen und Fehler werden hier einheitlich behandelt,
// jede Anfrage landet mit Status, Dauer und Person im Protokoll (Kartenbilder nur, wenn etwas schiefgeht).
export class Router {
  #routes = new Map();

  get(path, handler) {
    this.#routes.set(`GET ${path}`, handler);
    return this;
  }

  post(path, handler) {
    this.#routes.set(`POST ${path}`, handler);
    return this;
  }

  async handle(request) {
    if (request.method === "OPTIONS") return preflight();
    const path = new URL(request.url).pathname;
    const handler = this.#routes.get(`${request.method} ${path}`);
    const started = Date.now();
    let response;
    try {
      response = handler ? await handler(request) : error(404, "Nicht gefunden");
    } catch (e) {
      log("error", "crash", { method: request.method, path, message: String(e?.message ?? e), stack: String(e?.stack ?? "").slice(0, 2000) });
      response = error(500, "Serverfehler");
    }
    if (!(path === "/img" && response.ok)) {
      const user = requestUser.get(request);
      const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";
      log(level, "request", {
        method: request.method,
        path,
        status: response.status,
        ms: Date.now() - started,
        user: user?.id ?? null,
        auth: user ? (user.session ? "session" : "sync_key") : null,
      });
    }
    return response;
  }
}
