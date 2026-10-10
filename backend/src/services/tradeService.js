/**
 * Tauschen: für jede andere Person, was sie doppelt hat und was ihr fehlt (Karten aus ihren Listen, die nicht in ihrer
 * Sammlung sind). Nur lesen – gebucht wird nichts, jeder pflegt seine Sammlung selbst. Mit den eigenen Daten gleicht die
 * App das selbst ab (per Karten-ID, die Sprache zählt nicht).
 * ponytail: jede angemeldete Person sieht Doppelte und Listen der anderen – gewollt, die App ist nur für uns, Namen
 * sind ohnehin öffentlich. Eine Einstellung „nicht teilen“ erst, wenn jemand Fremdes dazukommt.
 */
export class TradeService {
  constructor(users, collection, listItems) {
    this.users = users;
    this.collection = collection;
    this.listItems = listItems;
  }

  // → { people: [{ id, name, duplicates: [{ card, qty, cond, lang }], missing: [card] }] }
  async forUser(user) {
    const [people, duplicates, missing] = await Promise.all([this.users.all(), this.collection.duplicates(user.id), this.listItems.missing(user.id)]);
    return {
      people: people
        .filter((p) => p.id !== user.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          duplicates: duplicates.filter((d) => d.userId === p.id).map(({ card, qty, cond, lang }) => ({ card, qty, cond, lang })),
          missing: missing.filter((m) => m.userId === p.id).map((m) => m.card),
        })),
    };
  }
}
