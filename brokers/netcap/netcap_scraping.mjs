// What Network Capital Limited sells, with no login: every share and ETF
// on the Nigerian Exchange, its only place online. The firm is a "Trading
// License Holder of the Nigerian Exchange Limited". Its FAQ calls Netcap
// Trader "our online trading application where clients can view their
// portfolio, place buy and sell mandates", and says: "foreign retail
// investors can buy essentially any stock listed on the NGX". No page
// excludes a board, a segment or ETFs.
//
// So the book is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs, with name
// and ISIN), unioned with the "Pricelist" card of the market-data page,
// "Stocks and ETFs listed on the Nigerian Exchange". The page says the card
// covers "every listed equity", but it is a subset of the exchange's
// listing (AVACAP is listed on the NGX and missing from the card on
// 2026-10-28); where the two disagree the title is kept, as a catalogue
// with a title too many beats one with a title too few. The card is a
// TradingView list: the attribute data-symbol-sectors holds a "Stocks"
// section and an "ETFs" section of NSENG: symbols, each matched to the
// exchange's listing. TradingView spells the UH REIT UHOMREIT; the
// exchange's code is UHREIT. A row's raw says "Netcap pricelist Stocks" or
// "Netcap pricelist ETFs" when the card has it, and "NGX listing only, not
// on the Netcap pricelist" when only the exchange's listing does.
//
// Left out: the lines ngxWhole finds suspended or delisting (no trade for
// a month, or flagged [DIP]); the four closed-end funds the exchange quotes
// on its Main Board and the card files as stocks (AVAIF, CNIF, MOFIREIF,
// NIDF), funds and not shares, as in ngxWhole; and any card symbol the
// exchange no longer lists (STACO on 2026-10-28). The listed REITs stay as
// shares. The ETFs are all written, as "all shares" includes the
// exchange's ETFs.
//
// NASD OTC is left out. The home page only says clients can reach "NASD
// instruments" through a single account; no page lists them or offers them
// online. Bonds, treasury bills and mutual funds are not written.
// Everything trades in naira.
//
// Fees: the FAQ, "What will I pay when I buy shares?": "Brokerage
// commission of 1.35 percent of the transaction value, SEC fee of 0.3
// percent, CSCS fee of 0.3 percent, Stamp duty of 0.08 percent, CSCS Trade
// Alert of N6, and VAT of 7.5 percent". A sale pays the NGX fee in place of
// the SEC fee. "The 1.35 percent is the maximum brokerage rate permitted
// by regulation"; larger clients may pay less. The services page prints
// the stamp duty as 0.075%. The run checks the FAQ's sentences.
//
//   https://networkcapitalltd.com/market-data/#pricelist
//   https://networkcapitalltd.com/frequently-asked-questions/
//
//   node brokers/netcap/netcap_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const MARKET = "https://networkcapitalltd.com/market-data/";
const FAQ = "https://networkcapitalltd.com/frequently-asked-questions/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  [MARKET]: [/Stocks and ETFs listed on the Nigerian Exchange/, /Covering every listed equity/],
  [FAQ]: [
    /Netcap Trader is our online trading application where clients can view their portfolio, place buy and sell mandates/,
    /foreign retail investors can buy essentially any stock listed on the NGX/,
    /Brokerage commission of 1\.35 percent of the transaction value, SEC fee of 0\.3 percent, CSCS fee of 0\.3 percent, Stamp duty of 0\.08 percent, CSCS Trade Alert of N6, and VAT of 7\.5 percent/,
    /The 1\.35 percent is the maximum brokerage rate permitted by regulation/,
  ],
};
const SECTIONS = { Stocks: "STOCK", ETFs: "ETF" };
// TradingView symbol -> NGX code, where the two differ.
const ALIAS = { UHOMREIT: "UHREIT" };
// The closed-end funds the exchange quotes on its Main Board, left out by ngxWhole.
const FUNDS = new Set(["AVAIF", "CNIF", "MOFIREIF", "NIDF"]);
const FLOOR = { STOCK: 120, ETF: 8 };
const MUST = ["DANGCEM", "MTNN", "GTCO", "ZENITHBANK", "SEPLAT", "STANBICETF30", "NEWGOLD"];
const MAX_UNLISTED = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&#8217;|&rsquo;/g, "'")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
const plain = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

function isinCheck(code) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code)) return false;
  const digits = code.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// NSENG ISINs of the shared lists, by ticker, when the ticker has only one.
function listIsins() {
  const found = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^NSENG:([^,]+),NSENG,([A-Z]{2}[A-Z0-9]{9}\d),/);
      if (!match) continue;
      const ticker = match[1].trim().toUpperCase();
      if (!found.has(ticker)) found.set(ticker, new Set());
      found.get(ticker).add(match[2]);
    }
  }
  return new Map([...found].filter(([, isins]) => isins.size === 1).map(([ticker, isins]) => [ticker, [...isins][0]]));
}

// The card: [{ symbol, section }] from every data-symbol-sectors attribute.
function cardLines(html) {
  const blocks = [...html.matchAll(/data-symbol-sectors="([^"]*)"/g)];
  if (!blocks.length) throw new Error("the market-data page has no data-symbol-sectors list");
  const lines = [];
  const seen = new Set();
  for (const [, attribute] of blocks) {
    for (const section of JSON.parse(decode(attribute))) {
      const type = SECTIONS[section?.sectionName];
      if (!type) throw new Error(`unknown pricelist section ${section?.sectionName}`);
      if (!Array.isArray(section.symbols)) throw new Error(`pricelist section ${section.sectionName} has no symbols`);
      for (const value of section.symbols) {
        const match = String(value).trim().toUpperCase().match(/^NSENG:([A-Z0-9.]+)$/);
        if (!match) throw new Error(`pricelist symbol ${value} is not NSENG`);
        if (seen.has(match[1])) throw new Error(`pricelist symbol ${match[1]} repeats`);
        seen.add(match[1]);
        lines.push({ symbol: match[1], section: section.sectionName, type });
      }
    }
  }
  return lines;
}

const pages = {};
for (const [url, patterns] of Object.entries(EVIDENCE)) {
  pages[url] = await fetchText(url);
  const text = plain(pages[url]);
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(500);
}

const card = cardLines(pages[MARKET]);
const sectionCount = { STOCK: 0, ETF: 0 };
for (const line of card) sectionCount[line.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (sectionCount[type] < floor) throw new Error(`the pricelist has only ${sectionCount[type]} ${type} symbols`);
}

const { rows: listing, day, dolDay, dropped } = await ngxWhole();
const byTicker = new Map(listing.map((row) => [row.ticker, row]));
const suspended = new Map(dropped.map((line) => [line.ticker, line]));
const isins = listIsins();

const rows = [];
const left = { suspended: [], funds: [], unlisted: [] };
for (const { symbol, section, type } of card) {
  const ticker = ALIAS[symbol] || symbol;
  if (suspended.has(ticker)) {
    left.suspended.push(ticker);
    continue;
  }
  if (FUNDS.has(ticker)) {
    left.funds.push(ticker);
    continue;
  }
  const line = byTicker.get(ticker);
  if (!line) {
    left.unlisted.push(ticker);
    continue;
  }
  if (line.type !== type) throw new Error(`${ticker} is ${line.type} on the NGX but in the pricelist's ${section}`);
  let isin = line.isin || isins.get(ticker) || isins.get(symbol) || "";
  if (isin && !isinCheck(isin)) isin = "";
  rows.push({
    query: isin || ticker,
    ticker,
    name: line.name,
    exchange: PLACE,
    mic: line.mic,
    currency: "NGN",
    type,
    ...(isin ? { isin } : {}),
    raw: [`NSENG:${symbol}`, `Netcap pricelist ${section}`, line.raw].join(" | "),
  });
}
if (left.unlisted.length > MAX_UNLISTED) {
  throw new Error(`${left.unlisted.length} pricelist symbols are not on the NGX lists: ${left.unlisted.join(" ")}`);
}

// The exchange's lines the card lacks: "essentially any stock listed on the NGX".
const onCard = new Set(rows.map((row) => row.ticker));
const notOnCard = [];
for (const line of listing) {
  if (onCard.has(line.ticker) || FUNDS.has(line.ticker)) continue;
  notOnCard.push(line.ticker);
  rows.push({ ...line, raw: ["NGX listing only, not on the Netcap pricelist", line.raw].join(" | ") });
}

const seenIsins = new Set();
for (const row of rows) {
  if (!row.isin) continue;
  if (seenIsins.has(row.isin)) throw new Error(`ISIN ${row.isin} repeats`);
  seenIsins.add(row.isin);
}
const count = { STOCK: 0, ETF: 0 };
for (const row of rows) count[row.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (count[type] < floor) throw new Error(`only ${count[type]} ${type} rows`);
}
for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("netcap-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const final = { STOCK: 0, ETF: 0 };
for (const row of kept) final[row.type] += 1;
console.error(
  `netcap: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${final.STOCK} STOCK, ${final.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Pricelist ${sectionCount.STOCK} stocks, ${sectionCount.ETF} ETFs. ` +
    `Left out: ${left.suspended.length} suspended or delisting (${left.suspended.join(", ") || "none"}), ` +
    `${left.funds.length} closed-end funds (${left.funds.join(", ") || "none"}), ` +
    `${left.unlisted.length} not on the NGX (${left.unlisted.join(", ") || "none"}). ` +
    `Added from the NGX listing, not on the pricelist: ${notOnCard.length} (${notOnCard.join(", ") || "none"}).`
);
