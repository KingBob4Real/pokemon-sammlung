// localStorage-Zugriff, robust gegen Privatmodus und vollen Speicher.
// set() meldet, ob das Speichern geklappt hat – wer Daten speichert, muss das wissen.
export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* gesperrt: dann bleibt es eben liegen */
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // Speicher voll oder gesperrt
    }
  },
};
