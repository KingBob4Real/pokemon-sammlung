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
