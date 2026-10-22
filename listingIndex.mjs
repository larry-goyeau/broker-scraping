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

// The front keeps every catalogue twice, once in its own index and once in each
// cost file, and JSON.parse gives every row its own copy of "NYSE", "USD" or
// "STOCK". One shared pool makes all of them the same string: 4.8 million
// listings carry about 300 places, 90 currencies and 9 types.
const pool = new Map();

export function intern(s) {
  if (typeof s !== "string") return s;
  const hit = pool.get(s);
  if (hit !== undefined) return hit;
  pool.set(s, s);
  return s;
}

/** Replaces the row's top-level strings with their pooled copy, in place. */
export function internRow(row) {
  if (!row || typeof row !== "object") return row;
  for (const k in row) if (typeof row[k] === "string") row[k] = intern(row[k]);
  return row;
}

export function warmListingIndex(rows) {
  if (!rows || indexes.has(rows)) return;
  const index = new Map();
  for (const row of rows) {
    internRow(row);
    // Most keys name one row: that row is stored bare, an array only once a
    // second row shares the key. The keys are pooled too, since the same ISIN
    // is a key in hundreds of catalogues.
    for (const key of keysOf(row)) {
      const held = index.get(key);
      if (held === undefined) index.set(intern(key), row);
      else if (Array.isArray(held)) held.push(row);
      else index.set(key, [held, row]);
    }
  }
  indexes.set(rows, index);
}

export function rowsNamed(rows, asked, pred) {
  warmListingIndex(rows);
  const held = indexes.get(rows).get(loose(asked));
  const named = held === undefined ? [] : Array.isArray(held) ? held : [held];
  return pred ? named.filter(pred) : named;
}
