import { CORS_HEADERS, error } from "../http/responses.js";
import { parseImageRequest } from "../validation/imageValidator.js";

const MONTH_S = 30 * 24 * 60 * 60;
// nur Rasterbilder durchreichen – kein SVG (könnte Skript enthalten), nosniff gegen Umdeuten durch den Browser
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Kartenbild von Limitless TCG oder TCGplayer durchreichen – mit CORS-Header, damit die App es wie alle anderen Bilder
// (crossorigin) laden und der Service Worker es offline speichern kann. Fehlt das Bild dort: 404 → nächste Quelle bzw. Platzhalter.
export class ImageController {
  constructor({ limitless, tcgdex, tcgplayer }) {
    this.limitless = limitless;
    this.tcgdex = tcgdex;
    this.tcgplayer = tcgplayer;
  }

  async image(request) {
    const img = parseImageRequest(request.url);
    if (!img) return error(400, "Ungültiges Bild");
    const url = img.card ? await this.#tcgplayerUrl(img) : `${this.limitless}/${img.set}/${img.set}_${img.n}_R_EN_${img.size}.png`;
    const res = url && (await fetch(url));
    const type = res?.ok && res.headers.get("Content-Type")?.split(";")[0].trim();
    if (!IMAGE_TYPES.includes(type)) return error(404, "Bild nicht gefunden");
    return new Response(res.body, { headers: { ...CORS_HEADERS, "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": `public, max-age=${MONTH_S}` } });
  }

  // TCGdex-Karte → TCGplayer-Produktnummer → Foto (klein 200 px breit, groß bis 1000 px)
  async #tcgplayerUrl({ card, size }) {
    const res = await fetch(`${this.tcgdex}/cards/${encodeURIComponent(card)}`);
    // nur eine reine Zahl landet in der Adresse
    const id = res.ok && (await res.json()).variants_detailed?.map((v) => v.thirdParty?.tcgplayer).find((n) => /^\d{1,12}$/.test(String(n)));
    return id ? `${this.tcgplayer}/${id}_${size === "LG" ? "in_1000x1000" : "200w"}.jpg` : null;
  }
}
