// Each cost file used to scan its whole catalogue on every line of a page.
// The same array is indexed once, by the loose ISIN, ticker and query, and a
// lookup returns that short list. The caller's own predicate still decides
// which of those rows count, so a broker that ignores the query keeps ignoring it.

const indexes = new WeakMap();

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function keysOf(row) {
  const keys = new Set();
  const add = (s) => {
    const k = loose(s);
    if (k) keys.add(k);
  };
  add(row.isin);
  add(row.ticker);
  add(row.query);
  const query = loose(row.query);
  const house = query.replace(/(HKEQ|EQ|SA)$/, "");
  if (house && house !== query) keys.add(house);
  const ticker = loose(row.ticker);
  const base = ticker.replace(/(USDT|USDC|USD|EUR|GBP)$/, "");
  if (base && base !== ticker) keys.add(base);
  const series = String(row.ticker || "").toUpperCase().match(/^(.*)-(EQ|BE|BZ|SM|ST|IV|RR|A|B)$/);
  if (series) add(series[1]);
  return keys;
}

export function warmListingIndex(rows) {
  if (!rows || indexes.has(rows)) return;
  const index = new Map();
  for (const row of rows) {
    for (const key of keysOf(row)) {
      const list = index.get(key);
      if (list) list.push(row);
      else index.set(key, [row]);
    }
  }
  indexes.set(rows, index);
}

export function rowsNamed(rows, asked, pred) {
  warmListingIndex(rows);
  const named = indexes.get(rows).get(loose(asked)) || [];
  return pred ? named.filter(pred) : named;
}
