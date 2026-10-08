// Foto fürs Hochladen verkleinern: längste Seite maxSide Pixel, JPEG. Handyfotos stehen richtig herum (EXIF).
export async function shrinkPhoto(file, maxSide = 1024, quality = 0.8) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

// Ausschnitt im Video (Video-Pixel), der dem Rahmen auf dem Bildschirm entspricht. Das Video füllt die
// Fläche wie „object-fit: cover“. view/frame: Bildschirm-Rechtecke { left, top, width, height },
// video: { width, height }, margin: Anteil Rand rundum dazu (falls die Karte nicht genau im Rahmen liegt).
export function coverCrop(view, frame, video, margin = 0) {
  const scale = Math.max(view.width / video.width, view.height / video.height);
  const offsetX = view.left + (view.width - video.width * scale) / 2;
  const offsetY = view.top + (view.height - video.height * scale) / 2;
  const [mx, my] = [frame.width * margin, frame.height * margin];
  const x = Math.max(0, (frame.left - mx - offsetX) / scale);
  const y = Math.max(0, (frame.top - my - offsetY) / scale);
  return { x, y, width: Math.min(video.width - x, (frame.width + 2 * mx) / scale), height: Math.min(video.height - y, (frame.height + 2 * my) / scale) };
}

// Größter Ausschnitt mit Seitenverhältnis ratio (Breite / Höhe) in der Mitte eines width × height-Bilds
export function centerRect(width, height, ratio) {
  const w = Math.min(width, height * ratio);
  return { x: (width - w) / 2, y: (height - w / ratio) / 2, width: w, height: w / ratio };
}

// Ordnerseite → ein Ausschnitt pro Fach, Zeile für Zeile von oben links. rect: Seite im Bild (Pixel),
// margin: Rand pro Fach (Anteil) – klein halten, sonst liest die KI die Nummer der Nachbarkarte mit (gemessen).
// bounds: { width, height } des Bilds, darüber hinaus wird nichts ausgeschnitten.
export function gridCells(rect, cols, rows, margin, bounds) {
  const [w, h] = [rect.width / cols, rect.height / rows];
  return Array.from({ length: cols * rows }, (_, i) => {
    const [col, row] = [i % cols, Math.floor(i / cols)];
    const x = Math.max(0, rect.x + (col - margin) * w);
    const y = Math.max(0, rect.y + (row - margin) * h);
    return { x, y, width: Math.min(bounds.width, rect.x + (col + 1 + margin) * w) - x, height: Math.min(bounds.height, rect.y + (row + 1 + margin) * h) - y };
  });
}

// --- Serien-Scan: automatisch auslösen, sobald eine neue Karte ruhig im Rahmen liegt ---

// RGBA-Pixel (ImageData.data) → Graustufen
export function toGray(rgba) {
  const g = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < g.length; i++) g[i] = (rgba[4 * i] * 299 + rgba[4 * i + 1] * 587 + rgba[4 * i + 2] * 114) / 1000;
  return g;
}

// mittlerer Unterschied zweier gleich großer Graustufenbilder (0–255)
export function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Kontrast (Standardabweichung): leerer Tisch ≈ 0, eine Karte ≥ 20
export function contrast(g) {
  const mean = g.reduce((s, v) => s + v, 0) / g.length;
  return Math.sqrt(g.reduce((s, v) => s + (v - mean) ** 2, 0) / g.length);
}

// Bekommt alle ~300 ms ein Vorschaubild (24 × 32 Graustufen) und sagt, wann ausgelöst werden soll: Bild seit steadyMs
// ruhig (Unterschied < still), nicht leer (Kontrast ≥ minContrast) und deutlich anders als beim letzten Foto (> changed).
// ponytail: Schwellen an Testbildern gemessen (Wackeln ≤ 11, andere Karte ≥ 25); dieselbe Karte, nur verschoben, kann
// trotzdem auslösen (18–32) – darum verwirft der Serien-Scan eine Karte, die gleich der vorigen ist. Am iPhone nachjustieren.
export class AutoShutter {
  constructor({ still = 12, changed = 22, minContrast = 15, steadyMs = 700 } = {}) {
    Object.assign(this, { still, changed, minContrast, steadyMs, prev: null, last: null, since: 0 });
  }

  push(thumb, now) {
    const moving = !this.prev || meanDiff(this.prev, thumb) >= this.still;
    this.prev = thumb;
    if (moving) this.since = now;
    if (moving || now - this.since < this.steadyMs || contrast(thumb) < this.minContrast) return false;
    if (this.last && meanDiff(this.last, thumb) <= this.changed) return false;
    this.shot(thumb);
    return true;
  }

  // Foto gemacht (auch per Antippen): dieselbe Karte nicht gleich nochmal automatisch
  shot(thumb) {
    this.last = thumb;
  }
}
