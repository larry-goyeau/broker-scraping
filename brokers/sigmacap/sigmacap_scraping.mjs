// What Sigma Capital sells in shares and exchange-traded funds, with no
// login. Sigma is a member of the Egyptian Exchange. Its public market
// page (Sigma Max) loads one symbol file with every line its trading
// system quotes. That file is the book. Each line gives the Reuters
// code, the English and Arabic names, the ISIN, the market and a
// currency code.
//
// The EGX lines are the main market (NOPL), the SME market and the EGX
// over-the-counter board (OOTC), where delisted companies still trade
// through the exchange. All three are kept as EGX. The EGX 30 index ETF
// is the one ETF; it is filed on the main market. Subscription rights,
// listed mutual and real-estate fund certificates (KASABF, EGREF) and
// the open-end fund line (FNDS) are not shares or ETFs and stay out, as
// do the EGX indices (market -1).
//
// About forty EGX lines have no low and no high for the year (both 0).
// They are codes set up in the trading system that do not trade: state
// companies waiting for an offering (Banque du Caire, Enppi, Misr Life),
// old delisted names and unused SPAC shells. None is on Sigma's
// traded-stocks file or in Al Rowad's book. They stay out.
//
// The file keeps two old codes: QNBA for Qatar National Bank (now QNBE)
// and PSAD for REKAZ (now RKAZ). The ISIN is right, so the rows stand.
//
// The file also carries some forty-five other lines (markets 2, 3 and
// 5): a few US shares and ETFs, London GDRs, Amsterdam and Dubai lines,
// CFDs, futures, Eurobonds, treasury bills and mutual funds. The broker
// lists only the Egyptian Exchange as a place, so they are not written.
//
// Currency code 01 is the pound and 02 the dollar: Nile Sat (EGSA),
// El Shams Pyramids (SPHT), Faisal Bank's dollar line (FAITA) and the
// "$" line of Saudi Egyptian Investment (SEIGA) all carry 02.
//
//   https://www.sigma-cap.com/max/
//   https://www.sigma-cap.com/sigmaapi/getmarketdata/marketdata
//   https://www.sigma-cap.com/test/get_traded_stocks_xml
//
//   node brokers/sigmacap/sigmacap_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SOURCE = "https://www.sigma-cap.com/sigmaapi/getmarketdata/marketdata";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CURRENCY = { "01": "EGP", "02": "USD" };
const EGX_MARKETS = { NOPL: "main market", SME: "SME market", OOTC: "OTC board" };
const OTHER_MARKETS = new Set(["-1", "FNDS", "2", "3", "5"]);
const STOCK_FLOOR = 230;

async function symbols() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SOURCE, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const list = body?.response?.data?.symbols;
      if (body?.result !== 1 || !Array.isArray(list)) throw new Error(`unexpected answer ${JSON.stringify(body).slice(0, 200)}`);
      return list;
    } catch (error) {
      last = error.message;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`${SOURCE}: ${last}`);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function tally(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

const list = await symbols();
const leftOut = new Map();
const rows = [];
const seen = new Set();

for (const line of list) {
  const market = clean(line.marketCode);
  const ticker = clean(line.reuter).toUpperCase();
  const nameEn = clean(line.nameEn || line.name);
  const nameAr = clean(line.nameAr);
  if (OTHER_MARKETS.has(market)) {
    tally(leftOut, market === "-1" ? "indices" : market === "FNDS" ? "open-end funds" : "other-market lines");
    continue;
  }
  if (!EGX_MARKETS[market]) throw new Error(`${ticker}: unknown market ${JSON.stringify(market)}`);
  if (/_R\d*$/.test(ticker) || /^Subscription Rights/i.test(nameEn) || /^حق\s*اكتتاب/.test(nameAr)) {
    tally(leftOut, "subscription rights");
    continue;
  }
  const isEtf = /ETF$/.test(ticker) || /\bETF\b/i.test(nameEn) || /صناديق المؤشرات/.test(nameAr);
  if (!isEtf && (/\bfund\b|certificates/i.test(nameEn) || /وثائق|صندوق|صناديق/.test(nameAr))) {
    tally(leftOut, "fund certificates");
    continue;
  }
  if (!(Number(line.lowYear) > 0) && !(Number(line.highYear) > 0)) {
    tally(leftOut, "lines with no trade in the year");
    continue;
  }
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(ticker)) throw new Error(`odd ticker ${JSON.stringify(line.reuter)}`);
  if (!nameEn) throw new Error(`${ticker} has no name`);
  const isin = clean(line.isin).toUpperCase();
  if (!/^EG[A-Z0-9]{10}$/.test(isin)) throw new Error(`${ticker}: no Egyptian ISIN (${isin})`);
  const currency = CURRENCY[clean(line.currency)];
  if (!currency) throw new Error(`${ticker}: unknown currency code ${JSON.stringify(line.currency)}`);
  if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
  seen.add(ticker);
  seen.add(isin);
  const type = isEtf ? "ETF" : "STOCK";
  rows.push({
    query: ticker,
    ticker,
    name: nameEn,
    exchange: "EGX",
    currency,
    type,
    isin,
    mic: "XCAI",
    raw: [`${ticker}.CA`, nameEn, EGX_MARKETS[market], currency, isin, type].join(" "),
  });
}

const count = (test) => rows.filter(test).length;
if (count((row) => row.type === "STOCK") < STOCK_FLOOR) throw new Error(`only ${count((row) => row.type === "STOCK")} EGX shares (floor ${STOCK_FLOOR})`);
if (count((row) => row.type === "ETF") < 1) throw new Error("the EGX 30 index ETF is missing");
if (count((row) => row.currency === "USD") < 2) throw new Error("the dollar lines are missing");

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("sigmacap-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byLine = new Map();
for (const row of rows) tally(byLine, `${row.exchange} ${row.currency} ${row.type}`);
console.error(
  `${rows.length} listings: ${[...byLine].map(([key, value]) => `${key} ${value}`).join(", ")}. ` +
    `Left out: ${[...leftOut].map(([reason, value]) => `${value} ${reason}`).join(", ")}.`
);
