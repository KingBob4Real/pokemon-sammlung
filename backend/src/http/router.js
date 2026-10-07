import { error, preflight } from "./responses.js";

// Ordnet „Methode + Pfad“ einem Handler zu. CORS-Vorabanfragen und Fehler werden hier einheitlich behandelt.
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
    const handler = this.#routes.get(`${request.method} ${new URL(request.url).pathname}`);
    if (!handler) return error(404, "Nicht gefunden");
    try {
      return await handler(request);
    } catch (e) {
      console.error(e);
      return error(500, "Serverfehler");
    }
  }
}
