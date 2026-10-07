import { h } from "./dom.js";

// Datei an den Nutzer geben. In der iPhone-App vom Home-Bildschirm sind Downloads unzuverlässig,
// dort öffnet sich das Teilen-Menü („In Dateien sichern“, AirDrop …). → false, wenn abgebrochen.
export async function deliverFile(file) {
  if (navigator.standalone && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch {
      return false; // abgebrochen
    }
  }
  const url = URL.createObjectURL(file);
  const a = h("a", { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
