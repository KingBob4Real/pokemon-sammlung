import { h } from "../../core/dom.js";
import { coverCrop } from "../../core/image.js";

const FRAME_MARGIN = 0.06; // etwas Rand mitnehmen, falls die Karte nicht genau im Rahmen liegt

/**
 * Live-Kamera mit Rahmen in Kartenform. Aufgenommen wird nur der Bereich im Rahmen –
 * die Karte ist so groß im Bild, Nummer und Name sind gut lesbar.
 *   onPhoto(file)    – Foto des Rahmens (JPEG)
 *   onCancel()       – Abbrechen
 *   onPick()         – „Foto wählen“: stattdessen Foto-App / Mediathek
 *   onUnavailable(e) – keine Kamera oder kein Zugriff
 * start() fragt die Kamera an, stop() gibt sie frei.
 */
export function cameraView({ onPhoto, onCancel, onPick, onUnavailable }) {
  const video = h("video", { playsinline: true, muted: true, autoplay: true, "aria-hidden": "true" });
  const frame = h("div", { class: "camera-frame" });
  const shutter = h("button", { type: "button", class: "camera-shutter", "aria-label": "Foto aufnehmen", disabled: true });
  const el = h("div", { class: "camera" }, [
    video,
    frame,
    h("p", { class: "camera-hint" }, "Karte in den Rahmen – gerade, gut beleuchtet, ohne Spiegelung"),
    h("div", { class: "camera-bar" }, [
      h("button", { type: "button", class: "camera-side", onclick: () => (stop(), onCancel()) }, "Abbrechen"),
      shutter,
      h("button", { type: "button", class: "camera-side", onclick: () => onPick() }, "Foto wählen"),
    ]),
  ]);
  let stream = null;

  const stop = () => {
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
  };

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      return onUnavailable(e);
    }
    if (!el.isConnected) return stop(); // inzwischen geschlossen
    video.srcObject = stream;
    await video.play().catch(() => {});
    shutter.disabled = false;
  }

  shutter.addEventListener("click", () => {
    if (!video.videoWidth) return;
    const crop = coverCrop(video.getBoundingClientRect(), frame.getBoundingClientRect(), { width: video.videoWidth, height: video.videoHeight }, FRAME_MARGIN);
    const canvas = h("canvas", { width: Math.round(crop.width), height: Math.round(crop.height) });
    canvas.getContext("2d").drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    stop();
    navigator.vibrate?.(10);
    canvas.toBlob((blob) => onPhoto(new File([blob], "karte.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92);
  });

  return { el, start, stop };
}
