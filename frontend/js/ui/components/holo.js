// Holo-Karte in der Kartenansicht: Lichtreflex und leichte Neigung folgen der Maus – am Handy dem Neigen des Geräts.
// Setzt nur --tx/--ty (−1 … 1) und die Klasse „tilt“ am Kartenbild, alles Sichtbare macht das CSS (.sheet-art).

const clamp = (v) => Math.max(-1, Math.min(1, v));

function tilt(art, x, y) {
  art.style.setProperty("--tx", clamp(x).toFixed(3));
  art.style.setProperty("--ty", clamp(y).toFixed(3));
  art.classList.add("tilt");
}

export function holo(art) {
  art.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return; // Finger wischen zum Blättern
    const r = art.getBoundingClientRect();
    tilt(art, ((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  art.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && art.classList.remove("tilt"));
  // iPhone: Lagesensor braucht einmal die Erlaubnis – beim Antippen der Karte fragen (Android fragt nicht)
  art.addEventListener("click", () => window.DeviceOrientationEvent?.requestPermission?.().catch(() => {}));
  return art;
}

// Lage des Handys → Neigung der offenen Karte. Nullpunkt = Haltung beim Öffnen, wandert langsam mit,
// damit die Karte nach dem Umgreifen wieder gerade liegt.
let current = null;
let rest = null;
window.addEventListener("deviceorientation", (e) => {
  const art = document.querySelector("#sheet[open] .sheet-art");
  if (!art || e.beta == null) return;
  if (art !== current) [current, rest] = [art, { beta: e.beta, gamma: e.gamma }];
  rest.beta += (e.beta - rest.beta) * 0.02;
  rest.gamma += (e.gamma - rest.gamma) * 0.02;
  tilt(art, (e.gamma - rest.gamma) / 20, (e.beta - rest.beta) / 20);
});
