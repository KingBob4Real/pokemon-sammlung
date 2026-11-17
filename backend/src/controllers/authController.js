import { log } from "../http/log.js";
import { error, json } from "../http/responses.js";
import { parseLogin, parseName } from "../validation/authValidator.js";

const body = (request) => request.json().catch(() => null);

// HTTP-Schicht für „Wer sammelt?“: Personen, Anmelden, Name.
export class AuthController {
  constructor(authService) {
    this.auth = authService;
  }

  async people() {
    return json({ people: await this.auth.people() });
  }

  // reason (optional, von der App): warum angemeldet wird – „choose“ (Person angetippt) oder „relogin“ (Sitzung war ungültig)
  async login(request) {
    const input = await body(request);
    const parsed = parseLogin(input);
    if (!parsed.ok) return error(parsed.status, parsed.error);
    const result = await this.auth.login(parsed.id);
    const reason = typeof input?.reason === "string" ? input.reason.slice(0, 20) : null;
    if (!result.token) {
      log("warn", "login_failed", { user: parsed.id, status: result.status, reason });
      return error(result.status, result.error);
    }
    log("info", "login", { user: parsed.id, reason });
    return json(result);
  }

  async logout(user) {
    await this.auth.logout(user);
    log("info", "logout", { user: user.id, auth: user.session ? "session" : "sync_key" });
    return json({ ok: true });
  }

  async rename(request, user) {
    const parsed = parseName(await body(request));
    if (!parsed.ok) return error(parsed.status, parsed.error);
    await this.auth.rename(user, parsed.name);
    log("info", "rename", { user: user.id, name: parsed.name });
    return json({ ok: true, name: parsed.name });
  }
}
