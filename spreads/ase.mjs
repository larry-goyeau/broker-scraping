// Amman Stock Exchange daily bulletin: one page, every share traded in the
// last session. For each symbol it prints the last close, the session's
// close and the best bid and best ask left on the book when the session
// ended. `prices.mjs` takes the close and `ase-touch.mjs` takes the touch,
// so the page is read here once for both.
//
//   https://www.exchange.jo/en/bulletins/daily/new
//
// Columns, as the table's two header rows print them: flag, 12-month low,
// 12-month high, P/E, dividend, code, company, symbol, market, last closing
// price, reference price, opening, high, low, closing price, change,
// average price, value traded (JD), shares, trades, best bid price and
// size, best ask price and size. Prices are in dinars.

export const ASE_BULLETIN = "https://www.exchange.jo/en/bulletins/daily/new";

const num = (value) => {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const text = (cell) =>
  cell
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** { date, rows: [{ symbol, company, close, lastClose, bid, bidSize, ask, askSize }] } */
export async function readAseBulletin() {
  const response = await fetch(ASE_BULLETIN, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`bulletin d'Amman : ${response.status}`);
  const html = await response.text();
  const table = (html.match(/<table[\s\S]*?<\/table>/i) || [""])[0];
  const date = (table.match(/(\d{4}-\d{2}-\d{2})\s*-\s*\d{4}-\d{2}-\d{2}/) || [])[1] || null;
  const rows = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => text(m[1]));
    if (cells.length < 24) continue;
    const symbol = cells[7].toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(symbol)) continue;
    rows.push({
      symbol,
      company: cells[6],
      lastClose: num(cells[9]),
      close: num(cells[14]),
      bid: num(cells[20]),
      bidSize: num(cells[21]),
      ask: num(cells[22]),
      askSize: num(cells[23]),
    });
  }
  if (!rows.length) throw new Error("bulletin d'Amman sans ligne");
  return { date, rows };
}
