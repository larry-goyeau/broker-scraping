// What Mirae Asset Sharekhan (Sharekhan Ltd, India) sells in shares and
// ETFs, with no login.
//
// NSE and BSE. Sharekhan's own trading API (SKAPI) serves its scrip
// masters to the public: one JSON file for NSE cash (NC) and one for BSE
// cash (BC). Each line carries the scrip code, the trading symbol, the
// series (instType), the ISIN and a name. The files are slow (20 seconds
// to 2 minutes each) and keep many dead lines, so every line is checked
// against the exchange before it is kept:
// - NSE: the symbol, or else the ISIN, must be in today's NSE cash book
//   (NSE EQUITY_L and the Upstox instrument file, ../../indianCash.mjs).
//   About 2,060 lines whose symbol ends in "§" are BSE scrips (all are in
//   the BSE book, not the NSE's), not NSE listings, and are left out. So
//   are about 190 lines the NSE no longer trades: old scrips (SEL
//   Manufacturing, Educomp), closed fund plans in the "MF" series, matured
//   bonds. The NSE series comes from the cash book.
// - BSE: the symbol, or else the ISIN, must be in today's BSE cash book
//   (Upstox) or on the BSE's Active scrip list. About 3,900 lines are in
//   neither, nearly all old scrip codes, and are left out. The BSE group
//   (A, B, X, E for ETFs, IF for REITs and InvITs, F for debt) comes from
//   the cash book.
// A symbol the exchange has changed is written under its new name (BSE
// IMPERA, once RISHYRN), with the exchange's ISIN.
// Then each line is typed and filtered by ../bajaj/indiaBook.mjs, as for
// the other Indian brokers: an INE or IN9 ISIN in a share series or group
// is a STOCK (shares, SME shares, REITs, InvITs, partly paid shares); an
// INF ISIN is an ETF when the NSE ETF list holds it, the BSE files it in
// group E, or the BSE names it an ETF. Left out there: debt series and
// groups (bonds, gold bonds, government securities, commercial paper),
// iNAV lines and indices, fund units that are not ETFs (fixed maturity
// plans, interval and specialised investment fund units), rights entitlements, BSE scrips the BSE
// lists as Suspended or Delisted, and NSE lines listed after today. One
// row per exchange for a title on both, in INR.
// The exchange book completes Sharekhan's files. The run reads the whole
// NSE and BSE book the same way, and every title of it the files lack is
// added, marked "exchange book" in raw. On 2026-10-28 they lacked three:
// Ambalal Sarabhai on the NSE (BE series) and two Mirae Asset ETFs listed
// on the BSE that week (ENERGY, INFRA). Sharekhan is a full-service NSE
// and BSE member that trades every listed security, and a scrip master
// lags new listings. Owner's rule (2026-10-28): a title whose availability
// is uncertain is kept, since a catalogue with more titles than reality
// beats one with fewer. Titles that do not exist (delisted, suspended) and
// debt lines stay out, as the filters already leave them out of the book.
// The run still stops if the files miss more than a few titles: that means
// a file or the join went wrong.
//
// United States. "Buy Apple, NVIDIA, Google, SpaceX, and 10,000+ US stocks
// and ETFs directly from India via GIFT City", "2,500+ fractional stocks
// and ETFs", through Mirae Asset Capital Markets (IFSC), co-powered by
// ViewTrade International IFSC; orders are "Routed to US market makers"
// and filled "at NBBO". No list is published and no kind, exchange or
// title is named as excluded. Under the owner's rule (a stated count with
// no list is the N most popular titles of the place), the book is the
// 10,000 most popular lines of the US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less warrants, rights, units, when-issued lines,
// listed notes and halted lines), shares and ETFs ranked together by
// 30-day average traded value in dollars, market cap or net assets when
// there is no volume (../wellstrade/usPopular.mjs). The count is read from
// the page at each run. The US is one NBBO market: one row per title on
// its primary listing, in USD.
//
// Fees. India: "Equity - Delivery brokerage 0.30% on trade price or
// minimum 1 paisa per share", intraday 0.02% (pricing page). US: no
// figure is published; the US page only says "Brokerage and other charges
// will apply as per tariff rates at the sole discretion of Sharekhan
// Limited and ViewTrade International IFSC Pvt. Ltd.". The US place is
// kept, with that gap reported.
//
//   https://api.sharekhan.com/skapi/services/master/NC
//   https://api.sharekhan.com/skapi/services/master/BC
//   https://www.sharekhan.com/global-markets/invest-in-us-stocks
//   https://www.sharekhan.com/pricing
//   https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//
//   node brokers/sharekhan/sharekhan_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { isinOf } from "../../indianCash.mjs";
import { indiaLists, masterIndia, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const MASTER = "https://api.sharekhan.com/skapi/services/master/";
const US_PAGE = "https://www.sharekhan.com/global-markets/invest-in-us-stocks";
const PRICING = "https://www.sharekhan.com/pricing";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FIELDS = ["scripCode", "instType", "companyName", "isinCode", "tradingSymbol"];
// The files held 7,821 (NC) and 16,914 (BC) lines on 2026-10-28.
const LINES = { NC: 6500, BC: 14000 };
// Titles of the exchange book a Sharekhan file may lack, added from the
// book (a fund listed this week; on 2026-10-28 the BSE file lacked Mirae
// Asset Nifty Energy ETF). Far more means a file or the join went wrong.
const MISSING = { NSE: 40, BSE: 80 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One SKAPI master, as { status, message, data: [...] }.
async function master(segment) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(MASTER + segment, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(300_000) });
      if (response.ok) {
        const body = JSON.parse(await response.text());
        const data = body?.data;
        if (body?.status !== 200 || !Array.isArray(data)) throw new Error(`SKAPI ${segment} changed shape: ${JSON.stringify(body).slice(0, 200)}`);
        if (data.length < LINES[segment]) throw new Error(`SKAPI ${segment} holds only ${data.length} lines`);
        for (const line of data) if (!FIELDS.every((field) => field in line)) throw new Error(`SKAPI ${segment} line changed shape: ${JSON.stringify(line).slice(0, 200)}`);
        return data;
      }
      last = `SKAPI ${segment} answered ${response.status}`;
    } catch (error) {
      if (/changed shape|holds only/.test(error.message)) throw error;
      last = `SKAPI ${segment}: ${error.message}`;
    }
    await pause(5_000 * (attempt + 1));
  }
  throw new Error(last);
}

const usText = await pageSays(US_PAGE, [
  /[\d,]+\+ US stocks and ETFs directly from India via GIFT City/i,
  /Co-powered by ViewTrade/i,
  /Brokerage and other charges will apply as per tariff rates at the sole discretion/i,
]);
await pageSays(PRICING, [/Equity - Delivery brokerage 0\.30% on trade price/i, /Equity - Intraday brokerage 0\.02% on trade price/i]);
const stated = Number(usText.match(/([\d,]+)\+ US stocks and ETFs directly from India/i)[1].replace(/,/g, ""));
if (!(stated >= 1000)) throw new Error(`the US page states ${stated} titles`);
// A published US brokerage figure would belong in sharekhan_cost.mjs.
if (/US\b[^.]{0,80}brokerage[^.]{0,40}(\d+(\.\d+)?%|USD\s?\d)/i.test(usText)) console.error("note: the US page may now print a US brokerage figure");

const lists = await indiaLists();
const [nc, bc] = [await master("NC"), await master("BC")];

// Today's cash book of each exchange, by ISIN -> [symbol, entry].
const byIsin = { NSE: new Map(), BSE: new Map() };
for (const [key, entry] of lists.book) {
  const [exchange, ticker] = key.split("|");
  if (byIsin[exchange] && entry.isin && !byIsin[exchange].has(entry.isin)) byIsin[exchange].set(entry.isin, [ticker, entry]);
}

const dropped = { NSE: { "BSE scrip in the NSE file (§)": 0, "not on the NSE today": 0 }, BSE: { "not on the BSE today": 0 } };
const renamed = new Set();
const lines = [];
for (const [exchange, file] of [["NSE", nc], ["BSE", bc]]) {
  for (const line of file) {
    const symbol = String(line.tradingSymbol || "").trim().toUpperCase();
    const isin = isinOf(line.isinCode);
    if (!symbol || !isin) continue; // indices, test scrips, lines with no ISIN
    if (exchange === "NSE" && symbol.includes("§")) { dropped.NSE["BSE scrip in the NSE file (§)"] += 1; continue; }
    let ticker = symbol;
    let entry = lists.book.get(`${exchange}|${ticker}`);
    if (!entry || (entry.isin && entry.isin !== isin && byIsin[exchange].has(isin))) {
      const found = byIsin[exchange].get(isin);
      if (found) {
        [ticker, entry] = found;
        if (ticker !== symbol) renamed.add(`${exchange}|${ticker}`);
      }
    }
    if (!entry && !(exchange === "BSE" && lists.bseNames.has(isin))) { dropped[exchange][exchange === "NSE" ? "not on the NSE today" : "not on the BSE today"] += 1; continue; }
    const exchangeName = entry?.name && entry.name.toUpperCase() !== ticker ? entry.name : "";
    const fileName = String(line.companyName || "").replace(/\s+/g, " ").trim();
    const kept = entry?.isin || isin;
    // The NSE names an ETF by its fund house and code ("MIRAEAMC -
    // MASPTOP50"); the BSE's scrip name is the fund's ("Mirae Asset S&P 500
    // Top 50 ETF"). indiaBook already names BSE rows that way.
    const name = exchange === "NSE" ? (kept.startsWith("INF") && lists.bseNames.get(kept)) || exchangeName || fileName : fileName || exchangeName;
    lines.push({ exchange, ticker, series: entry?.series || String(line.instType || "").trim().toUpperCase(), isin: kept, name });
  }
}
const india = masterIndia(lists, lines);
const renamedKept = india.filter((row) => renamed.has(`${row.exchange}|${row.ticker}`));

// The exchange book, filtered the same way, completes the files: a title
// of the book they lack is added, marked in raw.
const whole = wholeIndia(lists);
const missing = {};
for (const exchange of ["NSE", "BSE"]) {
  const have = new Set(india.filter((row) => row.exchange === exchange).map((row) => row.isin));
  missing[exchange] = whole.filter((row) => row.exchange === exchange && !have.has(row.isin));
  if (missing[exchange].length > MISSING[exchange]) throw new Error(`Sharekhan's ${exchange} file lacks ${missing[exchange].length} titles of the exchange book: ${missing[exchange].slice(0, 20).map((row) => row.ticker).join(" ")}`);
  for (const row of missing[exchange]) india.push({ ...row, raw: `${row.raw} exchange book` });
}
india.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

const book = await usBook();
const offered = withoutObligations(book);
if (offered.length < 10000) throw new Error(`only ${offered.length} lines in the US book`);
const us = await topN(offered, stated);
if (us.length !== stated) throw new Error(`${us.length} US rows, not ${stated}`);

const rows = stampRows(withoutObligations([...india, ...us]));
fs.writeFileSync(new URL("sharekhan-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) {
  const place = row.currency === "USD" ? "US" : row.exchange;
  counts[`${place} ${row.type}`] = (counts[`${place} ${row.type}`] || 0) + 1;
}
const listOf = (object) => Object.entries(object).filter(([, n]) => n).map(([why, n]) => `${n} ${why}`).join(", ");
const { report } = us;
console.error(
  `${rows.length} rows (${listOf(counts)}); SKAPI NC ${nc.length}, BC ${bc.length} lines; ` +
    `left out NSE: ${listOf(dropped.NSE)}; BSE: ${listOf(dropped.BSE)}; then ${listOf(india.left)}; ${renamedKept.length} kept under the exchange's newer symbol (${renamedKept.slice(0, 8).map((row) => `${row.exchange} ${row.ticker}`).join(", ")}${renamedKept.length > 8 ? " ..." : ""}); ` +
    `added from the exchange book (not in Sharekhan's files): NSE ${missing.NSE.length} (${missing.NSE.map((row) => row.ticker).join(" ")}), BSE ${missing.BSE.length} (${missing.BSE.map((row) => row.ticker).join(" ")}); ` +
    `US: the ${stated} most popular of ${report.among} lines, #${report.cutoff.rank} ${report.cutoff.text}, first left out ${report.firstLeftOut}, kept by size only ${report.keptSizeOnly}, with no data ${report.keptNoData}; US brokerage: no figure published`,
);
