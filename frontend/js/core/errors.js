// Fehler → verständliche Meldung (deutsch, ohne Technik) + Art, damit man passend reagieren kann.
//   kind: offline · timeout · network · auth · notFound · rejected · server · storage · unknown
//   retry: lohnt ein neuer Versuch später?
export function describeError(error) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { kind: "offline", retry: true, message: "Du bist offline. Sobald du wieder Internet hast, geht es weiter." };
  }
  if (error?.name === "AbortError") {
    return { kind: "timeout", retry: true, message: "Die Verbindung ist gerade sehr langsam." };
  }
  if (error?.name === "QuotaExceededError") {
    return { kind: "storage", retry: false, message: "Der Speicher auf diesem Gerät ist voll. Bitte eine Sicherung exportieren." };
  }
  const status = error?.status;
  if (status === 401) return { kind: "auth", retry: false, message: "Der Sync-Schlüssel stimmt nicht. Bitte unter „Mehr“ prüfen." };
  if (status === 404) return { kind: "notFound", retry: false, message: "Nicht gefunden. Ist die Adresse richtig?" };
  if (status === 400 || status === 413) return { kind: "rejected", retry: false, message: error?.body?.error || "Die Daten wurden abgelehnt." };
  if (status === 429) return { kind: "server", retry: true, message: "Gerade zu viele Anfragen." };
  if (status >= 500) return { kind: "server", retry: true, message: "Der Server hat gerade ein Problem." };
  // fetch meldet fehlende Verbindung / gesperrte Adresse als TypeError
  if (error instanceof TypeError) return { kind: "network", retry: true, message: "Keine Verbindung zum Server." };
  return { kind: "unknown", retry: false, message: "Da ist etwas schiefgelaufen." };
}
