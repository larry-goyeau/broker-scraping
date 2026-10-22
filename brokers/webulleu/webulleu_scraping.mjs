// What Webull Europe (Webull Securities (Europe) B.V., webull.eu, AFM
// licence 14006336) sells to its clients in the Netherlands, Germany and
// Spain. It is built from the frozen Webull book in
// brokers/webull/webull-base.json (Webull Singapore's OpenAPI shelf) and
// cut down to what webull.eu says its clients can buy.
//
// What Webull EU offers (help FAQ 1020, "What does Webull Offer?"):
//   "Through Webull, you can trade EU- and US-listed shares, fractional
//    shares, EU ETFs and US options."
//   https://www.webull.eu/help/faq/1020
// The pricing page has two share lines, "EU Stocks and ETFs" and
// "US Shares (Stocks)". https://www.webull.eu/pricing
//
// 1. US shares only. Common and preferred shares listed on a US exchange
//    stay (NYSE, Nasdaq, NYSE American/Arca, Cboe; one NBBO market, one
//    row). Webull EU sends US orders to Webull Financial LLC (Order
//    Handling and Best Execution Policy, appendix 2).
//    - No US ETFs (help FAQ 1092, "Why can't I trade US ETFs?"):
//      "European retail investors are not permitted to invest in U.S
//       ETFs since 2018." / "Under EU law, all investment funds, including
//       ETFs, must provide a Key Information Document (KID) in an official
//       local language."
//      https://www.webull.eu/help/faq/1092
//      The same rule covers every US fund, so the US closed-end funds the
//      base types as STOCK go too. A line is a fund when assets/etfs.csv
//      (the fund catalogue) lists its ticker on a US place and
//      assets/stocks.csv does not. The base gave those lines a wrong,
//      foreign ISIN (CLM had VN000000CLM2), so the ticker is the test.
//    - No US ETNs: they are notes, not shares, and FAQ 1020 offers only
//      shares, EU ETFs and US options.
//    - ADRs stay. Help FAQ 1050 ("What are ADR fees?") charges them:
//      "ADR fees generally range from USD 0.01 to USD 0.03 per share.
//       However, this amount may vary between available ADRs."
//      https://www.webull.eu/help/faq/1050
//    - OTC stays out. webull.eu never names OTC, FAQ 1020 speaks of
//      "US-listed shares", and the execution venue list for the US is
//      "The New York Stock Exchange" and "National Association of
//      Securities Dealers Automated Quotations Exchange" only (Order
//      Handling and Best Execution Policy, appendix 1).
//      https://e1uweb.wbeusecurities.com/agreement/1116dc67aaee437a936f9bdb1eb08801.pdf
//      (linked from https://www.webull.eu/disclosures)
//    - No crypto, Hong Kong or China Connect: none is in FAQ 1020's list.
//
// 2. EU shares and UCITS ETFs are left out. Webull EU trades them through
//    Upvest ("Transaction Fee ... Upvest Securities GmbH" on the pricing
//    page) on Tradegate ("Our EUR flow goes through Tradegate, with
//    settlement within Clearstream", pricing page, SDRT note; the policy
//    lists "Tradegate (Europen shares)" and "Quotrix"). Neither webull.eu
//    nor Upvest publishes the list of titles: webull.eu has no product
//    list or screener, the quote host returns nothing for Europe
//    (ranking regionId 14 is empty), and Upvest's instrument universe is
//    behind its API (docs.upvest.co). So this file holds no Tradegate or
//    Quotrix row; the catalogue misses the EU half of the offer.
//
// 3. Deposit currency: EUR only. Help FAQ 1289 ("How does FX conversion
//    work?"): "EUR is automatically converted to USD when you buy US
//    stocks. [...] Manual FX conversion is not currently available. USD
//    cannot be held in Webull EU accounts."
//    https://www.webull.eu/help/faq/1289
//    US places quote only USD, so every row is a USD line (the 0.25%
//    automatic conversion is in the cost file's hands).
//
//   node brokers/webulleu/webulleu_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const BASE = new URL("../webull/webull-base.json", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const OUTPUT = new URL("webulleu-parsed.json", import.meta.url);

const US_PLACES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);
// How the catalogues name the US places in their "PLACE:TICKER" column.
const CSV_US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE", "ARCA", "NYSEARCA", "BATS"];

// The webull.eu pages the rules above quote. A run reads them again and
// says so when the wording has gone; webull.eu answers 403 to scripts at
// times, and then the run carries on with the rules as written.
const CHECKS = [
  ["https://www.webull.eu/help/faq/1020", /EU- and US-listed shares/i],
  ["https://www.webull.eu/help/faq/1092", /not permitted to invest in U\.?S\.? ETFs/i],
  ["https://www.webull.eu/help/faq/1050", /available ADRs/i],
  ["https://www.webull.eu/help/faq/1289", /USD cannot be held in Webull EU accounts/i],
];

async function checkSources() {
  for (const [url, wording] of CHECKS) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        console.error(`  ${url}: HTTP ${response.status}, not checked`);
        continue;
      }
      const text = (await response.text()).replace(/&#x27;|&apos;|’/g, "'");
      console.error(`  ${url}: ${wording.test(text) ? "wording still there" : "WORDING GONE, check the rule"}`);
    } catch (error) {
      console.error(`  ${url}: ${error.message}, not checked`);
    }
  }
}

function catalogueTickers(file) {
  const tickers = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    const [place, ticker] = line.split(",")[0].split(":");
    if (ticker && CSV_US_PLACES.includes(place)) tickers.add(ticker.trim().toUpperCase());
  }
  return tickers;
}

console.error("webull.eu sources:");
await checkSources();

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const fundTickers = catalogueTickers(ETFS);
const shareTickers = catalogueTickers(STOCKS);

const kept = [];
const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

for (const row of base) {
  if (row.type === "CRYPTO") { drop("crypto"); continue; }
  if (row.exchange === "OTC") { drop("US OTC"); continue; }
  if (!US_PLACES.has(row.exchange)) { drop(`${row.exchange} (not offered)`); continue; }
  if (row.type === "ETF") { drop("US ETF (no KID)"); continue; }
  if (row.type !== "STOCK") { drop(`US ${row.type}`); continue; }
  const ticker = String(row.ticker).toUpperCase();
  if (fundTickers.has(ticker) && !shareTickers.has(ticker)) { drop("US closed-end fund (no KID)"); continue; }
  kept.push({ ...row, currency: "USD" });
}

for (const row of kept) {
  if (!resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin }).venue) {
    throw new Error(`No venue for ${row.exchange} ${row.currency} (${row.ticker})`);
  }
}

const rows = stampRows(withoutObligations(kept), import.meta.url);
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));

const byPlace = new Map();
for (const row of rows) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  byPlace.set(key, (byPlace.get(key) || 0) + 1);
}
console.error(
  `${rows.length} rows (${[...byPlace].map(([key, count]) => `${count} ${key}`).join(", ")}); ` +
    `left out ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` +
    (kept.length !== rows.length ? `, ${kept.length - rows.length} debt lines` : "")
);
