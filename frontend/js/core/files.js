import { h } from "./dom.js";

// Text teilen: am Handy das Teilen-Menü (WhatsApp, Nachrichten …), sonst in die Zwischenablage.
// → "shared" | "copied" | null (abgebrochen oder nicht möglich)
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return null; // selbst abgebrochen
    }
  }
  try {
    await navigator.clipboard.writeText(`${title}\n${text}`);
    return "copied";
  } catch {
    return null;
  }
}

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
