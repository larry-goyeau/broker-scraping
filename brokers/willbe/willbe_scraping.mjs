// What willbe (LLB, Liechtenstein) sells in ETFselect, with no login.
// willbe sells no single shares. The ETF page ends with a table that it
// calls the list of all its ETF and funds: title, ISIN, TER, share class
// and currency. The "Active Fonds" table on the same page names the LLB
// and UBS funds; the iNdx lines are LLB index funds too. Those funds are
// not exchange-traded and are left out: the site lists stocks and ETFs.
// A line whose name says ETC or ETP, or a physical bitcoin or ether line,
// is an ETC; ETN when the name says ETN. The rest are ETFs.
//
// Orders are pooled once a day and placed "in various global trading
// venues"; willbe names no venue per fund. The places broker-list.json gives
// willbe (Italy, France, United Kingdom) stand in: an exchange-traded line
// becomes one row per listing it has there, each with that listing's own
// ticker and currency, from the exchange's own list (Euronext's ETF file for
// Paris and Milan's ETFplus, the LSE's instrument API for London). A line in
// a currency willbe's account cannot hold (deposits.mjs) is left out. An ETF
// listed on none of those places keeps one row, by ISIN, with no exchange.
//
//   https://willbe-invest.com/en/invest/etf-savings-plan/our-etf-and-fonds
//   https://willbe-invest.com/en/invest/etf-savings-plan/etf-tables/active-fonds-table?iframe=1
//   https://mobilep.willbe-invest.com/en/about-willbe/faq
//   https://live.euronext.com/pd_es/data/track/download?mics=XPAR,XPMC,ETFP
//   https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=<ISIN>
//   https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//
//   node brokers/willbe/willbe_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { depositHas } from "../../deposits.mjs";
import { lseLines, heldAs } from "../../lseListings.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://willbe-invest.com/en/invest/etf-savings-plan/our-etf-and-fonds";
const ACTIVE = "https://willbe-invest.com/en/invest/etf-savings-plan/etf-tables/active-fonds-table?iframe=1";
const EURONEXT = "https://live.euronext.com/pd_es/data/track/download?mics=XPAR,XPMC,ETFP";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// broker-list.json place -> how its listings are read here.
const PLACES = { France: "XPAR", Italy: "XMIL", "United Kingdom": "XLON" };

function normalize(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(60_000),
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

// Every table row with the header Title | ISIN | TER | Type | Currency.
function tableRows(html) {
  const rows = [];
  for (const [row] of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => normalize(match[1]));
    if (cells.length < 5 || !ISIN.test(cells[1])) continue;
    const [title, isin, ter, share, currency] = cells;
    rows.push({ title, isin, ter, share, currency });
  }
  return rows;
}

function kindOf(name, funds, isin) {
  if (funds.has(isin) || /^(iNdx|LLB)\b/i.test(name)) return "FUND";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\b(ETC|ETP)\b/i.test(name) || /\bPhysical (Bitcoin|Ethereum)\b/i.test(name)) return "ETC";
  return "ETF";
}

// The places broker-list.json names for willbe, each mapped to a reader.
function willbePlaces() {
  const list = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8"));
  const entry = list.find((row) => row.name === "willbe");
  if (!entry) throw new Error("willbe is not in broker-list.json");
  const places = Object.keys(entry.exchanges);
  const unknown = places.filter((place) => !PLACES[place]);
  if (unknown.length) throw new Error(`no listing reader for ${unknown.join(", ")}`);
  return new Set(places.map((place) => PLACES[place]));
}

// Euronext's ETF file, semicolon separated, four lines of preamble.
function euronextLines(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split(";").map((cell) => cell.replace(/"/g, ""));
  const at = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Euronext file has no ${name} column`);
    return index;
  };
  const [isin, symbol, market, currency] = ["ISIN", "Symbol", "Market", "Currency"].map(at);
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.match(/("[^"]*"|[^;]*)(;|$)/g)?.map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim()) || [];
    if (!ISIN.test(cells[isin] || "")) continue;
    const mic = /ETF Plus/i.test(cells[market]) ? "XMIL" : /Paris/i.test(cells[market]) ? "XPAR" : "";
    if (!mic) continue;
    out.push({ isin: cells[isin], ticker: cells[symbol], mic, currency: cells[currency].toUpperCase() });
  }
  if (out.length < 1000) throw new Error(`Euronext file has only ${out.length} Paris and Milan lines`);
  return out;
}

const EXCHANGE = { XPAR: "Euronext Paris", XMIL: "Euronext Milan", XLON: "London Stock Exchange" };
const holds = (currency) => depositHas("willbe", "", heldAs(currency));

const places = willbePlaces();
const euronext = euronextLines(await page(EURONEXT, "text/csv"));
const all = tableRows(await page(LIST));
const funds = new Set(tableRows(await page(ACTIVE)).map((row) => row.isin));
if (all.length < 80) throw new Error(`the full table has only ${all.length} lines`);
if (funds.size < 5) throw new Error(`the active-fund table has only ${funds.size} lines`);

const rows = [];
const seen = new Set();
const tally = { listed: 0, unplaced: 0, otherCurrency: 0, funds: 0 };
for (const line of all) {
  if (seen.has(line.isin)) continue;
  seen.add(line.isin);
  const type = kindOf(line.title, funds, line.isin);
  if (type === "FUND") {
    tally.funds += 1;
    continue;
  }
  const raw = [line.title, line.isin, line.ter, line.share, line.currency].filter(Boolean).join(" ");
  const listings = euronext.filter((hit) => hit.isin === line.isin && places.has(hit.mic));
  if (places.has("XLON")) listings.push(...(await lseLines(line.isin)).map((hit) => ({ ...hit, mic: "XLON" })));
  const kept = listings.filter((hit) => holds(hit.currency));
  tally.otherCurrency += listings.length - kept.length;
  if (kept.length) tally.listed += 1;
  else tally.unplaced += 1;
  for (const hit of kept) {
    rows.push({
      query: hit.ticker,
      ticker: hit.ticker,
      name: line.title,
      exchange: EXCHANGE[hit.mic],
      mic: hit.mic,
      currency: hit.currency,
      type,
      isin: line.isin,
      raw: `${raw} | ${hit.mic} ${hit.ticker} ${hit.currency}`,
    });
  }
  if (!kept.length) {
    rows.push({
      query: line.isin,
      ticker: line.isin,
      name: line.title,
      currency: line.currency.toUpperCase(),
      type,
      isin: line.isin,
      raw,
    });
  }
}
for (const isin of funds) if (!seen.has(isin)) throw new Error(`active fund ${isin} is not in the full table`);

rows.sort((left, right) => left.name.localeCompare(right.name) || (left.exchange || "").localeCompare(right.exchange || "") || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("willbe-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) {
  const key = `${row.exchange || "no exchange"} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${rows.length} rows from ${seen.size} funds`, tally);
