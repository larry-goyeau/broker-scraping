// The Belgrade Stock Exchange book (Beogradska berza, BELEX, now branded
// BGDx; MIC XBEL), for a broker whose clients can order any share listed in
// Belgrade (Prudence Capital in ./prudence_scraping.mjs). Every share the
// exchange lists and lets trade today, minus the lines that cannot really
// be bought.
//
// Read from the exchange's own public pages (www.belex.rs now redirects to
// bgdx.rs):
//   https://bgdx.rs/eng/trzista_i_hartije/hartije/akcije/sve
//     "Securities - Shares", all letters: every listed share line with its
//     issuer, symbol, last price, market (Regulated, MTP) and listing tier
//     (Prime Listing, Open Market, MTP). A line the exchange suspends or
//     excludes leaves this list (PKPT, VINZ, JHRT ... under the suspension
//     decisions of https://bgdx.rs/eng/trgovanje/vesti/obustave are not on
//     it on 28 October 2026), so the list is already the tradable book.
//   https://bgdx.rs/eng/trgovanje/hartija/dnevni/<SYMBOL>
//     the line's own page: ISIN, CFI, currency, and the highest and lowest
//     price of the last 52 weeks ("/" when it did not trade in that time).
//
// Left out:
//   - issuers whose name says they are in bankruptcy or liquidation ("u
//     stečaju", "u likvidaciji", "u prinudnoj likvidaciji");
//   - lines with no trade in the last 52 weeks (the 52-week high is "/"):
//     dormant MTP and Open Market lines that print a last price from years
//     ago (SJLB, last trade 2009; AGEX, 2015), as ../abcfinance/bseBook.mjs
//     drops BSE lines with no trade in a year;
//   - a line whose page gives no ISIN, or whose CFI is not a share (E...).
// Belgrade lists no ETF, ETN or ETC; bonds (the RSRES... government lines)
// are on another page and are not read. Every share trades in dinars
// (RSD). Place "Belgrade Stock Exchange", XBEL, as in ../raiffeisenrs.
//
// The line pages (about 210, one every 0.4 s) are kept in belex-cache.json
// next to this file for 12 hours, so scrapers run back to back read the
// exchange once.
//
//   import { belexBook } from "../prudence/belexBook.mjs";
//   const { rows, leftOut } = await belexBook();
//
//   node brokers/prudence/belexBook.mjs      prints the counts

import fs from "node:fs";

const SITE = "https://bgdx.rs";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CACHE = new URL("belex-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const CLOSING = /\bu (stečaju|stećaju|stecaju|likvidaciji|prinudnoj likvidaciji)\b/i;

export const EXCHANGE = "Belgrade Stock Exchange";
export const MIC = "XBEL";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function text(path) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(1500 * attempt);
    try {
      const response = await fetch(SITE + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return await response.text();
      last = `${path} answered ${response.status}`;
    } catch (error) {
      last = `${path}: ${error.message || error}`;
    }
  }
  throw new Error(last);
}

// Every listed share line: symbol, issuer, description, market, tier.
export async function shareList() {
  const html = await text("/eng/trzista_i_hartije/hartije/akcije/sve");
  const lines = [];
  for (const tr of html.split(/<tr>/).slice(1)) {
    const link = tr.match(/href='\/eng\/trgovanje\/hartija\/dnevni\/([^']+)'\s+title='([^']*)'/);
    if (!link) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decode(cell[1]));
    if (cells.length < 6) continue;
    lines.push({ symbol: link[1].trim(), title: decode(link[2]), issuer: cells[0].replace(/\s+,/g, ","), price: cells[2], market: cells[4], tier: cells[5] });
  }
  if (lines.length < 150) throw new Error(`the Belgrade share list gave only ${lines.length} lines`);
  for (const symbol of ["AERO", "NIIS", "JESV"]) if (!lines.some((line) => line.symbol === symbol)) throw new Error(`${symbol} is missing from the Belgrade share list`);
  return lines;
}

// The facts the catalogue needs from a line's own page.
function lineFacts(html) {
  const plain = decode(html.replace(/<script[\s\S]*?<\/script>/gi, " "));
  const field = (label) => (plain.match(new RegExp(`\\b${label} ([^ ]+)`)) || [])[1] || "";
  const weeks = plain.match(/52 Weeks Highest price Lowest price (\S+) (\S+)/);
  return { isin: field("ISIN"), cfi: field("CFI"), currency: field("Currency"), high52: weeks ? weeks[1] : "" };
}

function readCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cache.at < CACHE_HOURS * 3_600_000) return cache.facts;
  } catch {}
  return null;
}

export async function belexBook({ log = () => {} } = {}) {
  const lines = await shareList();
  const cached = readCache() || {};
  const facts = {};
  for (const line of lines) {
    if (cached[line.symbol]) {
      facts[line.symbol] = cached[line.symbol];
      continue;
    }
    facts[line.symbol] = lineFacts(await text(`/eng/trgovanje/hartija/dnevni/${encodeURIComponent(line.symbol)}`));
    await sleep(400);
  }
  fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), facts }));
  log(`${lines.length} Belgrade share lines read`);

  const rows = [];
  const leftOut = [];
  for (const line of lines) {
    const fact = facts[line.symbol];
    if (CLOSING.test(line.issuer) || CLOSING.test(line.title)) {
      leftOut.push({ ticker: line.symbol, reason: "in bankruptcy or liquidation" });
      continue;
    }
    if (!/^RS[A-Z0-9]{9}\d$/.test(fact.isin)) {
      leftOut.push({ ticker: line.symbol, reason: "no ISIN on its page" });
      continue;
    }
    if (!/^E/.test(fact.cfi)) {
      leftOut.push({ ticker: line.symbol, reason: `CFI ${fact.cfi}, not a share` });
      continue;
    }
    if (!fact.high52 || fact.high52 === "/") {
      leftOut.push({ ticker: line.symbol, reason: "no trade in the last 52 weeks" });
      continue;
    }
    if (fact.currency !== "RSD") throw new Error(`${line.symbol} trades in ${fact.currency}`);
    rows.push({
      query: fact.isin,
      ticker: line.symbol,
      name: line.issuer,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "RSD",
      type: "STOCK",
      isin: fact.isin,
      raw: [line.symbol, line.issuer, fact.isin, line.market, line.tier, line.title].join(" | "),
    });
  }
  if (rows.length < 60) throw new Error(`only ${rows.length} Belgrade shares kept`);
  if (!rows.some((row) => row.isin === "RSANTBE11090")) throw new Error("Aerodrom Nikola Tesla is missing");
  return { rows, leftOut, listed: lines.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, leftOut, listed } = await belexBook({ log: console.log });
  const reasons = {};
  for (const item of leftOut) (reasons[item.reason] ||= []).push(item.ticker);
  console.log(`${listed} listed, ${rows.length} kept; left out: ${Object.entries(reasons).map(([reason, list]) => `${reason} ${list.length}`).join(", ")}`);
}
