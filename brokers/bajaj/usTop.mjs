// The N most popular lines of a US exchange book, for a broker that states
// how many US titles it offers but publishes no list (owner's rule of
// 2026-10-25: "over 8,000 US stocks" is the 8,000 most popular, not the
// whole place).
//
// Popularity is the traded value: the last close times the average daily
// volume of the last 30 days, both from TradingView's US scanner, which
// prints every US line (Nasdaq, NYSE, NYSE American, NYSE Arca as AMEX,
// Cboe, OTC) in one answer. A line with no volume is ranked after every
// line that has one, by its market value (market cap for a share, assets
// under management for a fund); a line the scanner does not know comes
// last. Ties keep the book's order.
//
//   https://scanner.tradingview.com/america/scan
//
// The scanner writes a preferred as NLY/PG and a class share as BRK.B; the
// book writes NLY.PRG and BRK.B.
//
//   import { usPopular } from "../bajaj/usTop.mjs";
//   const kept = await usPopular(rows, 12000);            // one count
//   const kept = await usPopular(rows, { STOCK: 8000, ETF: 2000 }); // per kind

const SCANNER = "https://scanner.tradingview.com/america/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const LISTED = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scan() {
  const body = JSON.stringify({ columns: ["name", "close", "average_volume_30d_calc", "market_cap_basic", "aum", "exchange", "type"], range: [0, 40000] });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SCANNER, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(90_000) });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload?.data) && payload.data.length >= 15000) return payload.data;
        last = `the US scanner answered ${payload?.data?.length ?? 0} lines`;
      } else last = `the US scanner answered ${response.status}`;
    } catch (error) {
      last = `the US scanner: ${error.message}`;
    }
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(last);
}

const bookTicker = (name) => String(name || "").trim().toUpperCase().replace(/\/P([A-Z]?)$/, ".PR$1").replace(/\//g, ".");

// rows: usBook rows. count: a number, or { STOCK, ETF } where ETF counts
// ETFs and ETNs together. Returns the kept rows (book order) with
// `report` { ranked, valued, kept, dropped }.
export async function usPopular(rows, count) {
  const lines = await scan();
  const quote = new Map();
  for (const { d } of lines) {
    const [name, close, volume, cap, aum, exchange] = d;
    if (!LISTED.has(exchange)) continue;
    const ticker = bookTicker(name);
    const value = Number(close) > 0 && Number(volume) > 0 ? Number(close) * Number(volume) : 0;
    const size = Number(cap) || Number(aum) || 0;
    const prior = quote.get(ticker);
    if (!prior || value > prior.value) quote.set(ticker, { value, size });
  }
  for (const ticker of ["AAPL", "SPY", "BRK.B"]) if (!quote.get(ticker)?.value) throw new Error(`the US scanner has no traded value for ${ticker}`);

  const score = (row) => {
    const hit = quote.get(row.ticker);
    if (!hit) return [0, 0, 0];
    return hit.value ? [2, hit.value, 0] : [1, hit.size, 0];
  };
  const ranked = rows.map((row, index) => ({ row, index, score: score(row) }));
  ranked.sort((a, b) => b.score[0] - a.score[0] || b.score[1] - a.score[1] || a.index - b.index);

  const keep = new Set();
  const kind = (row) => (row.type === "STOCK" ? "STOCK" : "ETF");
  if (typeof count === "number") {
    for (const item of ranked.slice(0, count)) keep.add(item.row);
  } else {
    const taken = { STOCK: 0, ETF: 0 };
    for (const item of ranked) {
      const k = kind(item.row);
      if (taken[k] < (count[k] ?? Infinity)) {
        keep.add(item.row);
        taken[k] += 1;
      }
    }
  }
  const kept = rows.filter((row) => keep.has(row));
  kept.report = {
    ranked: rows.length,
    valued: ranked.filter((item) => item.score[0] === 2).length,
    sizedOnly: ranked.filter((item) => item.score[0] === 1).length,
    unknown: ranked.filter((item) => item.score[0] === 0).length,
    kept: kept.length,
    dropped: rows.filter((row) => !keep.has(row)).map((row) => row.ticker),
  };
  return kept;
}
