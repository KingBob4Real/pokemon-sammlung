// Karten-Scanner: Foto → Workers AI liest Name, Nummer und Set-Kürzel. Das Foto wird nicht gespeichert.

const PROMPT = `Du siehst das Foto einer Pokémon-Sammelkarte (deutsch oder englisch, manchmal japanisch; neue Karten oder alte ab 1999).
Lies nur, was wirklich auf der Karte steht, und antworte ausschließlich mit diesem JSON, ohne weiteren Text:
{
  "name": "Name des Pokémon oder der Trainerkarte genau wie oben auf der Karte gedruckt, z. B. \\"Glurak-ex\\", \\"Mega-Glurak X-ex\\" oder \\"Nidoking\\"",
  "number": "Sammlernummer VOR dem Schrägstrich, z. B. \\"199\\", \\"023\\", \\"11\\" oder \\"TG05\\"",
  "total": "Zahl NACH dem Schrägstrich, z. B. \\"165\\" oder \\"102\\"; null, wenn es keinen Schrägstrich gibt (Promo)",
  "setCode": "Set-Kürzel direkt neben der Sammlernummer, z. B. \\"MEW\\", \\"PAL\\", \\"SVP\\"; null, wenn keins gedruckt ist",
  "language": "\\"de\\", \\"en\\", \\"ja\\" oder null",
  "confidence": Zahl von 0 bis 1, wie sicher du dir bei Name UND Sammlernummer bist
}
So findest du die Sammlernummer: ganz unten auf der Karte im Format „Nummer/Gesamtzahl“ (z. B. „11/102“) –
bei neuen Karten unten links, bei alten Karten (1999–2003) unten rechts, oft neben einem Seltenheitssymbol (●, ◆, ★).
Nicht verwechseln mit: Pokédex-Nummer („Nr. 034“, „NO. 34“), KP/HP, Schaden, Größe/Gewicht, Jahreszahlen im Copyright.
Set-Kürzel (2–4 Großbuchstaben) gibt es nur auf neueren Karten; alte Karten haben keins → null. Nicht raten.
Regeln: Nichts erfinden. Unlesbares als null. Keine Angriffe, KP oder Beschreibungstexte ausgeben.
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
    setCode: text(d?.setCode, /^[A-Za-z0-9]{2,6}$/)?.toUpperCase() ?? null,
    language: ["de", "en", "ja"].includes(d?.language) ? d.language : null,
    confidence: typeof d?.confidence === "number" && d.confidence >= 0 && d.confidence <= 1 ? d.confidence : 0,
  };
}

export class ScanService {
  constructor(ai, usage, { model, perUser, total }) {
    this.ai = ai;
    this.usage = usage;
    this.model = model;
    this.limits = { perUser, total };
  }

  // → { recognized } | { limited: true } | { unavailable: true }
  async scan(user, image) {
    const day = new Date().toISOString().slice(0, 10);
    const used = await this.usage.today(user.id, day);
    if (used.mine >= this.limits.perUser || used.total >= this.limits.total) return { limited: true };
    await this.usage.add(user.id, day); // vorher zählen: auch ein fehlgeschlagener Versuch kostet Neurons
    let result;
    try {
      result = await this.ai.run(this.model, {
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: image } }] }],
        max_tokens: 200,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false }, // direkt antworten statt erst „nachdenken“ – schneller, günstiger
      });
    } catch (e) {
      console.error(e);
      return { unavailable: true };
    }
    const answer = result?.response ?? result?.choices?.[0]?.message?.content;
    const recognized = toRecognized(answer);
    console.log("scan", user.id, JSON.stringify(recognized)); // nur das Gelesene, nie das Foto – zum Nachsehen in den Workers Logs
    // raw nur, wenn nichts lesbar war – hilft beim Nachsehen, was das Modell geantwortet hat
    return recognized.name || recognized.number ? { recognized } : { recognized, raw: String(answer ?? "").slice(0, 500) };
  }
}
