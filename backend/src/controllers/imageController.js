import { CORS_HEADERS, error } from "../http/responses.js";
import { parseImageRequest } from "../validation/imageValidator.js";

const MONTH_S = 30 * 24 * 60 * 60;

// Kartenbild von Limitless TCG durchreichen – mit CORS-Header, damit die App es wie alle anderen Bilder
// (crossorigin) laden und der Service Worker es offline speichern kann. Fehlt das Bild dort: 404 → Platzhalter.
export class ImageController {
  constructor(base) {
    this.base = base;
  }

  async limitless(request) {
    const img = parseImageRequest(request.url);
    if (!img) return error(400, "Ungültiges Bild");
    const res = await fetch(`${this.base}/${img.set}/${img.set}_${img.n}_R_EN_${img.size}.png`);
    if (!res.ok || !res.headers.get("Content-Type")?.startsWith("image/")) return error(404, "Bild nicht gefunden");
    return new Response(res.body, { headers: { ...CORS_HEADERS, "Content-Type": res.headers.get("Content-Type"), "Cache-Control": `public, max-age=${MONTH_S}` } });
  }
}
