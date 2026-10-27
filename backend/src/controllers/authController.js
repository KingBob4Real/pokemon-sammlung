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

  async login(request) {
    const parsed = parseLogin(await body(request));
    if (!parsed.ok) return error(parsed.status, parsed.error);
    const result = await this.auth.login(parsed.id);
    return result.token ? json(result) : error(result.status, result.error);
  }

  async logout(user) {
    await this.auth.logout(user);
    return json({ ok: true });
  }

  async rename(request, user) {
    const parsed = parseName(await body(request));
    if (!parsed.ok) return error(parsed.status, parsed.error);
    await this.auth.rename(user, parsed.name);
    return json({ ok: true, name: parsed.name });
  }
}
