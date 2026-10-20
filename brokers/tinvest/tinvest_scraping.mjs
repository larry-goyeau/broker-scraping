// What T-Investments (T-Bank, Russia) sells in shares and exchange funds,
// with no login. The public catalogues are server-rendered: each page
// carries its lines as JSON in a <script id="__REACT_QUERY_STATE__...">
// block (getStocksListQuery, getEtfsListQuery), with ticker, ISIN, currency,
// T-Bank's class code, the exchange it shows and the trading schedule. The
// start/end parameters page them; both lists are read, sorted by name, until
// the announced totals (about 2,340 shares and 272 funds) are reached.
//
//   https://www.tbank.ru/invest/stocks/?start=0&end=500&orderType=Asc&sortType=ByName
//   https://www.tbank.ru/invest/etfs/?start=0&end=500&orderType=Asc&sortType=ByName
//
// tbank.ru presents a certificate chain that ends in the Russian national
// root CA, which Node does not trust: requests to tbank.ru alone go through
// an https.Agent with rejectUnauthorized: false (the curl -k equivalent).
//
// Places. The catalogue names three: "Московская биржа" (Moscow Exchange),
// "СПБ Биржа" (SPB Exchange) and "Внебиржевой рынок" (OTC). Each line is
// written on its own place, with its own ticker and currency:
//
//   Moscow Exchange  "Moscow Exchange", MISX.
//   SPB Exchange     "SPB Exchange", XPET. The "@" SPB writes after the
//                    relisted MOEX fund tickers (TMOS@) is cut.
//   OTC              left out. These are the MTQR board (MOEX's OTC book
//                    with NCC as counterparty, foreign shares quoted in
//                    roubles, "-RM" tickers) and T-Bank's dealer lines
//                    (A25/A27, ZPIF_OTC). A line on the MTQR board is OTC
//                    whatever exchange the catalogue shows (FLNA-RM is
//                    labelled Moscow Exchange). spreads/venues.mjs has no
//                    venue for this book: "OTC" resolves to OTC Markets
//                    (OTCM), the American book, which is not it.
//
// Tradable. A line is kept only when the catalogue gives it a trading
// schedule (symbol.exchange is not "unknown") and neither noTrade nor
// blackout is set. A line with no schedule is shown "Торги недоступны"
// (trading unavailable) at any hour: the foreign shares and funds frozen
// on SPB since the November 2023 sanctions, the FinEx funds and delisted
// MOEX shares. The schedule does not depend on the hour, so the scraper can
// run at any time; the live status is kept in raw only.
//
// Lines for qualified investors only (tradeQualInvestor) are kept; the flag
// is in raw. Currency is the line's own (all live lines are in roubles).
// The ISIN is the catalogue's, without the suffix T-Bank adds to tell its
// lines apart (RU000A106DL2_SPB, US0320951017_MTQR).
//
// Type. A share line is a STOCK (depositary receipts included). A fund
// line is typed by the Moscow Exchange's own record of its ISIN: an
// exchange-traded BPIF (type exchange_ppif) is an ETF; an open-ended,
// interval or closed-end unit fund (public_ppif, interval_ppif,
// private_ppif: OPIF, IPIF, ZPIF) is not an ETF and is left out, like the
// closed-end funds of the other scrapers. A fund ISIN the Moscow Exchange
// does not know (SPB only) is left out when the catalogue flags it
// closed-end (isCEF), an ETF otherwise.
//
//   https://iss.moex.com/iss/securities.json?q=<ISIN>&iss.meta=off&securities.columns=secid,isin,type
//
// Account currencies: deposits in roubles, US dollars, yuan, Turkish lira,
// tenge and Belarusian roubles.
//
//   https://www.tbank.ru/invest/help/brokerage/account/trade-on-bs/insert-money/
//
//   node brokers/tinvest/tinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import https from "node:https";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.tbank.ru/invest";
const PAGE = 500;
const WORKERS = 4;
const LISTS = [
  { path: "stocks", query: "getStocksListQuery", floor: 2000 },
  { path: "etfs", query: "getEtfsListQuery", floor: 200 },
];
const ISS = "https://iss.moex.com/iss/securities.json?iss.meta=off&securities.columns=secid,isin,type&q=";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const PLACES = {
  "Московская биржа": { exchange: "Moscow Exchange", mic: "MISX" },
  "СПБ Биржа": { exchange: "SPB Exchange", mic: "XPET" },
  "Внебиржевой рынок": null,
};
const OTC_CLASSES = new Set(["MTQR", "A25", "A27", "ZPIF_OTC"]);
const FUND_TYPES = { exchange_ppif: "ETF", public_ppif: "FUND", interval_ppif: "FUND", private_ppif: "FUND" };
// Only for tbank.ru: its chain ends in the Russian national root CA.
const tbankAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: WORKERS });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getTbank(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: tbankAgent,
        timeout: 120_000,
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8" },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (response.statusCode !== 200) return reject(new Error(`${response.statusCode} ${url}`));
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
        response.on("error", reject);
      }
    );
    request.on("timeout", () => request.destroy(new Error(`timeout ${url}`)));
    request.on("error", reject);
  });
}

async function retry(task) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, task) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, worker));
  return out;
}

// The list query of a catalogue page: { total, values }.
function listOf(html, query) {
  for (const [, body] of html.matchAll(/<script id="__REACT_QUERY_STATE__[^"]*"[^>]*>([\s\S]*?)<\/script>/g)) {
    const state = JSON.parse(body);
    const hit = (state.queries || []).find((entry) => entry.queryKey?.[0] === query);
    if (hit) return hit.state.data;
  }
  throw new Error(`no ${query} on the page`);
}

const pageUrl = (path, start) => `${SITE}/${path}/?start=${start}&end=${start + PAGE}&orderType=Asc&sortType=ByName`;

async function loadList({ path, query, floor }) {
  const first = listOf(await retry(() => getTbank(pageUrl(path, 0))), query);
  const total = Number(first.total);
  if (!total || total < floor) throw new Error(`${path} announces ${first.total} lines`);
  const starts = [];
  for (let start = PAGE; start < total; start += PAGE) starts.push(start);
  const pages = await pool(starts, (start) => retry(async () => listOf(await getTbank(pageUrl(path, start)), query)));
  const lines = new Map();
  for (const page of [first, ...pages]) {
    if (Number(page.total) !== total) throw new Error(`${path} changed from ${total} to ${page.total}`);
    for (const value of page.values) lines.set(value.symbol.securityUids.instrumentUid, value);
  }
  if (lines.size !== total) throw new Error(`${path} announced ${total}, read ${lines.size} distinct lines`);
  return [...lines.values()];
}

async function moexFundType(isin) {
  return retry(async () => {
    const response = await fetch(ISS + isin, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${response.status} ISS ${isin}`);
    const body = await response.json();
    const row = body.securities.data.find((cells) => cells[1] === isin);
    return row ? row[2] : null;
  });
}

const catalogue = [];
for (const list of LISTS) catalogue.push(...(await loadList(list)).map((value) => ({ value, list })));
tbankAgent.destroy();

const left = new Map();
function leave(reason) {
  left.set(reason, (left.get(reason) || 0) + 1);
}

const kept = [];
for (const { value, list } of catalogue) {
  const symbol = value.symbol;
  const shown = normalize(symbol.exchangeShowName);
  if (!(shown in PLACES)) throw new Error(`${symbol.ticker}: unknown place ${shown}`);
  const kind = symbol.symbolType === "ETF" ? "fund" : "share";
  const otc = !PLACES[shown] || OTC_CLASSES.has(symbol.classCode) || /^(otc|dealer)/i.test(symbol.exchange);
  const live = symbol.exchange && symbol.exchange !== "unknown" && !symbol.noTrade && !symbol.blackout;
  if (!live) {
    leave(`${kind} ${otc ? "OTC" : PLACES[shown].exchange}: no trading schedule (trading unavailable)`);
    continue;
  }
  if (otc) {
    leave(`${kind} OTC (${symbol.classCode}): no venue in venues.mjs`);
    continue;
  }
  const isin = normalize(symbol.isin).toUpperCase().replace(/_.*$/, "");
  if (!ISIN.test(isin)) throw new Error(`${symbol.ticker}: ISIN ${symbol.isin}`);
  const currency = normalize(symbol.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${symbol.ticker}: currency ${symbol.currency}`);
  kept.push({ value, list, kind, isin, currency, place: PLACES[shown] });
}

const fundIsins = [...new Set(kept.filter((line) => line.kind === "fund").map((line) => line.isin))];
const answers = await pool(fundIsins, moexFundType);
const moexTypes = new Map(fundIsins.map((isin, index) => [isin, answers[index]]));

const rows = [];
const notEtf = [];
const unresolved = new Map();
for (const { value, kind, isin, currency, place } of kept) {
  const symbol = value.symbol;
  let type = "STOCK";
  let fundNote = "";
  if (kind === "fund") {
    const moex = moexTypes.get(isin);
    if (moex && !(moex in FUND_TYPES)) throw new Error(`${symbol.ticker}: MOEX type ${moex}`);
    type = moex ? FUND_TYPES[moex] : value.isCEF ? "FUND" : "ETF";
    fundNote = `MOEX type ${moex || "unknown"}${value.isCEF ? ", closed-end" : ""}`;
    if (type === "FUND") {
      notEtf.push(`${symbol.ticker} ${normalize(symbol.showName)} (${fundNote})`);
      continue;
    }
  }
  const ticker = normalize(symbol.ticker).replace(/@$/, "");
  const row = {
    query: ticker,
    ticker,
    name: normalize(symbol.showName),
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    isin,
    raw: [
      symbol.ticker,
      symbol.showName,
      symbol.isin,
      symbol.symbolType,
      symbol.classCode,
      symbol.currency,
      symbol.exchangeShowName,
      `schedule ${symbol.exchange}`,
      `status ${value.instrumentStatus}`,
      symbol.tradeQualInvestor ? "qualified investors only" : "",
      fundNote,
    ]
      .map(normalize)
      .filter(Boolean)
      .join(" | "),
  };
  const { venue } = resolveVenue(row);
  if (!venue || venue.mic !== row.mic) {
    const key = `${row.exchange} ${row.mic} ${row.currency}`;
    unresolved.set(key, (unresolved.get(key) || 0) + 1);
  }
  rows.push(row);
}

const seen = new Set();
for (const row of rows) {
  const key = `${row.isin}|${row.mic}|${row.currency}`;
  if (seen.has(key)) throw new Error(`${key} twice`);
  seen.add(key);
}

const count = (mic, type) => rows.filter((row) => row.mic === mic && row.type === type).length;
if (count("MISX", "STOCK") < 120) throw new Error(`only ${count("MISX", "STOCK")} MOEX shares`);
if (count("MISX", "ETF") < 20) throw new Error(`only ${count("MISX", "ETF")} MOEX ETFs`);
if (count("XPET", "ETF") < 5) throw new Error(`only ${count("XPET", "ETF")} SPB ETFs`);
for (const [mic, isin, label] of [
  ["MISX", "RU0009029540", "Sberbank on MOEX"],
  ["MISX", "RU0007661625", "Gazprom on MOEX"],
  ["XPET", "RU000A101X76", "TMOS on SPB"],
]) {
  if (!rows.some((row) => row.mic === mic && row.isin === isin)) throw new Error(`${label} is missing`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("tinvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));

const counts = {};
for (const row of written) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.error(`catalogue ${catalogue.length} lines, ${written.length} rows`, counts);
console.error("left out:", Object.fromEntries(left));
console.error(`funds that are not ETFs, left out: ${notEtf.length}`);
for (const item of notEtf) console.error(`  ${item}`);
console.error("unresolved venues:", unresolved.size ? Object.fromEntries(unresolved) : "none");
