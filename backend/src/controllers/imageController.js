import { CORS_HEADERS, error } from "../http/responses.js";
import { parseImageRequest } from "../validation/imageValidator.js";

const MONTH_S = 30 * 24 * 60 * 60;

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
    if (!res?.ok || !res.headers.get("Content-Type")?.startsWith("image/")) return error(404, "Bild nicht gefunden");
    return new Response(res.body, { headers: { ...CORS_HEADERS, "Content-Type": res.headers.get("Content-Type"), "Cache-Control": `public, max-age=${MONTH_S}` } });
  }

  // TCGdex-Karte → TCGplayer-Produktnummer → Foto (klein 200 px breit, groß bis 1000 px)
  async #tcgplayerUrl({ card, size }) {
    const res = await fetch(`${this.tcgdex}/cards/${encodeURIComponent(card)}`);
    const id = res.ok && (await res.json()).variants_detailed?.map((v) => v.thirdParty?.tcgplayer).find(Boolean);
    return id ? `${this.tcgplayer}/${id}_${size === "LG" ? "in_1000x1000" : "200w"}.jpg` : null;
  }
}
