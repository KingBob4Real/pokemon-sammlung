import { MAX_IMAGE_CHARS } from "../config.js";

// Prüft eine Scan-Anfrage: { image: "data:image/jpeg;base64,…" } (oder PNG).
export function parseScanRequest(body) {
  const image = body?.image;
  if (typeof image === "string" && image.length > MAX_IMAGE_CHARS) return { ok: false, status: 413, error: "Foto zu groß – bitte nochmal." };
  if (typeof image !== "string" || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(image)) {
    return { ok: false, status: 400, error: "Bitte ein Foto als JPEG oder PNG schicken." };
  }
  return { ok: true, image };
}
