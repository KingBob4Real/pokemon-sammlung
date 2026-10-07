// localStorage-Zugriff, robust gegen Privatmodus und vollen Speicher.
export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Speicher voll oder gesperrt – App läuft trotzdem weiter */
    }
  },
};
