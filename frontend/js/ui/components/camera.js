import { h } from "../../core/dom.js";
import { AutoShutter, coverCrop, gridCells, toGray } from "../../core/image.js";

const FRAME_MARGIN = 0.06; // etwas Rand mitnehmen, falls die Karte nicht genau im Rahmen liegt
const CELL_MARGIN = 0.03; // Seite: wenig Rand, sonst liest die KI die Nummer der Nachbarkarte (gemessen)
const MAX_SIDE = 1024; // so groß geht es ohnehin ans Backend
const TICK_MS = 300; // Serie: so oft ein Vorschaubild vergleichen
const THUMB = [24, 32];
export const LAYOUTS = ["3x3", "2x2", "3x4", "4x3"]; // Spalten × Zeilen einer Ordnerseite
export const layoutOf = (value) => value.split("x").map(Number); // „3x4“ → [3, 4]
const MODES = { single: "Einzeln", series: "Serie", page: "Seite" };
const HINTS = {
  single: "Karte in den Rahmen – gerade, gut beleuchtet, ohne Spiegelung",
  series: "Eine Karte nach der anderen in den Rahmen – kurz ruhig halten",
  page: "Ganze Seite in den Rahmen, Fächer auf die Linien",
};

// Ausschnitt rect aus video/Bild → JPEG (längste Seite höchstens MAX_SIDE)
export function cut(source, rect) {
  const scale = Math.min(1, MAX_SIDE / Math.max(rect.width, rect.height));
  const canvas = h("canvas", { width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) });
  canvas.getContext("2d").drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

// Seite (rect im Bild) → ein JPEG pro Fach
export const cutCells = (source, rect, layout, bounds) => Promise.all(gridCells(rect, ...layoutOf(layout), CELL_MARGIN, bounds).map((r) => cut(source, r)));

/**
 * Live-Kamera mit Rahmen. Aufgenommen wird nur der Bereich im Rahmen – die Karte ist groß im Bild.
 *   single – ein Foto, dann geht die Kamera aus:        onPhoto(file)
 *   series – Kamera bleibt an, löst auch selbst aus:     onShot(blob, { auto })
 *   page   – ganze Ordnerseite, ein Bild pro Fach:       onPage(blobs)
 *   onMode(mode, layout), onCancel(), onPick() („Foto wählen“), onUnavailable(e)
 *   tray – Element über dem Auslöser (Liste der Serie)
 * start() fragt die Kamera an; stop() gibt sie frei – auch von selbst, wenn die App in den Hintergrund geht.
 * setRemaining(n) zeigt die übrigen Scans; bei 0 ist der Auslöser aus. lockSingle(true): „Einzeln“ gesperrt.
 */
export function cameraView({ mode = "single", layout = "3x3", tray = null, onPhoto, onShot, onPage, onMode, onCancel, onPick, onUnavailable }) {
  const video = h("video", { playsinline: true, muted: true, autoplay: true, "aria-hidden": "true" });
  const frame = h("div", { class: "camera-frame" });
  const flash = h("div", { class: "camera-flash", "aria-hidden": "true" });
  const hint = h("p", { class: "camera-hint" });
  const left = h("p", { class: "camera-left", "aria-live": "polite" });
  const shutter = h("button", { type: "button", class: "camera-shutter", "aria-label": "Foto aufnehmen", disabled: true });
  const auto = h("input", { type: "checkbox", checked: true });
  const autoLabel = h("label", { class: "camera-chip" }, [auto, "Auto"]);
  const grid = h("select", { class: "camera-chip", "aria-label": "Fächer pro Seite (Spalten × Zeilen)" }, LAYOUTS.map((l) => h("option", { value: l, selected: l === layout }, l.replace("x", " × "))));
  const modeButtons = Object.entries(MODES).map(([m, label]) => h("button", { type: "button", class: "camera-mode", "data-mode": m, onclick: () => setMode(m) }, label));
  const el = h("div", { class: "camera" }, [
    video,
    flash,
    h("div", { class: "camera-top" }, [h("div", { class: "camera-row" }, [h("div", { class: "camera-modes", role: "group", "aria-label": "Art des Scans" }, modeButtons), autoLabel, grid]), hint]),
    h("div", { class: "camera-stage" }, [frame]),
    h("div", { class: "camera-bottom" }, [
      tray,
      h("div", { class: "camera-bar" }, [
        h("button", { type: "button", class: "camera-side", onclick: () => (stop(), onCancel()) }, "Abbrechen"),
        h("div", { class: "camera-shoot" }, [shutter, left]),
        h("button", { type: "button", class: "camera-side", onclick: () => onPick(mode, layout) }, "Foto wählen"),
      ]),
    ]),
  ]);
  const shutterAuto = new AutoShutter();
  const thumbCanvas = h("canvas", { width: THUMB[0], height: THUMB[1] });
  let stream = null;
  let active = false; // zwischen start() und stop()
  let starting = false; // Anfrage an die Kamera läuft
  let timer = null;
  let blocked = false; // Tageslimit erreicht
  let seenSince = 0; // Serie: was nach dem Öffnen/Wechseln schon im Rahmen liegt (z. B. die eben gespeicherte Karte), gilt als gesehen

  function setMode(next, notify = true) {
    mode = next;
    el.dataset.mode = mode;
    const [cols, rows] = layoutOf(mode === "page" ? layout : "1x1");
    el.style.setProperty("--ratio", (cols * 63) / (rows * 88));
    el.style.setProperty("--cols", cols);
    el.style.setProperty("--rows", rows);
    hint.textContent = HINTS[mode];
    autoLabel.hidden = mode !== "series";
    grid.hidden = mode !== "page";
    for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    seenSince = performance.now();
    if (notify) onMode?.(mode, layout);
  }
  grid.addEventListener("change", () => {
    layout = grid.value;
    setMode(mode);
  });

  // Rahmen auf dem Bildschirm → Ausschnitt im Video (Video-Pixel)
  const frameRect = (margin) => coverCrop(video.getBoundingClientRect(), frame.getBoundingClientRect(), { width: video.videoWidth, height: video.videoHeight }, margin);

  function thumb() {
    const r = frameRect(0);
    const ctx = thumbCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, ...THUMB);
    return toGray(ctx.getImageData(0, 0, ...THUMB).data);
  }

  async function capture(isAuto = false) {
    if (!video.videoWidth || shutter.disabled) return;
    const m = mode;
    navigator.vibrate?.(10);
    flash.classList.remove("on");
    void flash.offsetWidth;
    flash.classList.add("on"); // kurzes Blitzen (am iPhone gibt es kein Vibrieren)
    if (m === "page") return onPage(await cutCells(video, frameRect(0), layout, { width: video.videoWidth, height: video.videoHeight }));
    if (!isAuto && m === "series") shutterAuto.shot(thumb());
    const blob = await cut(video, frameRect(FRAME_MARGIN));
    if (m === "single") {
      stop();
      onPhoto(new File([blob], "karte.jpg", { type: "image/jpeg" }));
    } else onShot(blob, { auto: isAuto });
  }

  function tick() {
    if (mode !== "series" || !auto.checked || shutter.disabled || !video.videoWidth) return;
    const now = performance.now();
    if (seenSince && now - seenSince > 2 * TICK_MS) {
      seenSince = 0;
      return shutterAuto.shot(thumb());
    }
    if (!seenSince && shutterAuto.push(thumb(), now)) capture(true);
  }

  // Kamera freigeben (Hintergrund) – acquire() holt sie zurück
  function release() {
    clearInterval(timer);
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
    shutter.disabled = true;
  }

  // Kamera anfragen – nie zweimal gleichzeitig; kommt sie erst nach stop() oder im Hintergrund, sofort wieder aus
  async function acquire() {
    if (stream || starting) return;
    starting = true;
    let next;
    try {
      // hohe Auflösung: auf einer ganzen Seite ist jede Karte klein (gemessen: 1080p liest die Nummern oft falsch, 4K nicht)
      next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
    } catch (e) {
      starting = false;
      if (active) (stop(), onUnavailable(e));
      return;
    }
    starting = false;
    if (!active || !el.isConnected || document.hidden) return next.getTracks().forEach((t) => t.stop());
    stream = next;
    video.srcObject = stream;
    await video.play().catch(() => {});
    shutter.disabled = blocked;
    seenSince = performance.now();
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  function onVisibility() {
    if (!active || !el.isConnected) return stop();
    if (document.hidden) release();
    else acquire();
  }

  function start() {
    active = true;
    document.addEventListener("visibilitychange", onVisibility);
    return acquire();
  }

  function stop() {
    active = false;
    release();
    document.removeEventListener("visibilitychange", onVisibility);
  }

  shutter.addEventListener("click", () => capture());
  setMode(mode, false);

  return {
    el,
    start,
    stop,
    setRemaining(n) {
      if (n == null) return;
      blocked = n <= 0;
      if (stream) shutter.disabled = blocked;
      left.textContent = blocked ? "Tageslimit erreicht" : `Noch ${n} ${n === 1 ? "Scan" : "Scans"} heute`;
    },
    lockSingle(locked) {
      modeButtons[0].disabled = locked;
    },
    // Automatik aus (z. B. mehrmals nichts erkannt) – Antippen geht weiter
    pauseAuto() {
      auto.checked = false;
    },
  };
}
