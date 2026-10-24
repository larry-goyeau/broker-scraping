// What Raiffeisen banka a.d. Beograd sells in mTrader (Moja mBanka app),
// with no login: shares and ETFs on twelve foreign markets and Belex.
//
// The mTrader page names the markets (Vienna, Euronext Brussels, Nasdaq
// Helsinki, Euronext Paris, Xetra, Frankfurt, Borsa Italiana, Euronext
// Amsterdam, Euronext Lisbon, Bolsa de Madrid, "NYSE, NASDAQ", Belex) and
// says what is sold on them: "U mTrader-u možete trgovati najlikvidnijim
// akcijama kompanija listiranih na vodećim svetskim berzama, kao i ETF
// fondovima ... Detaljan spisak dostupnih instrumenata pogledajte ovde",
// the link being the bank's instrument list. For Belgrade: "dostupna su
// vam i ulaganja u akcije kompanija listiranih na Beogradskoj berzi koji
// ulaze u sastav indeksa Belex 15 i Belex line".
//
//   https://www.raiffeisenbank.rs/sr/stanovnistvo/digitalne-usluge/mtrader.html
//
// Foreign places: the bank's list, two tables on one page. "Akcije"
// (country, sector, name, ticker, ISIN) and the ETF table (currency,
// category, name, ticker, ISIN).
//
//   https://banking.raiffeisenbank.rs/etf-spisak/
//
// A share's country is its market, not its domicile (Accenture, Medtronic
// are under USA; Airbus, STMicro under France), so the country is the
// place: Austria Vienna, Belgium Brussels, Finland Helsinki, France Paris,
// Italy Milan, Netherlands Amsterdam, Portugal Lisbon, Spain Madrid.
// Germany is both German markets the bank names, so a German share gets a
// Xetra row and a Frankfurt row. Some tickers carry a Bloomberg suffix
// (IM, AV, UN, UW); it is cut.
//
// ETFs: the EUR lines carry Xetra tickers (SXR8, EUNL, VWCE...), so they
// are written on Xetra and Frankfurt in EUR. The USD lines are US-listed
// funds.
//
// US: one NBBO market, one row in USD on the listing exchange. A UN or UW
// suffix says NYSE or Nasdaq. Otherwise the listing exchange comes from
// the repository's listing files (assets/stocks.csv, assets/etfs.csv) by
// ISIN and ticker; AMEX there is NYSE American for a share and NYSE Arca
// for a fund, CBOE is Cboe BZX. The bank's US lines have slips: on about
// eighteen lines the ticker belongs to a neighbour (GOOG/GOOGL and
// FOX/FOXA swapped, AIG on American Tower's line, EXEL on Expand Energy's)
// while the name and the ISIN agree with each other. When the ISIN's US
// line carries one other ticker, that ticker is written. A bank ISIN no
// US book carries, whose ticker is on one US title, is a reissued ISIN
// (ExxonMobil's new holding company) and that title's ISIN is written.
// The bank's own line always stays in raw.
//
// Belgrade: the union of the two index baskets on the exchange's site, in
// RSD; each symbol's ISIN is read from its own page. www.belex.rs now
// redirects to bgdx.rs (and serves an expired certificate), so bgdx.rs is
// read.
//
//   https://bgdx.rs/eng/trgovanje/indeksi/belex15/korpa
//   https://bgdx.rs/eng/trgovanje/indeksi/belexline/korpa
//   https://bgdx.rs/eng/trgovanje/hartija/dnevni/<SYMBOL>
//
// broker-list.json restrictions ("Selected most-liquid stocks only; ETFs
// limited to the bank's list", "Belex 15 and Belex Line constituents
// only") are the bank's own words above, and are what this list is.
// Currency: each place's home currency. The bank holds dinar and foreign
// currency accounts ("Dinarski i devizni novčani namenski račun") and asks
// for funds "u valuti trgovanja", so EUR and USD lines are both deposit
// currencies; no place here quotes a listed title in a second one.
//
//   node brokers/raiffeisenrs/raiffeisenrs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://banking.raiffeisenbank.rs/etf-spisak/";
const BELEX = "https://bgdx.rs";
const BASKETS = ["belex15", "belexline"];
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const PLACE = {
  XWBO: ["Wiener Börse", "EUR"],
  XBRU: ["Euronext Brussels", "EUR"],
  XHEL: ["Nasdaq Helsinki", "EUR"],
  XPAR: ["Euronext Paris", "EUR"],
  XETR: ["Börse Xetra", "EUR"],
  XFRA: ["Börse Frankfurt", "EUR"],
  XMIL: ["Euronext Milan", "EUR"],
  XAMS: ["Euronext Amsterdam", "EUR"],
  XLIS: ["Euronext Lisbon", "EUR"],
  XMAD: ["Bolsa de Madrid", "EUR"],
  XNYS: ["New York Stock Exchange", "USD"],
  XNAS: ["Nasdaq", "USD"],
  XASE: ["NYSE American", "USD"],
  ARCX: ["NYSE Arca", "USD"],
  BATS: ["Cboe BZX", "USD"],
  XBEL: ["Belgrade Stock Exchange", "RSD"],
};
const COUNTRY = {
  Austria: ["XWBO"],
  Belgium: ["XBRU"],
  Finland: ["XHEL"],
  France: ["XPAR"],
  Germany: ["XETR", "XFRA"],
  Italy: ["XMIL"],
  Netherlands: ["XAMS"],
  Portugal: ["XLIS"],
  Spain: ["XMAD"],
  USA: ["US"],
};
const SUFFIX = { UN: "XNYS", UW: "XNAS" };
const US_FILE = {
  NYSE: () => "XNYS",
  NASDAQ: () => "XNAS",
  AMEX: (type) => (type === "STOCK" ? "XASE" : "ARCX"),
  CBOE: () => "BATS",
};

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

// The exchange's site moved from belex.rs to bgdx.rs.
const belex = (path) => text(`${BELEX}${path}`);

const decode = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((match) => {
    const head = [...match[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((cell) => decode(cell[1]));
    const rows = [...match[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((tr) => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decode(cell[1])))
      .filter((cells) => cells.length);
    return { head, rows };
  });
}

// assets/stocks.csv and assets/etfs.csv: the US books, by ISIN and by ticker.
function usListings() {
  const byIsin = new Map();
  const byTicker = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const cells = line.split(",");
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!US_FILE[exchange] || !ISIN.test(isin)) continue;
      const ticker = String(cells[0] || "").split(":").slice(1).join(":").trim().toUpperCase();
      for (const [book, key] of [[byIsin, isin], [byTicker, ticker]]) {
        if (!book.has(key)) book.set(key, []);
        book.get(key).push({ exchange, ticker, isin });
      }
    }
  }
  return { byIsin, byTicker };
}

function fundType(name) {
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

function cutTicker(raw) {
  const parts = String(raw || "").trim().toUpperCase().split(/\s+/);
  return { ticker: parts[0], suffix: parts[1] || "" };
}

const US = usListings();
const usMisses = [];
const reissued = [];
const retickered = [];
// The US book and the ISIN to write. A bank ISIN no US book carries, whose
// ticker is on exactly one US title, is a reissued ISIN (ExxonMobil's
// holding company, for one): that title's ISIN is written, the bank's
// stays in raw.
function usLine(isin, ticker, suffix, type) {
  const symbol = ticker.replace(/\//g, ".");
  let lines = US.byIsin.get(isin) || [];
  let written = isin;
  if (!lines.length) {
    const byTicker = US.byTicker.get(symbol) || [];
    const isins = new Set(byTicker.map((line) => line.isin));
    if (isins.size === 1) {
      lines = byTicker;
      written = byTicker[0].isin;
      reissued.push(`${ticker} ${isin} -> ${written}`);
    }
  }
  // A ticker the ISIN's US lines do not carry, when they carry one ticker
  // only, is the bank's slip (GOOG/GOOGL and FOX/FOXA swapped, AIG on
  // American Tower's line): the ISIN and the name agree, so the book's
  // ticker is written.
  const tickers = new Set(lines.map((line) => line.ticker));
  let bookTicker = ticker;
  if (lines.length && !tickers.has(symbol) && tickers.size === 1) {
    bookTicker = [...tickers][0];
    retickered.push(`${ticker} -> ${bookTicker} (${written})`);
  }
  const pick = lines.find((line) => line.ticker === bookTicker) || lines[0];
  if (SUFFIX[suffix]) return { mic: SUFFIX[suffix], isin: written, ticker: bookTicker };
  if (!pick) {
    usMisses.push(`${ticker} ${isin}`);
    return null;
  }
  return { mic: US_FILE[pick.exchange](type), isin: written, ticker: bookTicker };
}

const rows = [];
const seen = new Set();
function push({ ticker, name, mic, type, isin, raw }) {
  const [exchange, currency] = PLACE[mic];
  const key = `${isin}|${mic}|${currency}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ query: ticker, ticker, name, exchange, mic, currency, type, isin, raw });
}

// The bank's list.
const html = await text(LIST);
const found = tables(html);
const shares = found.find((table) => table.head.join("|") === "Country|Sector|Company Name|Ticker|ISIN");
const funds = found.find((table) => table.head.join("|") === "Currency|Category|Name|Ticker|ISIN");
if (!shares || shares.rows.length < 1000) throw new Error(`the share table had ${shares?.rows.length || 0} lines`);
if (!funds || funds.rows.length < 60) throw new Error(`the ETF table had ${funds?.rows.length || 0} lines`);

for (const [country, sector, name, rawTicker, rawIsin] of shares.rows) {
  const places = COUNTRY[country];
  if (!places) throw new Error(`unread country ${country} (${name})`);
  const isin = rawIsin.toUpperCase();
  if (!ISIN.test(isin)) throw new Error(`no ISIN for ${name}`);
  const { ticker, suffix } = cutTicker(rawTicker);
  const raw = [country, sector, name, rawTicker, isin].join(" | ");
  for (const place of places) {
    const line = place === "US" ? usLine(isin, ticker, suffix, "STOCK") : { mic: place, isin, ticker };
    if (line) push({ ticker: line.ticker, name, mic: line.mic, type: "STOCK", isin: line.isin, raw });
  }
}

for (const [currency, category, name, rawTicker, rawIsin] of funds.rows) {
  const isin = rawIsin.toUpperCase();
  if (!ISIN.test(isin)) throw new Error(`no ISIN for ${name}`);
  const { ticker, suffix } = cutTicker(rawTicker);
  const type = fundType(name);
  const raw = [currency, category, name, rawTicker, isin].join(" | ");
  let lines;
  if (currency === "EUR") lines = ["XETR", "XFRA"].map((mic) => ({ mic, isin, ticker }));
  else if (currency === "USD") lines = [usLine(isin, ticker, suffix, type)].filter(Boolean);
  else throw new Error(`unread ETF currency ${currency} (${name})`);
  for (const line of lines) push({ ticker: line.ticker, name, mic: line.mic, type, isin: line.isin, raw });
}

// Belgrade: the two index baskets.
const issuers = new Map();
for (const basket of BASKETS) {
  const page = await belex(`/eng/trgovanje/indeksi/${basket}/korpa`);
  const table = tables(page).find((t) => t.rows[0]?.length >= 5 && /Issuer/.test(page) && t.rows.some((r) => /^[A-Z0-9]{3,6}$/.test(r[1])));
  const lines = (table?.rows || []).filter((r) => /^[A-Z0-9]{3,6}$/.test(r[1]));
  if (lines.length < 5) throw new Error(`the ${basket} basket had ${lines.length} lines`);
  for (const [issuer, symbol] of lines) if (!issuers.has(symbol)) issuers.set(symbol, { issuer, baskets: [] });
  for (const [, symbol] of lines) issuers.get(symbol).baskets.push(basket);
}
for (const [symbol, { issuer, baskets }] of issuers) {
  const page = await belex(`/eng/trgovanje/hartija/dnevni/${encodeURIComponent(symbol)}`);
  const isin = (page.match(/>ISIN<\/td>\s*<td>\s*([A-Z0-9]{12})\s*</) || [])[1];
  if (!isin || !ISIN.test(isin)) throw new Error(`no ISIN on the Belex page of ${symbol}`);
  const name = issuer.replace(/\s+,/g, ",");
  push({ ticker: symbol, name, mic: "XBEL", type: "STOCK", isin, raw: [symbol, issuer, isin, baskets.join("+")].join(" | ") });
}

if (usMisses.length) throw new Error(`US lines with no listing exchange: ${usMisses.join(", ")}`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.mic.localeCompare(right.mic) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("raiffeisenrs-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byPlace = new Map();
const unresolved = new Set();
for (const row of kept) {
  const key = `${row.mic} ${row.type} ${row.currency}`;
  byPlace.set(key, (byPlace.get(key) || 0) + 1);
  if (!resolveVenue(row).venue) unresolved.add(`${row.exchange}/${row.mic}/${row.currency}`);
}
console.error(
  `${kept.length} listings: ${[...byPlace].sort().map(([key, count]) => `${count} ${key}`).join(", ")}. ` +
    `${kept.filter((row) => row.isin).length} with an ISIN. Unresolved: ${[...unresolved].join(", ") || "none"}. ` +
    `Reissued ISINs: ${reissued.join("; ") || "none"}. Bank tickers corrected: ${retickered.join("; ") || "none"}.`
);
