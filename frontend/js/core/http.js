// fetch mit Zeitlimit. HTTP-Fehler werfen einen Error mit .status und – falls vorhanden – .body
// (die JSON-Antwort des Servers, z. B. { error, index }).
export async function fetchJson(url, { timeout = 10000, ...options } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, body });
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
