// Karten-Scanner: Foto → Workers AI liest Name, Nummer und Set-Kürzel. Das Foto wird nicht gespeichert.

const PROMPT = `Foto einer Pokémon-Sammelkarte (deutsch, englisch oder japanisch; neu oder alt ab 1999).
Lies nur, was auf der Karte steht, und antworte nur mit diesem JSON:
{
  "name": "Name des Pokémon oder der Trainerkarte genau wie oben auf der Karte gedruckt, z. B. \\"Glurak-ex\\", \\"Mega-Glurak X-ex\\" oder \\"Nidoking\\"",
  "number": "Sammlernummer VOR dem Schrägstrich, z. B. \\"199\\", \\"023\\", \\"11\\" oder \\"TG05\\"",
  "total": "Zahl NACH dem Schrägstrich, z. B. \\"165\\" oder \\"102\\"; null, wenn es keinen Schrägstrich gibt (Promo)",
  "setCode": "Set-Kürzel direkt neben der Sammlernummer, z. B. \\"MEW\\", \\"PAL\\", \\"SVP\\"; null, wenn keins gedruckt ist",
  "language": "\\"de\\", \\"en\\", \\"ja\\" oder null",
  "stamp": 25 oder 30, wenn ein rundes Logo „25“/„30“ mit Pikachu zu sehen ist, sonst null,
  "confidence": Zahl von 0 bis 1, wie sicher du dir bei Name UND Sammlernummer bist
}
So findest du die Sammlernummer: ganz unten auf der Karte im Format „Nummer/Gesamtzahl“ (z. B. „11/102“) –
bei neuen Karten unten links, bei alten Karten (1999–2003) unten rechts, oft neben einem Seltenheitssymbol (●, ◆, ★).
Nicht verwechseln mit: Pokédex-Nummer („Nr. 034“, „NO. 34“), KP/HP, Schaden, Größe/Gewicht, Jahreszahlen im Copyright.
Set-Kürzel (2–4 Großbuchstaben) gibt es nur auf neueren Karten; alte Karten haben keins → null. Nicht raten.
Nur die Karte lesen, die das Bild (fast) ganz ausfüllt – angeschnittene Ränder von Nachbarkarten ignorieren.
Ist keine ganze Karte zu sehen (z. B. leeres Fach im Sammelordner), alle Felder null.
Nichts erfinden, Unlesbares als null. Keine Angriffe, KP oder Texte ausgeben.
Bei Spiegelungen/Holo-Effekten trotzdem die Nummer unten genau lesen.`;

const text = (v, re) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : null);

// Antwort des Modells → nur geprüfte Felder; nicht lesbar = alles null
export function toRecognized(answer) {
  let d = null;
  try {
    d = typeof answer === "string" ? JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? "null") : answer;
  } catch {
    /* kein JSON */
  }
  const num = (v) => text(typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/^#/, "") : v, /^[A-Za-z]{0,4}\d{1,4}[a-z]?$/);
  return {
    name: text(d?.name, /^[^{}<>]{1,80}$/),
    number: num(d?.number),
    total: text(typeof d?.total === "number" ? String(d.total) : d?.total, /^\d{1,4}$/),
    setCode: text(typeof d?.setCode === "string" ? d.setCode.replace(/\s+(DE|EN)$/i, "") : null, /^[A-Za-z0-9]{2,6}$/)?.toUpperCase() ?? null, // „MEP DE“ → „MEP“
    language: ["de", "en", "ja"].includes(d?.language) ? d.language : null,
    stamp: [25, 30].includes(Number(d?.stamp)) ? Number(d.stamp) : null, // Jubiläums-Logo: Nachdruck mit der Nummer des Originals
    confidence: typeof d?.confidence === "number" && d.confidence >= 0 && d.confidence <= 1 ? d.confidence : 0,
  };
}

// Wie viele Scans gehen heute noch? Kleinstes von „pro Person“ und „alle zusammen“.
export const scansLeft = (used, limits) => Math.max(0, Math.min(limits.perUser - used.mine, limits.total - used.total));

const today = () => new Date().toISOString().slice(0, 10); // Tag in UTC – wie der Gratis-Tarif von Workers AI

export class ScanService {
  constructor(ai, usage, { model, maxTokens = 100, perUser, total }) {
    this.ai = ai;
    this.usage = usage;
    this.model = model;
    this.maxTokens = maxTokens;
    this.limits = { perUser, total };
  }

  // → Scans, die diese Person heute noch hat
  async remaining(user) {
    return scansLeft(await this.usage.today(user.id, today()), this.limits);
  }

  // → { recognized, remaining } | { limited: true, remaining: 0 } | { unavailable: true, remaining }
  async scan(user, image) {
    const day = today();
    const left = scansLeft(await this.usage.today(user.id, day), this.limits);
    if (!left) return { limited: true, remaining: 0 };
    await this.usage.add(user.id, day); // vorher zählen: auch ein fehlgeschlagener Versuch kostet Neurons
    const remaining = left - 1;
    let result;
    try {
      result = await this.ai.run(this.model, {
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: image } }] }],
        max_tokens: this.maxTokens,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false }, // direkt antworten statt erst „nachdenken“ – schneller, günstiger
      });
    } catch (e) {
      console.error(e);
      return { unavailable: true, remaining };
    }
    const answer = result?.response ?? result?.choices?.[0]?.message?.content;
    const recognized = toRecognized(answer);
    // nur das Gelesene und der Verbrauch, nie das Foto – zum Nachsehen in den Workers Logs
    console.log("scan", user.id, JSON.stringify(recognized), "neurons", result?.usage?.neurons ?? "?", "noch", remaining);
    // raw nur, wenn nichts lesbar war – hilft beim Nachsehen, was das Modell geantwortet hat
    return recognized.name || recognized.number ? { recognized, remaining } : { recognized, remaining, raw: String(answer ?? "").slice(0, 500) };
  }
}
