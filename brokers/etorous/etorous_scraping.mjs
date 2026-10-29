// What eToro US (eToro USA Securities Inc., broker-dealer; clearing and
// custody Apex Clearing) sells in shares and exchange-traded funds, with no
// login. Its Form CRS: "eToro Securities offers app-based and online
// brokerage services allowing retail investors ... to purchase and sell
// publicly-traded securities commission-free. We offer customers the
// ability to trade certain stocks and exchange-traded funds ("ETFs")", "All
// securities listed on the eToro Platform ... are supported by Apex", and
// "eToro Securities does not offer mutual funds, retirement accounts,
// bonds, or proprietary products".
//
//   https://files.brokercheck.finra.org/crs_298361.pdf
//
// "Certain" stocks: the US site prints no list and no number, but eToro
// publishes its platform catalogue unauthenticated (the same two calls as
// ../etoro/etoro_scraping.mjs): the instrument metadata and, per
// instrument, whether a real (non-leveraged) buy is open. eToro US trades
// real US shares and ETFs on that platform ("All securities listed on the
// eToro Platform"), so a title eToro does not list is not on eToro US. The
// catalogue is the US exchange book of the day (../wellstrade/usBook.mjs:
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX, Texas Stock Exchange,
// less halted lines; warrants, rights, units, when-issued lines and listed
// notes out there, bonds by withoutObligations) cut to the titles eToro
// lists as a stock or an ETF priced from its US source ("NASDAQ", which
// eToro uses for every US exchange), open to a real buy and not delisted.
// eToro's venue suffixes are dropped (T.US is AT&T; .CH marks a US-listed
// Chinese ADR), class shares keep their dot (BRK.B). OTC lines are not in
// the book and eToro's OTC Markets instruments are closed to buying. The US
// is one NBBO market: one row per title on its primary listing, in
// dollars. The platform catalogue is eToro's, not a US-only list; a title
// eToro offers elsewhere but not to US clients would stay in.
//
//   https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments
//   https://api.etorostatic.com/sapi/trade-real/instruments
//
// Fees: "eToro Securities does not charge commissions for brokerage
// services or options" (Form CRS); "We charge zero commissions when you buy
// or sell a stock. When you sell a stock, we pay the regulatory transaction
// fees on your behalf" (US fees page).
//   https://www.etoro.com/en-us/trading/fees/
//
//   node brokers/etorous/etorous_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function json(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(last);
}

await checkPage("https://files.brokercheck.finra.org/crs_298361.pdf", [
  /ability to trade certain stocks and exchange-traded funds/i,
  /does not charge commissions for brokerage services/i,
  /All securities listed on the eToro Platform, as defined below, are supported by Apex/i,
], { pdf: true });
await checkPage("https://www.etoro.com/en-us/trading/fees/", [/We charge zero commissions when you buy or sell a stock/i]);

const [metadata, trade] = await Promise.all([
  json("https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments"),
  json("https://api.etorostatic.com/sapi/trade-real/instruments"),
]);
const rules = new Map((trade.Instruments || []).map((row) => [row.InstrumentID, row]));
const listed = new Map();
const VENUE_SUFFIX = /\.(US|CH)$/;
for (const instrument of metadata.InstrumentDisplayDatas || []) {
  if (instrument.InstrumentTypeID !== 5 && instrument.InstrumentTypeID !== 6) continue;
  if (String(instrument.PriceSource || "").toUpperCase() !== "NASDAQ") continue;
  const rule = rules.get(instrument.InstrumentID);
  if (instrument.IsInternalInstrument || instrument.HasExpirationDate || rule?.IsDelisted || rule?.AllowBuy === false) continue;
  const symbol = String(instrument.SymbolFull || "").trim().toUpperCase();
  if (!symbol || /\.(RTH|CVR|OLD|TEST|24-7|EUR|WS|PFD)$/.test(symbol)) continue;
  listed.set(symbol.replace(VENUE_SUFFIX, ""), instrument.InstrumentTypeID === 6 ? "ETF" : "STOCK");
}
if (listed.size < 4000) throw new Error(`eToro lists only ${listed.size} US instruments`);

const book = await usBook();
const key = (ticker) => ticker.replace(/\.PR([A-Z]?)$/, ".P$1");
const kept = book.filter((row) => listed.has(row.ticker) || listed.has(key(row.ticker)) || listed.has(row.ticker.replace(/\./g, "-")));
const rows = stampRows(withoutObligations(kept));
if (rows.length < 4000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "MSFT", "SPY", "QQQ", "T"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("etorous-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const found = new Set(kept.flatMap((row) => [row.ticker, key(row.ticker), row.ticker.replace(/\./g, "-")]));
const unmatched = [...listed.keys()].filter((symbol) => !found.has(symbol));
console.error(countLine(rows));
console.error(`eToro lists ${listed.size} US stocks and ETFs open to a buy; ${unmatched.length} not in today's US exchange book (${unmatched.slice(0, 25).join(" ")}...)`);
