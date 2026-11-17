// node:sqlite unter Node 22 bindet ?1, ?2 … nicht (Node 24 und D1 schon). Darum schreibt das hier ?N in ? um und übergibt
// die Werte in der Reihenfolge ihres Vorkommens – so laufen die Tests lokal unter Node 22 und in der CI unter Node 24.
export function numberedParams(sqlite) {
  const prepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = (sql) => {
    const order = [];
    const plain = sql.replace(/\?(\d+)/g, (_, n) => (order.push(Number(n) - 1), "?"));
    if (!order.length) return prepare(sql);
    const statement = prepare(plain);
    const pick = (args) => order.map((i) => args[i]);
    return {
      get: (...args) => statement.get(...pick(args)),
      all: (...args) => statement.all(...pick(args)),
      run: (...args) => statement.run(...pick(args)),
    };
  };
  return sqlite;
}
