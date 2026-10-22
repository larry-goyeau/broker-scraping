// What CDG Capital Bourse sells in shares, with no login. Its public site
// runs on a JSON API, the one its own pages call. The API's ticker list is
// the order book: the first-line shares of the Casablanca exchange, the
// same names the exchange prints. The API's search list also holds
// attribution rights; they are not shares and stay out. Bonds and funds
// (OPCVM) are other products. Casablanca lists no ETF. The ticker list
// prints no ISIN, so each share's summary is read for it.
//
// The ticker list also keeps shares the exchange has suspended (SAMIR,
// Delattre Levivier Maroc, Diac Salaf: halted for years, in liquidation),
// which cannot be bought. The same summary (VALEUR-SYNTHESE) prints a
// Cotation field, "Active" or "Halted"; Halted shares stay out. Any other
// value stops the run. A share with no trade on the last session is still
// Active and stays in: it is only illiquid.
//
//   https://www.cdgcapitalbourse.ma/Bourse/market
//   https://www.cdgcapitalbourse.ma/Produits/Tarifications
//   POST https://www.cdgcapitalbourse.ma/api/   TICKER, VALEUR-SYNTHESE
//
//   node brokers/cdgcapital/cdgcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://www.cdgcapitalbourse.ma/api/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function param(name, type, value) {
  return { NAME: name, TYPE: type, VALUE: String(value) };
}

async function call(name, params) {
  const body = JSON.stringify({ ACTIONS: [{ ACTION: { NAME: name, TYPE: "SELECT", VALUE: name }, PARAMS: params }] });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`${name} answered ${response.status}`);
      const block = (await response.json())?.[0]?.[name];
      if (!block?.Valid || !Array.isArray(block.Data)) throw new Error(`${name} answered ${JSON.stringify(block?.Data ?? block)}`);
      return block.Data;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last || name);
}

const tickers = await call("TICKER", [
  param("Espace_", "I", 1),
  param("IdPartener_", "I", 1),
  param("Lang_", "S", "XX"),
  param("NumseqMin_", "I", 0),
  param("NumseqMax_", "I", 0),
]);
if (tickers.length < 70) throw new Error(`CDG Capital printed ${tickers.length} shares`);

const shares = [];
const seen = new Set();
for (const line of tickers) {
  const ticker = String(line.Symbol || "").trim().toUpperCase();
  const name = String(line.Libelle || "").replace(/\s+/g, " ").trim();
  if (!/^[A-Z0-9]{2,6}$/.test(ticker) || !name) throw new Error(`unreadable line ${JSON.stringify(line)}`);
  if (seen.has(ticker)) throw new Error(`repeated ${ticker}`);
  seen.add(ticker);
  shares.push({ ticker, name });
}

async function summaryOf(ticker) {
  const data = await call("VALEUR-SYNTHESE", [param("Lang_", "S", "fr"), param("Espace_", "I", 1), param("Symbol_", "S", ticker), param("IdPartener_", "I", 1)]);
  const summary = data[0];
  if (String(summary?.Symbol || "").trim().toUpperCase() !== ticker) throw new Error(`summary of ${ticker} is ${summary?.Symbol}`);
  const isin = String(summary.Ising || "").trim().toUpperCase();
  if (!/^MA[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
  const cotation = String(summary.Cotation ?? "").trim();
  if (cotation !== "Active" && cotation !== "Halted") throw new Error(`Cotation of ${ticker} is ${JSON.stringify(summary.Cotation)}`);
  return { isin, halted: cotation === "Halted" };
}

// A few at a time: the API is the broker's own site.
const summaries = new Map();
for (let start = 0; start < shares.length; start += 6) {
  const batch = shares.slice(start, start + 6);
  const found = await Promise.all(batch.map((share) => summaryOf(share.ticker)));
  batch.forEach((share, index) => summaries.set(share.ticker, found[index]));
}
const isinSeen = new Set();
for (const { isin } of summaries.values()) {
  if (isinSeen.has(isin)) throw new Error(`repeated ${isin}`);
  isinSeen.add(isin);
}

const halted = shares.filter(({ ticker }) => summaries.get(ticker).halted);
if (halted.length > 10) throw new Error(`${halted.length} shares Halted: the Cotation field changed meaning`);
const rows = shares.filter(({ ticker }) => !summaries.get(ticker).halted).map(({ ticker, name }) => {
  const { isin } = summaries.get(ticker);
  return {
    query: ticker,
    ticker,
    name,
    exchange: "Casablanca",
    currency: "MAD",
    type: "STOCK",
    isin,
    mic: "XCAS",
    raw: [ticker, name, "Casablanca", isin, "STOCK"].join(" "),
  };
});
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.writeFileSync(new URL("cdgcapital-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`${rows.length} listings (${rows.length} STOCK; Casablanca ${rows.length}); dropped ${halted.length} Halted (suspended) on the broker's summary: ${halted.map(({ ticker }) => ticker).join(", ") || "none"}`);
