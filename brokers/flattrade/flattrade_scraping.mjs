// Flattrade publishes the Pi API scrip master as public files, rebuilt every
// night, with no login.
//
// https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/NSE_Equity.csv
// https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/BSE_Equity.csv
//   The Instrument column is the NSE series (EQ, BE) or the BSE group (A,
//   B, T, X, XT, Z, E...). There is no ISIN. It is joined from the NSE list
//   and the Upstox cash book (indianCash.mjs). The files keep a renamed
//   symbol next to its new name on the same token (ZOMATO and ETERNAL), and
//   sometimes a symbol in both EQ and BE: one row is kept per token, the
//   name the exchange still uses, in the series the exchange still uses.
//   A symbol the NSE list and the Upstox cash book no longer know is a
//   stale row and is left out, as are rights entitlements (-RE), indices,
//   iNAV, debt series and fund units outside a sold series. The NSE file
//   only has the EQ and BE series: no SME (SM, ST), REIT or InvIT (RR, IV)
//   lines; the BSE file has no SME (M, MT) group.
//   (The JSON copies under pidata.flattrade.in/scripmaster/json/ hold the
//   same rows with every NSE series written as -EQ.)
//
//   node brokers/flattrade/flattrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, seriesOf, rootOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FILES = [
  "https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/NSE_Equity.csv",
  "https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/BSE_Equity.csv",
];
const MIC = { NSE: "XNSE", BSE: "XBOM" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const book = await cashBook();
const candidates = [];

for (const url of FILES) {
  for (const row of parseCsv(await text(url))) {
    const exchange = String(row.Exchange).trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") continue;
    const ticker = String(row.Tradingsymbol).trim();
    if (!ticker) continue;
    const instrument = String(row.Instrument).trim().toUpperCase();
    const series = exchange === "NSE" ? seriesOf(ticker) || instrument : instrument;
    // A rights entitlement (-RE, -RE1) is not a share.
    if (/-RE\d*$/.test(rootOf(ticker))) continue;
    // A symbol missing from both exchange lists is a stale row (delisted,
    // merged or renamed) that the nightly file still carries.
    const entry = lookup(book, exchange, ticker);
    if (!entry) continue;
    const isin = entry.isin || "";
    if (!keepSold(exchange, series, ticker, isin)) continue;
    candidates.push({ exchange, token: String(row.Token).trim(), ticker, series, entry, isin, symbol: row.Symbol });
  }
}

// A candidate the exchange still knows, in the series it trades today, wins.
function score(candidate) {
  if (!candidate.entry) return 0;
  return candidate.entry.series === candidate.series ? 2 : 1;
}

function pickBest(groups, keyOf) {
  const best = new Map();
  for (const candidate of groups) {
    const key = keyOf(candidate);
    const prior = best.get(key);
    if (!prior || score(candidate) > score(prior)) best.set(key, candidate);
  }
  return [...best.values()];
}

const byToken = pickBest(candidates, (c) => `${c.exchange}|${c.token}`);
const chosen = pickBest(byToken, (c) => `${c.exchange}|${rootOf(c.ticker)}`);

const listings = chosen.map(({ exchange, ticker, series, entry, isin, symbol }) => {
  const name = companyName(symbol, ticker, entry);
  return {
    query: ticker,
    ticker,
    name,
    exchange,
    mic: MIC[exchange],
    currency: "INR",
    type: isin.startsWith("INF") ? "ETF" : "STOCK",
    isin,
    raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
  };
});

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("flattrade-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const written = withoutObligations(listings);
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} listings (${written.filter((row) => row.isin).length} with an ISIN)`, counts);
