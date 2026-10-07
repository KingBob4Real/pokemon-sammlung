import { h } from "../../core/dom.js";

/**
 * Dünner Ladebalken: busy() = läuft hin und her (z. B. während die Suche wartet),
 * set(0…1) = Anteil, done() = voll und dann ausblenden.
 */
export function progressBar() {
  const fill = h("i");
  const el = h("div", { class: "progress-bar", role: "progressbar", "aria-label": "Lädt", "aria-valuemin": 0, "aria-valuemax": 100, hidden: true }, [fill]);
  let hideTimer = null;
  const set = (fraction) => {
    clearTimeout(hideTimer);
    el.hidden = false;
    el.classList.remove("indeterminate");
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    fill.style.width = `${pct}%`;
    el.setAttribute("aria-valuenow", pct);
  };
  return {
    el,
    busy() {
      clearTimeout(hideTimer);
      el.hidden = false;
      el.classList.add("indeterminate");
      el.removeAttribute("aria-valuenow");
    },
    set,
    done() {
      set(1);
      hideTimer = setTimeout(() => (el.hidden = true), 400);
    },
  };
}

// Balken folgt den Bildern der ersten Kacheln (dem, was man gleich sieht). Diese laden sofort statt „lazy“.
export function trackFirstImages(container, bar, count = 6) {
  const images = [...container.querySelectorAll(".tile img")].slice(0, count);
  for (const img of images) img.loading = "eager";
  const total = images.length;
  let loaded = images.filter((img) => img.complete).length;
  if (loaded >= total) return bar.done();
  bar.set(loaded / total);
  const step = () => {
    loaded++;
    if (loaded >= total) bar.done();
    else bar.set(loaded / total);
  };
  for (const img of images) {
    if (img.complete) continue;
    img.addEventListener("load", step, { once: true });
    img.addEventListener("error", step, { once: true });
  }
}
