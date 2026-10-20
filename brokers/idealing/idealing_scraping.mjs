// iDealing's public instrument search lists every equity line in its
// instrument master, ETFs and ETPs included (they are "Equity" there too).
// The page calls a DWR endpoint, 50 lines a page; a blank search with the
// Equity type returns them all. No login.
//
//   https://www.idealing.com/instrumentsearch
//   https://www.idealing.com/instrumentsearch/dwr/call/plaincall/InstrumentFinder.getSuggestionsFor.dwr
//
// The master keeps decades of dead lines ("_OLD" symbols, cancelled
// listings, expired warrants, old US/Canadian/Euronext codes). Each line
// names its price feed: "LSE" (and "IDEAL", the house quote for Lloyds) is
// a live London line; "NONE" has no streaming feed, and holds both the
// delisted lines (Deliveroo, Assura, Dowlais...) and live London shares
// dealt through the RSP gateway (3i Infrastructure, Arbuthnot...). A NONE
// line is kept when its ISIN is a current London line in the shared lists
// (assets/stocks.csv and etfs.csv, LSE rows); otherwise it is taken as dead.
// "ENXT" is a Euronext feed left from the old French/Benelux offer, not a
// market iDealing sells today ("Our Markets": the LSE and the RSP gateway).
// The LSE, IDEAL and listed NONE lines are kept, minus the ones marked _OLD,
// cancelled or in liquidation, and minus about 60 lines on the LSE feed
// whose symbol carries a home-market suffix (GME.US, LIN.NYSE, ENR.DE,
// NHY.OL): those are not London lines, and iDealing names no American or
// continental market. The International Order Book lines (0ACE, 0KUE...)
// are London and stay. The master keeps one line per ISIN, with the
// currency of the line it trades; that currency is stored as given.
//
// Main market and AIM are not told apart: both are London (XLON). Type:
// commodity, metal and currency trackers (WisdomTree/ETFS, UBS CMCI,
// physical metal) are ETC; other exchange-traded notes (Leverage Shares,
// GraniteShares, 21Shares, crypto ETPs) are ETN; funds from ETF ranges are
// ETF; the rest, investment trusts included, are STOCK.
//
//   node brokers/idealing/idealing_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENDPOINT = "https://www.idealing.com/instrumentsearch/dwr/call/plaincall/InstrumentFinder.getSuggestionsFor.dwr";
const CAPACITY = 50;
const EQUITY = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The reply is a JavaScript object literal (bare keys, double-quoted
// strings). A small reader, so nothing from the page is evaluated.
function parseLiteral(text) {
  let at = 0;
  const space = () => {
    while (/\s/.test(text[at])) at += 1;
  };
  function value() {
    space();
    const char = text[at];
    if (char === "{") {
      at += 1;
      const object = {};
      space();
      if (text[at] === "}") return at++, object;
      for (;;) {
        space();
        const key = /^[A-Za-z_$][\w$]*/.exec(text.slice(at, at + 80));
        if (!key) throw new Error(`key expected at ${at}`);
        at += key[0].length;
        space();
        if (text[at++] !== ":") throw new Error(`":" expected at ${at}`);
        object[key[0]] = value();
        space();
        if (text[at] === ",") { at += 1; continue; }
        if (text[at] === "}") return at++, object;
        throw new Error(`object not closed at ${at}`);
      }
    }
    if (char === "[") {
      at += 1;
      const list = [];
      space();
      if (text[at] === "]") return at++, list;
      for (;;) {
        list.push(value());
        space();
        if (text[at] === ",") { at += 1; continue; }
        if (text[at] === "]") return at++, list;
        throw new Error(`array not closed at ${at}`);
      }
    }
    if (char === '"') {
      let out = "";
      at += 1;
      while (text[at] !== '"') {
        if (at >= text.length) throw new Error("string not closed");
        if (text[at] === "\\") {
          const escaped = text[at + 1];
          if (escaped === "u") {
            out += String.fromCharCode(parseInt(text.slice(at + 2, at + 6), 16));
            at += 6;
          } else {
            out += { n: "\n", t: "\t", r: "\r" }[escaped] ?? escaped;
            at += 2;
          }
        } else out += text[at++];
      }
      at += 1;
      return out;
    }
    const atom = /^(null|true|false|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(text.slice(at, at + 40));
    if (!atom) throw new Error(`value expected at ${at}: ${text.slice(at, at + 20)}`);
    at += atom[0].length;
    return atom[1] === "null" ? null : atom[1] === "true" ? true : atom[1] === "false" ? false : Number(atom[1]);
  }
  return value();
}

async function page(number) {
  const body = [
    "callCount=1",
    "page=/instrumentsearch",
    "httpSessionId=",
    "scriptSessionId=",
    "c0-scriptName=InstrumentFinder",
    "c0-methodName=getSuggestionsFor",
    "c0-id=0",
    `c0-e1=number:${CAPACITY}`,
    `c0-e2=number:${number}`,
    "c0-e3=boolean:true",
    `c0-e4=string:${EQUITY}`,
    "c0-e5=string:-1",
    "c0-e6=string:",
    "c0-param0=Object_Object:{capacity:reference:c0-e1, page:reference:c0-e2, countAllMatches:reference:c0-e3, instrumentTypeFilterOptionId:reference:c0-e4, orderDestinationFilterOptionId:reference:c0-e5, expression:reference:c0-e6}",
    "batchId=0",
    "instanceId=0",
    "windowName=",
    "",
  ].join("\n");
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "text/plain", Referer: "https://www.idealing.com/instrumentsearch" },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      const marker = 'handleCallback("0","0",';
      const start = text.indexOf(marker);
      if (response.ok && start >= 0) return parseLiteral(text.slice(start + marker.length));
      last = `${response.status} page ${number}: ${text.slice(0, 200)}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const first = await page(1);
const total = first.total;
const lines = [...first.results];
for (let number = 2; number <= Math.ceil(total / CAPACITY); number += 1) {
  await sleep(200);
  lines.push(...(await page(number)).results);
}
if (lines.length !== total) throw new Error(`announced ${total}, read ${lines.length}`);
if (total < 14000) throw new Error(`only ${total} equity lines announced`);

// Current London lines, by ISIN, from the shared lists.
const LONDON = new Set();
for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
  for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
    const [code, place, isin] = line.split(",");
    if (place === "LSE" && /^LSE:/.test(code) && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) LONDON.add(isin);
  }
}
if (LONDON.size < 5000) throw new Error(`only ${LONDON.size} London ISINs in the shared lists`);

const COMMODITY = /WISDOMTREE (COMMODIT|METAL|FOREIGN|HEDGED)|\bETFS (COMMODIT|FOREIGN|METAL|HEDGED)|UBS AG|\bETC\b|PHYSICAL (GOLD|SILVER|PLATINUM|PALLADIUM|PRECIOUS|METAL|SWISS)|PHYSICAL METALS|BULLION SECURITIES|PHYSICAL MARKETS|XTRACKERS ETC|\bCMCI\b|\b(GOLD|SILVER|COPPER|NICKEL|PLATINUM|PALLADIUM|ALUMINIUM|CRUDE|BRENT|NATURAL GAS|WHEAT|CORN|SUGAR|COCOA|COFFEE) \dX\b/i;
const NOTE = /\bETP\b|\bETN\b|LEVERAGE SHARES|GRANITESHARES|21SHARES|DIGITAL ASSETS|EXCHANGE TRADED PRODUCTS|MULTI ASSET ISSUER/i;
const FUND = /\bETFS?\b|UCITS|INDEX FUND|ISHARES|X-?TRACKERS|VANGUARD FUNDS|SPDR|LYXOR|AMUNDI|INVESCO MARKETS|UBS ETF|HSBC ETF|LEGAL & GENERAL UCITS|L&G|WISDOMTREE ISSUER|FRANKLIN|JPMORGAN ETFS|VANECK|GLOBAL X|HANETF|MULTI UNITS|FIRST TRUST|ICAV|SOURCE|OSSIAM|TABULA|BNP PARIBAS EASY|FUND SOLUTIONS|LIQUIDITY FUND/i;

function typeOf(line) {
  const text = `${line.name || ""} ${line.description || ""}`;
  const isin = line.instrumentCode || "";
  if (COMMODITY.test(text)) return "ETC";
  if (NOTE.test(text)) return "ETN";
  if (/^(XS|CH)/.test(isin) && !/AG$|N\.?V\.?$|S\.?A\.?$/i.test(line.name || "")) return "ETN";
  if (/^(IE|LU|FR|DE)/.test(isin) && FUND.test(text)) return "ETF";
  return "STOCK";
}

// GME.US, LIN.NYSE, ENR.DE, NHY.OL...: a home-market code, not a London line.
const FOREIGN = /\.(US|NYSE|NY|NAS|NQ|N|DE|XE|IT|CA|OL)$/;
const DEAD =/_OLD\b|CANCELL?ED|IN LIQUIDATION|LIQUIDATED|DELISTED|SUSPENDED|EXPIRED|\bWARRANTS?\b|NIL PAID|\bRIGHTS ISSUE\b/i;

const rows = [];
const left = {};
const leave = (why) => (left[why] = (left[why] || 0) + 1);
for (const line of lines) {
  if (line.typeId !== EQUITY) { leave(`type ${line.typeName}`); continue; }
  const listed = line.dataSourceName === "NONE" && LONDON.has(line.instrumentCode);
  if (line.dataSourceName !== "LSE" && line.dataSourceName !== "IDEAL" && !listed) { leave(`feed ${line.dataSourceName}`); continue; }
  const label = `${line.symbol} ${line.name || ""} ${line.description || ""}`;
  if (DEAD.test(label)) { leave("dead or warrant"); continue; }
  if (FOREIGN.test(line.symbol)) { leave("foreign suffix"); continue; }
  // For a fund the name is the issuer ("ISHARES PLC"); the description names the fund.
  const type = typeOf(line);
  const parts = type === "STOCK" ? [line.name || line.description] : [line.name, line.description];
  const name = parts.filter(Boolean).join(" - ").replace(/\s+/g, " ").trim();
  rows.push({
    query: line.instrumentCode || line.symbol,
    ticker: line.symbol,
    name,
    exchange: "London Stock Exchange",
    mic: "XLON",
    currency: line.currency,
    type,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(line.instrumentCode || "") ? line.instrumentCode : "",
    raw: [line.symbol, line.name, line.description, line.instrumentCode, line.currency, line.dataSourceName, line.typeName].join(" | "),
  });
}

for (const ticker of ["VOD", "AZN", "LLOY", "FEVR", "SWDA", "VUSA", "PHAU", "3IN"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}
if (rows.length < 2400) throw new Error(`only ${rows.length} live London lines`);

rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(new URL("idealing-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type} ${row.currency}`] = (counts[`${row.exchange} ${row.type} ${row.currency}`] || 0) + 1;
console.error(counts, "left out:", left, "rows:", rows.length, "of", total);
