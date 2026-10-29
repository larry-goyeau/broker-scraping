// What HDFC Securities (HDFC securities Ltd, India; the classic hdfcsec.com
// and InvestRight account) sells in shares and ETFs, with no login. HDFC Sky
// (../hdfcsky) is the same company's separate discount app. It has its own
// tariff (Rs 20 an order) and its own scrip file, which carries BSE group P.
// It is not this catalogue.
//
// NSE and BSE. The broker's own security master is public. It is the file
// of its InvestRight API, one CSV of about 128,000 lines with no login. The
// cash lines are those with instrument_segment EQUITY on NSE or BSE (about
// 5,200 and 9,100 in October 2026). A line carries the exchange token
// (exch_security_id: the NSE token, or the BSE scrip code), a symbol and a
// close. It has no ISIN, no series and no name. Its symbol is not reliable
// on old lines: matured bonds were given the symbol of a live share
// (HDC37GMFNR is printed as WAAREEENER), and the BSE symbol is often blank.
// So each line is read by its exchange token in the Upstox instrument file
// of the day, which gives the exchange symbol, the series or group, the ISIN
// and the name. A token the exchanges no longer carry is a dead line
// (matured bonds, expired rights, delisted shares) and is left out. About
// 4,300 lines go this way.
// The lines are then typed and filtered as in ../bajaj/indiaBook.mjs. An
// INE or IN9 ISIN in a series or group that takes orders is a STOCK. An INF
// ISIN is an ETF when the NSE's ETF list or the BSE's ETF group or name
// says so. Other fund units, debt series, iNAV lines, rights entitlements,
// and BSE scrips the BSE lists as Suspended or Delisted are left out. One
// row per exchange, in INR.
// The exchange book completes the master. The whole NSE and BSE book is
// read and filtered the same way, and every title of it the master lacks
// is added, marked "exchange book" in raw. In October 2026 the master
// lacked 87 BSE titles, 54 of them in group P (shares listed elsewhere and
// only permitted on the BSE), and 5 NSE ones: the new Mirae TOP20 ETF, two
// privately placed InvITs, a partly paid share and a relisted share. HDFC
// Securities is a full-service NSE and BSE member that trades every listed
// security; it names no exception on them (below). Owner's rule
// (2026-10-28): a title whose availability is uncertain is kept, since a
// catalogue with more titles than reality beats one with fewer. Titles
// that do not exist (delisted, suspended) and debt lines stay out, as the
// filters already leave them out of the book. Far more missing still stops
// the run: it means the master or the join went wrong.
// The "List of Eligible Scrips" page lists margin, intraday and collateral
// scrips. It does not limit delivery buying and is not applied.
// broker-list.json names no restriction on NSE or BSE.
//
// United States. The global investing page says "Diversify with 10,000+
// U.S. Stocks and ETFs". The service "is powered by Vested Finance" (VF
// Securities Inc.). No list is published without a login, and HDFC names no
// exception. Owner's rule (a stated count with no list): the 10,000 most
// popular US stocks and ETFs, ranked together. The count is read from the
// page at run time. The book is ../wellstrade/usBook.mjs: shares, ADRs,
// REITs, preferreds and closed-end funds (STOCK) and ETFs on Nasdaq, NYSE,
// NYSE American, NYSE Arca, Cboe BZX and the Texas exchanges. Warrants,
// rights, units, when-issued lines, listed notes and halted lines are not
// in it. ETNs are left out: they are notes, and the page says stocks and
// ETFs. Popularity is ../wellstrade/usPopular.mjs: the 30-day average daily
// volume times the last close, in dollars. A line with no 30-day figure
// takes the 10-day one, then the last day's traded value, then its market
// cap or net assets. OTC lines are not added: the page names none. The US
// is one NBBO market: one row per title, on its primary listing, in USD.
//
// Fees are published. Equity delivery is "0.50% or min Rs.25/-" for a
// resident (0.75% for an NRI), on the brokerage charges article (read from
// the site's CMS API, as the page renders it in the browser). The US plans
// are on the global investing page: Basic $2.99 a trade up to 299 shares,
// then $0.01 a share; Silver $0.99 a trade; Gold and Super Gold $0.01 a
// share.
//
//   https://developer.hdfcsec.com/oapi/v1/security-master
//   https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//   https://www.hdfcsec.com/globalinvesting
//   https://www.hdfcsec.com/article/brokeragecharges-3044
//   https://www.hdfcsec.com/api/cmsapi/GetArticleByPermalink?permalink=brokeragecharges-3044
//   https://www.hdfcsec.com/list-of-eligible-scrips
//
//   node brokers/hdfcsec/hdfcsec_scraping.mjs

import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv } from "../../indianCash.mjs";
import { indiaLists, masterIndia, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays, plainText } from "../bajaj/pageSays.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const MASTER = "https://developer.hdfcsec.com/oapi/v1/security-master";
const UPSTOX = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const GLOBAL = "https://www.hdfcsec.com/globalinvesting";
const FEES = "https://www.hdfcsec.com/api/cmsapi/GetArticleByPermalink?permalink=brokeragecharges-3044";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const COLUMNS = ["exchange", "security_id", "instrument_segment", "exch_security_id", "symbol_name", "close_price"];
// About 85% of the cash lines of October 2026 (NSE 5,235, BSE 9,138).
const MASTER_FLOOR = { NSE: 4400, BSE: 7700 };
// Exchange titles missing from the master in October 2026, then added
// from the exchange book: NSE 5, BSE 87. Far more means the master or the
// join went wrong.
const MISSING_CEILING = { NSE: 60, BSE: 400 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

// The pages still say what the header quotes.
const global = await pageSays(GLOBAL, [
  /Diversify with [\d,]+\+ U\.S\. Stocks and ETFs/i,
  /Global Investing product of HDFC Securities is powered by Vested Finance/i,
  /\$2\.99 per Trade/i,
]);
const stated = Number(global.match(/Diversify with ([\d,]+)\+ U\.S\. Stocks and ETFs/i)[1].replace(/,/g, ""));
if (!(stated >= 1000)) throw new Error(`the global investing page states ${stated} US titles`);
// The API answers a JSON string that holds the JSON; the article body is
// URL-encoded HTML.
let article = JSON.parse((await get(FEES)).toString("utf8"));
if (typeof article === "string") article = JSON.parse(article);
const body = plainText(decodeURIComponent(article?.[1]?.data?.[0]?.OBJECT1 || ""));
if (!/Resident Indians - 0\.50% or min Rs\.25/i.test(body)) throw new Error(`${FEES} no longer prints the 0.50% delivery brokerage`);

// The broker's cash lines.
const master = parseCsv((await get(MASTER)).toString("utf8"));
for (const column of COLUMNS) if (!(column in (master[0] || {}))) throw new Error(`security master has no ${column} column`);
const cash = master.filter((line) => (line.exchange === "NSE" || line.exchange === "BSE") && line.instrument_segment === "EQUITY");
for (const exchange of ["NSE", "BSE"]) {
  const count = cash.filter((line) => line.exchange === exchange).length;
  if (count < MASTER_FLOOR[exchange]) throw new Error(`security master has only ${count} ${exchange} EQUITY lines`);
}

// The exchange lines of the day, by token.
const upstox = JSON.parse(gunzipSync(await get(UPSTOX)).toString("utf8"));
const byToken = new Map();
for (const line of upstox) {
  if (line.segment !== "NSE_EQ" && line.segment !== "BSE_EQ") continue;
  if (!line.exchange_token || !("trading_symbol" in line) || !("isin" in line) || !("instrument_type" in line)) throw new Error(`Upstox line changed shape: ${JSON.stringify(line).slice(0, 200)}`);
  byToken.set(`${line.exchange}|${line.exchange_token}`, line);
}
if (byToken.size < 15000) throw new Error(`Upstox file has only ${byToken.size} NSE and BSE cash lines`);

const lines = [];
const dead = { NSE: 0, BSE: 0 };
for (const line of cash) {
  const hit = byToken.get(`${line.exchange}|${String(line.exch_security_id).trim()}`);
  if (!hit) {
    dead[line.exchange] += 1;
    continue;
  }
  lines.push({
    exchange: line.exchange,
    ticker: String(hit.trading_symbol).trim().toUpperCase(),
    series: String(hit.instrument_type || "").trim().toUpperCase(),
    isin: hit.isin,
    name: String(hit.name || "").replace(/\s+/g, " ").trim(),
    house: [line.security_id, line.exch_security_id, line.symbol_name].filter(Boolean).join(" "),
  });
}

const lists = await indiaLists();
const india = masterIndia(lists, lines);
// The broker's code and token stay in raw, so a row can be found in the master.
const house = new Map(lines.map((line) => [`${line.exchange}|${line.ticker}`, line.house]));
for (const row of india) row.raw = `${row.raw} ${house.get(`${row.exchange}|${row.ticker}`) || ""}`.trim();

// The exchange book completes the master: a title of the book the master
// lacks is added, marked in raw.
const whole = wholeIndia(lists);
const have = new Set(india.map((row) => `${row.exchange}|${row.isin}`));
const missing = { NSE: [], BSE: [] };
for (const row of whole) if (!have.has(`${row.exchange}|${row.isin}`)) missing[row.exchange].push(row);
for (const exchange of ["NSE", "BSE"]) {
  if (missing[exchange].length > MISSING_CEILING[exchange]) throw new Error(`${missing[exchange].length} ${exchange} titles of the exchange book are not in the master: ${missing[exchange].slice(0, 30).map((row) => row.ticker).join(" ")}`);
  for (const row of missing[exchange]) india.push({ ...row, raw: `${row.raw} exchange book` });
}
india.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

// United States: the stated count of the most popular stocks and ETFs.
const book = await usBook();
const offered = withoutObligations(book).filter((row) => row.type === "STOCK" || row.type === "ETF");
const us = await topN(offered, stated, { types: ["STOCK", "ETF"] });
if (us.length !== stated) throw new Error(`only ${us.length} US lines for ${stated} stated`);
for (const ticker of ["AAPL", "SPY", "NFLX", "SBUX"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`US ${ticker} is not in the top ${stated}`);

const rows = stampRows(withoutObligations([...india, ...us]));
// The shared US lists can give one ISIN to two tickers. In October 2026 the
// Strive preferred that took the SATS ticker got EchoStar's ISIN (EchoStar
// is now ECHO) from assets/stocks.csv, through stampRows. A preferred line
// that shares its ISIN with another US line keeps none, and is found by its
// ticker.
const sharing = new Map();
for (const row of rows) if (row.currency === "USD" && row.isin) sharing.set(row.isin, [...(sharing.get(row.isin) || []), row]);
for (const [isin, list] of sharing) {
  if (list.length < 2) continue;
  for (const row of list) {
    if (!/\bPreferred\b/i.test(row.name)) continue;
    row.isin = "";
    row.query = row.ticker;
  }
  const left = list.filter((row) => row.isin === isin);
  if (left.length > 1) throw new Error(`US ISIN ${isin} is on ${left.map((row) => row.ticker).join(" and ")}`);
}

if (rows.length < stated + 7500) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("hdfcsec-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) {
  const place = row.exchange === "NSE" || row.exchange === "BSE" ? row.exchange : "US";
  counts[`${place} ${row.type}`] = (counts[`${place} ${row.type}`] || 0) + 1;
}
const { report } = us;
console.error(
  `${rows.length} rows (${Object.entries(counts).map(([key, n]) => `${n} ${key}`).join(", ")}); ` +
    `master ${cash.length} cash lines, ${dead.NSE} NSE and ${dead.BSE} BSE no longer listed; ` +
    `left out ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}; ` +
    `added from the exchange book: NSE ${missing.NSE.length} (${missing.NSE.map((row) => row.ticker).join(" ")}), BSE ${missing.BSE.length} (${missing.BSE.slice(0, 12).map((row) => row.ticker).join(" ")}${missing.BSE.length > 12 ? " ..." : ""}); ` +
    `US ${stated} stated, top ${report.kept} of ${report.among} stocks and ETFs, #${stated} ${report.cutoff.text}, ` +
    `${report.keptSizeOnly} kept by size only, ${report.keptNoData} with no data`,
);
