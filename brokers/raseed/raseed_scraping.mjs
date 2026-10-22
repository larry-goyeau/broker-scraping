// What Raseed (Raseed Invest, DIFC; trades through Fullerverse (SC) Limited)
// sells in shares and ETFs, with no login. The site sells "US Stocks &
// ETFs" and its pricing page gives the fee for US stock trades only ($0.50
// minimum, $3 cap). The market table on raseedcapital.com is fed by a
// public paged search, one call per category: "cs" (shares) and "etf".
// Each line is a symbol, a name, a class and a currency, with no venue and
// no ISIN. The third category, crypto, is not read.
//
// The search also holds Saudi (class sa_equity, SAR) and UAE (ae_equity,
// AED) lines. They stay out: no Raseed page offers those markets for
// trading or prices them, and the places on file are the US ones.
//
// The US book is one NBBO, so each title is one row in dollars. The venue
// is the primary listing that Nasdaq Trader's directories of the day give
// for the symbol, and the ISIN the one ../../assets lists hold for it on a
// US exchange (usRow in ../mitsubishiufjesmart/japan.mjs). A symbol the
// directories do not hold (an OTC name, a company gone from the tape that
// the search still carries) is left out. The "cs" list mixes in ETFs, so
// the directory's ETF flag decides the type there. Rights, warrants, SPAC
// units and corporate (share plus note) units are not shares and stay out;
// a partnership's common units are its shares and stay in. A closed-end
// fund is a fund that is not an ETF: a "cs" line with no directory ETF
// flag that the asset lists hold on a US exchange only as a fund, never as
// a share, stays out. An ETN stays in as an ETF, as elsewhere in the repo.
//
// The directories must be the ones of the day (their File Creation Time
// is today in New York, Friday's at a weekend): a fund that closed the
// day before is still in yesterday's file and in Raseed's search, so a
// stale directory throws (./usTape.mjs). Raseed's search has no halt or
// tradable flag, so two more checks leave out what cannot be traded:
// a symbol with an open halt (no resumption date) in the NYSE current
// trade halts download or the Nasdaq Trader trade-halts RSS, and a line
// whose Raseed lastTradeTime is more than 14 days older than the newest
// one in the search (ten sessions with no trade: an old halt).
//
//   https://raseedcapital.com/en/stocks
//   https://raseedcapital.com/en/pricing
//   https://beta-api.raseedinvest.com/api/trading-service/web/symbol/search?limit=1000&page=1&categories[]=cs
//   https://beta-api.raseedinvest.com/api/trading-service/web/symbol/search?limit=1000&page=1&categories[]=etf
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   https://www.nyse.com/api/trade-halts/current/download
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts
//
//   node brokers/raseed/raseed_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, usRow } from "../mitsubishiufjesmart/japan.mjs";
import { LISTING, openHalts, tapeKey, usDirectory } from "./usTape.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SEARCH = "https://beta-api.raseedinvest.com/api/trading-service/web/symbol/search";
const PAGE_SIZE = 1000;
const FLOOR = { cs: 6000, etf: 3000 };
const CLASSES = new Set(["us_equity", "sa_equity", "ae_equity"]);
const STALE_DAYS = 14;
const US_MICS = new Set(Object.values(LISTING));
const US_LISTS = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, accept = "application/json") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, Origin: "https://raseedcapital.com", Referer: "https://raseedcapital.com/" },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function category(name) {
  const lines = [];
  let total = null;
  for (let page = 1; page < 100; page += 1) {
    const body = JSON.parse(await get(`${SEARCH}?limit=${PAGE_SIZE}&page=${page}&categories[]=${name}`));
    if (!Number.isInteger(body?.total) || !Array.isArray(body?.data)) throw new Error(`${name} page ${page}: no total or data`);
    if (total === null) total = body.total;
    if (body.total !== total) throw new Error(`${name}: total moved from ${total} to ${body.total}`);
    lines.push(...body.data);
    if (!body.data.length || lines.length >= total) break;
  }
  if (lines.length !== total) throw new Error(`${name}: ${lines.length} lines for a total of ${total}`);
  if (total < FLOOR[name]) throw new Error(`${name}: only ${total} lines`);
  return lines;
}

// Raseed writes a preferred FITB.PRK and a bare series DCOM.PR; the
// directory files them FITB$K and DCOM$.
const actSymbol = (symbol) => symbol.replace(/\.PR([A-Z]?)$/, "$$$1");

// Tickers the asset lists hold on a US exchange, as a fund and as a share.
function usAssetTickers(file) {
  const tickers = new Set();
  for (const [ticker, exchange] of parseCsv(fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8")).slice(1)) {
    if (US_LISTS.has(exchange)) tickers.add(String(ticker).split(":").pop());
  }
  if (tickers.size < 2000) throw new Error(`assets/${file} holds only ${tickers.size} US tickers`);
  return tickers;
}

const RIGHT_OR_WARRANT = /\b(?:rights?|warrants?)\s*$|\s-\s(?:share\s+)?(?:rights?|warrants?)\b/i;
const NOT_A_SHARE_UNIT = /\bunits?,?\s+each\s+consisting\b|\s-\s+units?\s*$|\b(?:corporate|tangible equity)\s+units\b/i;
const ETF_NAME = /\bET[FN]s?\b|exchange[- ]traded|\btrust\b/i;

const [shares, etfs, tape, halts] = await Promise.all([category("cs"), category("etf"), usDirectory(), openHalts()]);
const listed = tape.symbols;
const newest = Math.max(...[...shares, ...etfs].map((line) => Number(line.lastTradeTime) || 0));
if (!(newest > Date.now() - 10 * 86_400_000)) throw new Error(`Raseed's newest lastTradeTime is ${new Date(newest).toISOString()}`);
const funds = usAssetTickers("etfs.csv");
const stocks = usAssetTickers("stocks.csv");

const rows = [];
const seen = new Set();
const out = { gulf: 0, unlisted: [], rights: 0, units: 0, closedEnd: 0, halted: [], stale: [] };
for (const [kind, lines] of [["cs", shares], ["etf", etfs]]) {
  for (const line of lines) {
    const symbol = String(line.symbol || "").trim().toUpperCase();
    const name = String(line.name || "").replace(/\s+/g, " ").trim();
    if (!CLASSES.has(line.class)) throw new Error(`${symbol} has class ${line.class}`);
    if (!/^[A-Z0-9]+(?:\.[A-Z0-9]+)?$/.test(symbol)) throw new Error(`unreadable symbol ${JSON.stringify(line.symbol)}`);
    if (line.class !== "us_equity") {
      out.gulf += 1;
      continue;
    }
    if (line.currency && line.currency !== "USD") throw new Error(`${symbol} is quoted in ${line.currency}`);
    if (seen.has(symbol)) throw new Error(`${symbol} is listed twice`);
    seen.add(symbol);
    const act = actSymbol(symbol);
    const entry = listed.get(act);
    if (!entry) {
      out.unlisted.push(symbol);
      continue;
    }
    if (!entry.mic) throw new Error(`${symbol} is listed on exchange code ${entry.code}`);
    if (RIGHT_OR_WARRANT.test(entry.name)) {
      out.rights += 1;
      continue;
    }
    if (NOT_A_SHARE_UNIT.test(entry.name)) {
      out.units += 1;
      continue;
    }
    // An ETF line with no directory flag is an ETN or a commodity trust,
    // unless the directory names it a share (a few shares sit in "etf").
    const type = entry.etf || (kind === "etf" && ETF_NAME.test(entry.name)) ? "ETF" : "STOCK";
    if (kind === "cs" && type === "STOCK" && funds.has(symbol) && !stocks.has(symbol)) {
      out.closedEnd += 1;
      continue;
    }
    if (halts.has(tapeKey(act))) {
      out.halted.push(halts.get(tapeKey(act)));
      continue;
    }
    // A line with no trade time yet (a fund listed this week) stays in.
    if (line.lastTradeTime != null && !Number.isFinite(Number(line.lastTradeTime))) throw new Error(`${symbol} has lastTradeTime ${line.lastTradeTime}`);
    if (line.lastTradeTime != null && Number(line.lastTradeTime) < newest - STALE_DAYS * 86_400_000) {
      out.stale.push(`${symbol} ${new Date(Number(line.lastTradeTime)).toISOString().slice(0, 10)}`);
      continue;
    }
    const found = usRow({ symbol, name, type });
    rows.push({
      query: US_MICS.has(found.mic) && found.isin ? found.isin : symbol,
      ticker: symbol,
      // Raseed often names an ETF after its issuing trust ("ProShares
      // Trust"); the directory names the fund itself.
      name: (type === "ETF" ? entry.name : name) || name || entry.name,
      exchange: entry.mic,
      mic: entry.mic,
      currency: "USD",
      type,
      isin: US_MICS.has(found.mic) ? found.isin || "" : "",
      raw: [symbol, name, line.class, kind, entry.name].filter(Boolean).join(" | "),
      ...(found.matches && US_MICS.has(found.mic) ? { matches: found.matches } : {}),
    });
  }
}

function expect(ticker, type, exchange) {
  const row = rows.find((item) => item.ticker === ticker);
  if (!row) throw new Error(`${ticker} is missing`);
  if (row.type !== type) throw new Error(`${ticker} is a ${row.type}`);
  if (row.exchange !== exchange) throw new Error(`${ticker} is on ${row.exchange}`);
}
expect("AAPL", "STOCK", "XNAS");
expect("JPM", "STOCK", "XNYS");
expect("SPY", "ETF", "ARCX");
expect("QQQ", "ETF", "XNAS");
expect("SOXL", "ETF", "ARCX");
const usLines = shares.length + etfs.length - out.gulf;
if (out.unlisted.length > 0.08 * usLines) throw new Error(`${out.unlisted.length} of ${usLines} symbols in no US directory`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
const etfCount = kept.filter((row) => row.type === "ETF").length;
if (kept.length - etfCount < 5000 || etfCount < 4000) throw new Error(`short list: ${kept.length - etfCount} shares, ${etfCount} ETFs`);
fs.writeFileSync(new URL("raseed-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const counts = {};
for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(
  `Raseed: ${kept.length} rows (${kept.length - etfCount} STOCK, ${etfCount} ETF), ${kept.filter((row) => row.isin).length} with an ISIN`,
  counts,
  `directories of ${tape.created["nasdaqlisted.txt"]} ET; left out: ${out.gulf} Saudi/UAE, ${out.unlisted.length} in no US directory, ` +
    `${out.halted.length} halted [${halts.sources.join(", ")}] (${out.halted.map((item) => item.split(" ")[0]).join(" ") || "none"}), ` +
    `${out.stale.length} with no trade in ${STALE_DAYS} days (${out.stale.join(", ") || "none"}), ` +
    `${out.rights} rights/warrants, ${out.units} units, ${out.closedEnd} closed-end funds, ${rows.length - kept.length} notes`,
);
