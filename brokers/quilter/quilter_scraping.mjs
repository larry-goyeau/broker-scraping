// What Quilter Invest (the former Wombat app) sells, with no login. The
// range is small and curated, and the site publishes all of it on two
// Webflow lists:
//
//   - the shares list, 24 cards a page: name, ticker and the currency of
//     the share (GBP, USD or EUR). No ISIN, no exchange. 42 shares on
//     2026-10-21.
//   - the themed funds list: each card links to a page whose "Investment
//     details" print the fund name and its ISIN. The card's type badge says
//     ETF, ETC, Fund or MyGoal. 36 cards on 2026-10-21.
//
// Only exchange-traded lines are kept: shares, ETFs and the two iShares
// physical metal ETCs (typed ETC, as the other UK scrapers do). "Fund" and
// "MyGoal" cards are OEICs and unit trusts dealt with the fund manager, so
// they stay out.
//
// The order execution policy routes every exchange-traded order through
// Winterflood. The cash account is GBP only. A non-UK share is bought in its
// own currency after an FX trade, so the card's currency names the market:
//   - GBP: the London line, read from the LSE's own API by TIDM. AIM shares
//     are a segment of the LSE and stay under the London Stock Exchange; raw
//     says AIM.
//   - USD: the US listing (one NBBO market, so one row), ISIN and listing
//     exchange from assets/stocks.csv.
//   - EUR: the home listing, from assets/stocks.csv: Xetra for adidas,
//     Euronext Brussels for AB InBev, Euronext Milan for Ferrari. Italy is
//     not among the broker-list places, but Ferrari's euro line is Milan.
// The policy names no foreign venue, so the home listing is assumed.
// An ETF or ETC is a UCITS line in London: every LSE main-market line of its
// ISIN, keeping the sterling ones (GBX or GBP) since GBP is the only cash
// currency; a fund with no sterling line keeps the lines London has.
//
// The shares list is old (Meta still FB, Block still SQ, boohoo still BOO).
// Those cards are mapped to the current ticker below; any other ticker that
// does not resolve stops the run.
//
// broker-list.json says "Selected US stocks only, no ETFs" for the United
// States. The market hours FAQ says most shares trade on the UK market and
// "a selection of US stocks are available too": that selection is the shares
// list itself. The broker prints no US ETF rule, but every ETF on the funds
// list is an Irish or Luxembourg UCITS line, so no US ETF is offered. One
// card (The Electric Car Revolution) carries a "US" market badge; its ISIN is
// an Irish iShares line traded in London like the others. Nothing more is
// filtered.
//
//   https://www.quilterinvest.com/shares?4dfcf3d7_page=1
//   https://www.quilterinvest.com/theme-funds
//   https://www.quilterinvest.com/site-terms/order-execution-policy
//   https://www.quilterinvest.com/faq/what-are-the-market-hours-for-trading-with-quilter-invest
//   https://www.quilterinvest.com/pricing
//
//   node brokers/quilter/quilter_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLines } from "../../lseListings.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.quilterinvest.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LSE_LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Card ticker -> ticker of today.
const RENAMED = { FB: "META", SQ: "XYZ", BOO: "DEBS" };

// assets/stocks.csv place -> venue label and MIC.
const US_PLACES = { NYSE: ["NYSE", "XNYS"], NASDAQ: ["NASDAQ", "XNAS"], AMEX: ["NYSE American", "XASE"] };
const EUR_PLACES = { XETR: ["XETRA", "XETR"], MIL: ["Euronext Milan", "XMIL"], EURONEXT: null };
const EURONEXT_BY_COUNTRY = { BE: ["Euronext Brussels", "XBRU"], FR: ["Euronext Paris", "XPAR"], NL: ["Euronext Amsterdam", "XAMS"], PT: ["Euronext Lisbon", "XLIS"], IE: ["Euronext Dublin", "XMSM"] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (value) =>
  String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function get(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return accept === "application/json" ? response.json() : response.text();
      if (response.status === 404 && accept === "application/json") return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const items = (html) => html.split(/role="listitem" class="collection-item w-dyn-item"/).slice(1);

// Every page of the shares list, until one comes back empty.
async function shareCards() {
  const cards = [];
  for (let page = 1; page <= 10; page += 1) {
    const found = items(await get(`${ORIGIN}/shares?4dfcf3d7_page=${page}`));
    if (!found.length) return cards;
    for (const chunk of found) {
      const head = chunk.match(/class="heading-small text-is-green">([^<]*)<\/div><div>([^<]*)<\/div>/);
      const currency = decode(chunk.match(/fs-cmsfilter-field="currency" class="contextual-badge">([^<]*)</)?.[1]).toUpperCase();
      if (!head || !/^(GBP|USD|EUR)$/.test(currency)) throw new Error(`unreadable share card on page ${page}: ${decode(chunk).slice(0, 120)}`);
      cards.push({ name: decode(head[1]), ticker: decode(head[2]).toUpperCase(), currency });
    }
    await sleep(300);
  }
  throw new Error("shares list does not end after 10 pages");
}

function fundCards(html) {
  return items(html).map((chunk) => {
    const link = chunk.match(/href="(\/theme-funds\/[^"]+)"/)?.[1] || "";
    const badge = (field) => decode(chunk.match(new RegExp(`fs-cmsfilter-field="${field}" class="contextual-badge">([^<]*)<`))?.[1]);
    return { link, title: decode(chunk.match(/class="heading-regular">([^<]*)</)?.[1]), type: badge("type"), assetClass: badge("asset class") };
  });
}

function investmentDetails(html, link) {
  const name = decode(html.match(/<h4>Investment name:<\/h4><h5>([\s\S]*?)<\/h5>/)?.[1]);
  const isin = decode(html.match(/<h5>ISIN:<\/h5><h6>([\s\S]*?)<\/h6>/)?.[1]).toUpperCase();
  if (!name || !ISIN.test(isin)) throw new Error(`no name or ISIN on ${link}`);
  return { name, isin };
}

// A London line by TIDM, main market or AIM.
async function londonLine(tidm) {
  const line = await get(LSE_LINE + encodeURIComponent(tidm), "application/json");
  if (!line || !ISIN.test(line.isin || "") || !/^(MAINMARKET|AIM)/.test(line.market || "")) return null;
  return { ticker: line.tidm, isin: line.isin, currency: String(line.currency || "").toUpperCase(), market: line.market };
}

// assets/stocks.csv: place -> ticker -> ISINs, for the US and euro places only.
function stockList() {
  const wanted = new Set([...Object.keys(US_PLACES), ...Object.keys(EUR_PLACES)]);
  const book = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const [code, place, isin] = line.split(",");
    if (!wanted.has(place) || !ISIN.test(isin || "")) continue;
    const ticker = String(code).split(":").pop().toUpperCase();
    if (!book.has(place)) book.set(place, new Map());
    const byTicker = book.get(place);
    if (!byTicker.has(ticker)) byTicker.set(ticker, new Set());
    byTicker.get(ticker).add(isin);
  }
  if ((book.get("NYSE")?.size || 0) < 1000 || (book.get("NASDAQ")?.size || 0) < 1000) throw new Error("assets/stocks.csv has no US lists");
  return book;
}

// The one listing of a ticker among the places of its currency.
function abroad(book, ticker, currency) {
  const places = currency === "USD" ? US_PLACES : EUR_PLACES;
  const hits = [];
  for (const place of Object.keys(places)) {
    for (const isin of book.get(place)?.get(ticker) || []) hits.push({ place, isin });
  }
  if (hits.length !== 1) return null;
  const { place, isin } = hits[0];
  const venue = place === "EURONEXT" ? EURONEXT_BY_COUNTRY[isin.slice(0, 2)] : places[place];
  return venue ? { isin, exchange: venue[0], mic: venue[1] } : null;
}

const rows = [];
const unresolved = [];

const shares = await shareCards();
if (shares.length < 40) throw new Error(`only ${shares.length} share cards`);
const book = stockList();
for (const card of shares) {
  const ticker = RENAMED[card.ticker] || card.ticker;
  const raw = [card.ticker, card.name, card.currency].join(" ");
  if (card.currency === "GBP") {
    const line = await londonLine(ticker);
    await sleep(150);
    if (!line || (line.currency !== "GBX" && line.currency !== "GBP")) {
      unresolved.push(`${card.ticker} ${card.name}`);
      continue;
    }
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: card.name,
      exchange: "London Stock Exchange",
      mic: "XLON",
      currency: line.currency,
      type: "STOCK",
      isin: line.isin,
      raw: `${raw} | ${line.market === "AIM" ? "AIM" : "LSE"} ${line.ticker} ${line.currency}`,
    });
    continue;
  }
  const listing = abroad(book, ticker, card.currency);
  if (!listing) {
    unresolved.push(`${card.ticker} ${card.name}`);
    continue;
  }
  rows.push({
    query: ticker,
    ticker,
    name: card.name,
    exchange: listing.exchange,
    mic: listing.mic,
    currency: card.currency,
    type: "STOCK",
    isin: listing.isin,
    raw: `${raw} | ${listing.mic} ${ticker}`,
  });
}

const funds = fundCards(await get(`${ORIGIN}/theme-funds`));
if (funds.length < 30) throw new Error(`only ${funds.length} themed fund cards`);
let traded = 0;
for (const card of funds) {
  if (!card.link || !/^(ETF|ETC|Fund|MyGoal)$/.test(card.type)) throw new Error(`unreadable fund card ${card.title || card.link}: type "${card.type}"`);
  if (card.type === "Fund" || card.type === "MyGoal") continue;
  traded += 1;
  await sleep(250);
  const { name, isin } = investmentDetails(await get(ORIGIN + card.link), card.link);
  const lines = await lseLines(isin);
  const sterling = lines.filter((line) => line.currency === "GBX" || line.currency === "GBP");
  const kept = sterling.length ? sterling : lines;
  if (!kept.length) {
    unresolved.push(`${isin} ${name}`);
    continue;
  }
  for (const line of kept) {
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name,
      exchange: "London Stock Exchange",
      mic: "XLON",
      currency: line.currency,
      type: card.type,
      isin,
      raw: `${card.title}: ${name} ${isin} (${card.type}, ${card.assetClass}) | XLON ${line.ticker} ${line.currency}`,
    });
  }
}

if (unresolved.length) throw new Error(`no listing found for: ${unresolved.join(", ")}`);
if (traded < 20) throw new Error(`only ${traded} ETF/ETC cards`);
const seen = new Set();
for (const row of rows) {
  const key = `${row.mic}|${row.ticker}|${row.currency}`;
  if (seen.has(key)) throw new Error(`two cards for ${row.ticker} ${row.name}`);
  seen.add(key);
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("quilter-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const count = new Map();
for (const row of rows) count.set(`${row.type} ${row.exchange} ${row.currency}`, (count.get(`${row.type} ${row.exchange} ${row.currency}`) || 0) + 1);
console.error(`${rows.length} rows (${shares.length} shares, ${traded} ETF/ETC cards): ${[...count].map(([key, n]) => `${n} ${key}`).join(", ")}`);
