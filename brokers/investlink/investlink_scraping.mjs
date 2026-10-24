// What Investlink (Investlink LTD, AFSA-licensed in Kazakhstan,
// investlink.kz) sells in shares and ETFs. US equities only.
//
// The broker's offer, its stocks page:
//   "Более 5000 акций и ETF США. Инвестируйте в любые ценные бумаги на
//   NYSE, NASDAQ и ARCA" ("More than 5,000 US stocks and ETFs. Invest in
//   any securities on NYSE, NASDAQ and ARCA")
//   https://investlink.kz/stocks/
// The account is held at Alpaca, its home page:
//   "Ваш счёт обслуживается в США через надёжного брокера Alpaca
//   Securities LLC." ("Your account is held in the US by the broker
//   Alpaca Securities LLC.")
//   https://investlink.kz/  (also https://investlink.kz/reliability/)
//
// Which list. The two candidates are the whole NYSE / Nasdaq / NYSE Arca
// listing (Nasdaq Trader's symbol directories) and Alpaca's own book.
// Investlink is a front end on Alpaca: an order for a title Alpaca does
// not mark tradable cannot be placed, and Alpaca refuses a non-US account
// a PTP without a qualified notice (10% IRS withholding on the sale). So
// the catalogue is Alpaca's tradable book (../alpaca/alpaca-parsed.json,
// with its ISINs and its `usResidentsOnly` PTP flag), cut to the three
// venues the broker names, the same way Fintual copies that book. That is
// about 10,000 lines, which fits "more than 5,000" and "any securities on
// NYSE, NASDAQ and ARCA"; the exchange listings would add lines Alpaca
// does not deal. Alpaca's book also holds NYSE American, Cboe BZX and OTC
// lines; Investlink names none of those venues, so they stay out.
// Alpaca files a NYSE Arca line as "ARCA" (raw) and the asset lists call
// that venue AMEX, so those rows keep exchange "AMEX" with mic ARCX.
//
// Tariff (https://investlink.kz/tariffs/): Pro "$0.02 за акцию, min $2.00
// за сделку", Premium and Private "0.25% от суммы, min $2.00 за сделку".
// Money comes in by SWIFT ("Пополните брокерский счет путем безопасного
// SWIFT-перевода", stocks page) to the Alpaca account, which is held in
// dollars; the site names no other currency. Every row is USD.
//
// Crypto, options and IPOs are other products and stay out.
//
//   node brokers/investlink/investlink_scraping.mjs
//   (run node brokers/alpaca/alpaca_scraping.mjs first when Alpaca's book is old)

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const SOURCE = new URL("../alpaca/alpaca-parsed.json", import.meta.url);
const OUTPUT = new URL("investlink-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Alpaca's venue (last word of raw) -> the row's exchange and MIC.
const VENUES = {
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  NASDAQ: { exchange: "NASDAQ", mic: "XNAS" },
  ARCA: { exchange: "AMEX", mic: "ARCX" },
};

const EVIDENCE = [
  { url: "https://investlink.kz/stocks/", test: /NYSE,\s*NASDAQ\s+и\s+ARCA/, says: "the stocks page names NYSE, NASDAQ and ARCA" },
  { url: "https://investlink.kz/", test: /Alpaca\s+Securities\s+LLC/, says: "the home page names Alpaca Securities LLC" },
  { url: "https://investlink.kz/tariffs/", test: /\$0\.02\s+за\s+акцию/, says: "the tariff page prices shares at $0.02 a share" },
];

async function page(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ");
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`${url}: ${last}`);
}

for (const { url, test, says } of EVIDENCE) {
  if (!test.test(await page(url))) throw new Error(`${url} no longer reads as expected: ${says}`);
}

if (!fs.existsSync(SOURCE)) throw new Error("Alpaca's book is missing: run node brokers/alpaca/alpaca_scraping.mjs");
const ageDays = (Date.now() - fs.statSync(SOURCE).mtimeMs) / 86_400_000;
if (ageDays > 45) console.error(`warning: Alpaca's book is ${Math.round(ageDays)} days old`);
const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

const rows = [];
for (const row of source) {
  if (row.type !== "STOCK" && row.type !== "ETF") { drop(row.type === "CRYPTO" ? "crypto" : row.type); continue; }
  const venue = String(row.raw || "").trim().split(/\s+/).pop().toUpperCase();
  const place = VENUES[venue];
  if (!place) { drop(`${venue} listing (venue not named by Investlink)`); continue; }
  if (row.usResidentsOnly) { drop("PTP without qualified notice (US residents only at Alpaca)"); continue; }
  rows.push({
    query: row.query,
    ticker: row.ticker,
    name: row.name,
    exchange: place.exchange,
    mic: place.mic,
    currency: "USD",
    type: row.type,
    isin: row.isin,
    raw: row.raw,
  });
}

const check = (ticker, isin, mic, type) => {
  const row = rows.find((item) => item.ticker === ticker);
  if (!row || row.isin !== isin || row.mic !== mic || row.type !== type) {
    throw new Error(`${ticker} was not stored as the ${mic} ${type} ${isin}`);
  }
};
check("AAPL", "US0378331005", "XNAS", "STOCK");
check("SPY", "US78462F1030", "ARCX", "ETF");
check("JPM", "US46625H1005", "XNYS", "STOCK");

const unresolved = new Set();
for (const row of rows) if (!resolveVenue(row).venue) unresolved.add(`${row.exchange}|${row.mic}`);
if (unresolved.size) throw new Error(`venues not resolved: ${[...unresolved].join(", ")}`);

const stocks = rows.filter((row) => row.type === "STOCK").length;
const etfs = rows.filter((row) => row.type === "ETF").length;
if (rows.length < 5000 || stocks < 4000 || etfs < 3000) {
  throw new Error(`the book looks truncated (${stocks} shares, ${etfs} ETFs)`);
}

rows.sort((left, right) =>
  left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

const final = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

const tally = new Map();
for (const row of final) tally.set(`${row.mic} ${row.type}`, (tally.get(`${row.mic} ${row.type}`) || 0) + 1);
console.error(
  `${final.length} rows -> ${OUTPUT.pathname}\n` +
    [...tally].sort().map(([key, count]) => `  ${key}: ${count}`).join("\n") +
    `\n  left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
