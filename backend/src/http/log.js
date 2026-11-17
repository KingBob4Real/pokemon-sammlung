// Protokoll des Backends: eine JSON-Zeile pro Ereignis. Cloudflare zeigt sie unter Workers & Pages → pokemon-sammlung →
// Logs (observability in wrangler.toml, 3 Tage) und filtert nach den Feldern, z. B. user = "owner" oder event = "sync".
// Nie Schlüssel, Sitzungen oder Fotos protokollieren – nur IDs, Zahlen und Gründe.

const toConsole = (entry) => {
  const line = JSON.stringify(entry);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
};

let sink = toConsole;

// Tests fangen das Protokoll ab (und prüfen es), statt die Ausgabe zu füllen
export const setLogSink = (fn) => (sink = fn ?? toConsole);

// level: info · warn · error
export const log = (level, event, fields = {}) => sink({ level, event, ...fields });
