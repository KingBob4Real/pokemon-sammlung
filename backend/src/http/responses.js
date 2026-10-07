// Einheitliche Antworten inkl. CORS (die App läuft auf GitHub Pages, also auf einer anderen Domain).
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Schutz läuft über den Schlüssel, nicht über Cookies
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export const json = (body, status = 200) => Response.json(body, { status, headers: CORS_HEADERS });

// extra: zusätzliche Felder, z. B. { index } für die abgelehnte Änderung
export const error = (status, message, extra = {}) => json({ error: message, ...extra }, status);

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });
