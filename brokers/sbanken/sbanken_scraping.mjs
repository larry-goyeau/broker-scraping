// What Sbanken sells in shares and ETFs, with no login. Sbanken is a
// brand of DNB Bank ASA ("Sbanken - et konsept fra DNB"). Its share
// trading is DNB's aksjehandel: the Sbanken page sends customers to
// dnb.no to trade on a large screen. sbanken.no has no list, so the book
// is read from the open API behind DNB's public aksjehandel pages. A
// search on market codes returns every instrument on them, with ISIN,
// currency, type and a tradeable flag; there is no paging.
//
// The markets are Oslo and NOTC (Sbanken prices both) and the 14 foreign
// ones Sbanken names: Stockholm, Copenhagen, Helsinki, NYSE, NYSE
// American and Nasdaq, London, Frankfurt (DNB's German book is Xetra),
// Brussels, Paris, Amsterdam, SIX, Madrid and Toronto. The lists DNB's
// pages show for those countries are kept too: Euronext Expand and
// Euronext Growth in Oslo, First North in the Nordics, NGM and Spotlight
// in Sweden. The US markets are one NBBO tape: a title is kept once.
// Rights, ETNs, indices and the Paris "titres participatifs" (debt-like
// lines in the "Non Equities" segment) stay out.
//
// DNB's API answers tradeable=true for lines that no longer trade, so
// every line is then checked against its exchange's own list
// (brokers/dnb/officialLists.mjs, shared with the DNB scraper): Nasdaq
// Trader's symbol directory for the US, Euronext's equity and ETF files,
// the Nasdaq Nordic screeners, Deutsche Börse's Xetra instruments file,
// the LSE price explorer and instrument API, SIX reference data and the
// TSX directory. Lines missing there go, and so do suspended lines (LSE
// status S, no Nordic last price, no Euronext trading data), Euronext
// buy-back and treasury-share lines, SIX second trading lines, US
// when-issued lines, US SPAC and equity units, notes, warrants and
// rights (DNB types them STOCK under the issuer's name), the Helsinki
// prelist, the Xetra EEX line and the London bond segments. The place
// label follows those lists when DNB's MIC is stale: the US listing
// exchange from Nasdaq Trader (NYSE Texas, Texas Stock Exchange, Cboe
// BZX, NYSE Arca), First North from the Nordic list, Euronext Growth
// Paris from Euronext, BME Growth from DNB's Madrid segment. Spotlight,
// NGM, NOTC and Madrid are not checked (no list read).
//
// ETFs are the ones DNB's own ETF list shows: registered for sale in
// Norway and UCITS. DNB writes "Fra og med 1. oktober får ikke nordmenn
// kjøpt fond notert på børs i USA og Canada" (PRIIPs, no KID). That list
// holds no US or Canadian ETF, so the restriction in broker-list.json
// holds; a line there would stop the run. Sbanken's own pages say
// nothing on ETFs, the page is DNB's. Toronto is the main board only:
// "Handel på TSX Venture Exchange er ikke mulig" (Sbanken), and DNB
// lists nothing on XTSX. Each line carries its own currency, which is
// kept as it is.
//
//   https://sbanken.no/spare/aksjer/aksjehandel
//   https://sbanken.no/priser
//   https://www.dnb.no/markets/aksjer/borshandlede-fond-etf/etf/etf-priips-kid
//   https://www.dnb.no/sparing/aksjehandel/#/stocks
//   https://www.dnb.no/sparing/aksjehandel/#/etf
//   https://nettbank.api.dnb.no/equity-trader-open/srvs/instrument/search
//
//   node brokers/sbanken/sbanken_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkOfficialLists } from "../dnb/officialLists.mjs";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const SEARCH = "https://nettbank.api.dnb.no/equity-trader-open/srvs/instrument/search";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// DNB market code, the place label, the book's MIC, and the fewest shares
// and ETFs a sound read returns (about two thirds of October 2026).
// XPMC and XAMC are the Paris and Amsterdam foreign-currency ETF lines.
const MARKETS = [
  ["XOSL", "Oslo Børs", "XOSL", 130, 1],
  ["XOAS", "Euronext Expand Oslo", "XOAS", 5, 0],
  ["MERK", "Euronext Growth Oslo", "MERK", 55, 0],
  ["NOTC", "NOTC", "NOTC", 15, 0],
  ["XSTO", "Nasdaq Stockholm", "XSTO", 270, 10],
  ["SSME", "First North Stockholm", "SSME", 220, 0],
  ["XNGM", "Nordic Growth Market", "XNGM", 65, 0],
  ["XSAT", "Spotlight Stock Market", "XSAT", 90, 0],
  ["XCSE", "Nasdaq Copenhagen", "XCSE", 75, 0],
  ["DSME", "First North Denmark", "DSME", 15, 0],
  ["XHEL", "Nasdaq Helsinki", "XHEL", 100, 0],
  ["FSME", "First North Helsinki", "FSME", 30, 0],
  ["XNYS", "New York Stock Exchange", "XNYS", 1600, 0],
  ["XASE", "NYSE American", "XASE", 160, 0],
  ["XNAS", "Nasdaq", "XNAS", 2500, 0],
  ["ARCX", "NYSE Arca", "ARCX", 0, 0],
  ["XLON", "London Stock Exchange", "XLON", 500, 1300],
  ["XETR", "Börse Xetra", "XETR", 900, 1300],
  ["XBRU", "Euronext Brussels", "XBRU", 70, 0],
  ["XPAR", "Euronext Paris", "XPAR", 400, 150],
  ["XPMC", "Euronext Paris", "XPAR", 0, 0],
  ["XAMS", "Euronext Amsterdam", "XAMS", 80, 200],
  ["XAMC", "Euronext Amsterdam", "XAMS", 0, 100],
  ["XSWX", "SIX Swiss Exchange", "XSWX", 170, 450],
  ["XMCE", "Bolsa de Madrid", "XMAD", 180, 0],
  ["XTSE", "Toronto Stock Exchange", "XTSE", 480, 0],
];
const US = new Set(["XNYS", "XASE", "XNAS", "ARCX"]);
// Places the official lists give when DNB's MIC is stale.
const LISTED_PLACE = {
  XNAS: "Nasdaq", XNYS: "New York Stock Exchange", XASE: "NYSE American", ARCX: "NYSE Arca", BATS: "Cboe BZX",
  XCHI: "NYSE Texas", TXSE: "Texas Stock Exchange", IEXG: "IEX",
  ALXP: "Euronext Growth Paris", ALXB: "Euronext Growth Brussels", MABX: "BME Growth",
  XSTO: "Nasdaq Stockholm", SSME: "First North Stockholm", XHEL: "Nasdaq Helsinki", FSME: "First North Helsinki",
  XCSE: "Nasdaq Copenhagen", DSME: "First North Denmark",
};
const US_LISTED = new Set(["XNYS", "XASE", "XNAS", "ARCX", "BATS", "XCHI", "TXSE", "IEXG"]);
const KINDS = new Set(["STOCK", "ETF", "ETN", "RIGHT", "INDEX", "UNKNOWN"]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The API sits behind Akamai. After a burst of calls it answers 403 to
// the whole address, browser included, for about ten minutes.
async function search(query) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec(
        "curl",
        [
          "-fsS", "--max-time", "120", "-A", UA, "-X", "POST",
          "-H", "Content-Type: application/json",
          "-H", "Accept: application/json",
          "-H", "Origin: https://www.dnb.no",
          "-H", "Referer: https://www.dnb.no/",
          "-H", `X-DNBAPI-Trace-Id: ${randomUUID()}`,
          "--data", JSON.stringify({ query }),
          SEARCH,
        ],
        { maxBuffer: 64_000_000, encoding: "utf8" },
      );
      const body = JSON.parse(stdout);
      if (!Array.isArray(body)) throw new Error(`search ${JSON.stringify(query)} returned no list`);
      return body;
    } catch (error) {
      last = `${String(error.stderr || error.message || error).trim()} for ${JSON.stringify(query)}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// A few searches cover the book: the STOCK lines of the markets, and
// DNB's own ETF query (registered in Norway and UCITS). One search over
// every market's shares fails with a 500, so the US shares go apart.
// Few large calls stay clear of the block above.
const CODES = MARKETS.map(([code]) => code);
const HOME = CODES.filter((code) => !US.has(code));
const read = [
  ...(await search({ mics: HOME, instrumentTypes: ["STOCK"], marketSegments: [] })),
  ...(await search({ mics: ["XNYS", "XASE", "ARCX"], instrumentTypes: ["STOCK"], marketSegments: [] })),
  ...(await search({ mics: ["XNAS"], instrumentTypes: ["STOCK"], marketSegments: [] })),
  ...(await search({ mics: CODES, instrumentTypes: ["ETF"], marketSegments: [], rfsCountries: ["Norway"], ucits: true })),
];
const byCode = new Map(CODES.map((code) => [code, []]));
for (const item of read) {
  const code = normalize(item.mic).toUpperCase();
  if (!byCode.has(code)) throw new Error(`${item.ric} is on ${item.mic}, which was not asked`);
  byCode.get(code).push(item);
}

const merged = new Map();
const sourceOf = new Map();
const left = new Map();
function leave(reason) {
  left.set(reason, (left.get(reason) || 0) + 1);
}
const usSeen = new Set();

for (const [code, exchange, mic, stockFloor, etfFloor] of MARKETS) {
  const items = byCode.get(code);
  const counts = { STOCK: 0, ETF: 0 };
  for (const item of items) {
    const kind = normalize(item.type).toUpperCase();
    if (!KINDS.has(kind)) throw new Error(`${item.ric} is of type ${kind || "blank"}`);
    if (kind !== "STOCK" && kind !== "ETF") throw new Error(`${item.ric} came back as ${kind}`);
    if (kind === "ETF" && (item.ucits !== true || !String(item.rfsCountries || "").includes("Norway"))) {
      throw new Error(`${item.ric} is not a Norway-registered UCITS ETF`);
    }
    if (item.tradeable !== true) {
      if (item.tradeable !== false) throw new Error(`${item.ric} tradeable is ${item.tradeable}`);
      leave("not tradeable");
      continue;
    }
    // Paris files its ETFs and its titres participatifs (debt-like lines
    // of BNP Paribas, Renault, Sanofi...) both under "Non Equities".
    if (kind === "STOCK" && /non equit/i.test(normalize(item.marketSegment))) {
      leave("Paris non-equity line");
      continue;
    }
    const ric = normalize(item.ric);
    const ticker = normalize(item.ticker).toUpperCase();
    const name = normalize(item.displayName || item.description);
    const isin = normalize(item.isin).toUpperCase();
    const currency = normalize(item.currency).toUpperCase();
    if (!ticker || !name) throw new Error(`${ric} has no ticker or name`);
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ric} has no ISIN`);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ric} is quoted ${currency || "nowhere"}`);
    // One US tape: the first market that lists the title keeps it.
    if (US.has(code)) {
      if (usSeen.has(isin)) {
        leave("second US line");
        continue;
      }
      usSeen.add(isin);
    }
    const key = `${isin}|${mic}|${currency}`;
    const prior = merged.get(key);
    if (prior) {
      if (prior.type !== kind) throw new Error(`${isin} is both ${prior.type} and ${kind} on ${exchange}`);
      // A when-issued twin (MMEDV beside MMED) keeps the shorter symbol.
      if (ticker.length < prior.ticker.length) merged.set(key, { ...prior, ticker, raw: [ric, ticker, name, code, currency, isin, kind].join(" ") });
      leave("repeated line");
      continue;
    }
    sourceOf.set(key, { code, segment: normalize(item.marketSegment) });
    merged.set(key, {
      query: ticker,
      ticker,
      name,
      exchange,
      currency,
      type: kind,
      isin,
      mic,
      raw: [ric, ticker, name, code, currency, isin, kind].join(" "),
    });
    counts[kind] += 1;
  }
  if (counts.STOCK < stockFloor) throw new Error(`${code} gave ${counts.STOCK} shares, expected ${stockFloor} or more`);
  if (counts.ETF < etfFloor) throw new Error(`${code} gave ${counts.ETF} ETFs, expected ${etfFloor} or more`);
}

// TSX Venture is not sold. DNB lists nothing on it; a line there would
// mean the book changed.
const venture = await search({ mics: ["XTSX"], instrumentTypes: ["STOCK"], marketSegments: [] });
if (venture.length) throw new Error(`DNB now lists ${venture.length} TSX Venture shares`);

// Each line against its exchange's own list (see brokers/dnb/officialLists.mjs).
const book = [...merged.entries()];
const { verdicts, notes } = await checkOfficialLists(
  book.map(([key, row]) => ({ code: sourceOf.get(key).code, isin: row.isin, currency: row.currency, ticker: row.ticker, type: row.type, segment: sourceOf.get(key).segment })),
);
const dropped = new Map();
const relabelled = new Map();
const rows = [];
book.forEach(([, row], index) => {
  const { drop, mic } = verdicts[index];
  if (drop) {
    dropped.set(drop, (dropped.get(drop) || 0) + 1);
    return;
  }
  if (!mic) {
    rows.push(row);
    return;
  }
  const exchange = LISTED_PLACE[mic];
  if (!exchange) throw new Error(`${row.ticker}: no place for listed MIC ${mic}`);
  relabelled.set(exchange, (relabelled.get(exchange) || 0) + 1);
  rows.push({ ...row, exchange, mic, raw: `${row.raw} listed ${exchange}` });
});
const dropTotal = [...dropped.values()].reduce((a, b) => a + b, 0);
if (dropTotal > book.length * 0.05) throw new Error(`the official lists drop ${dropTotal} of ${book.length} lines: ${JSON.stringify([...dropped])}`);
rows.sort((a, b) => a.type.localeCompare(b.type) || a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));

const must = [
  ["NO0010096985", "XOSL", "NOK", "Equinor on Oslo"],
  ["US0378331005", "XNAS", "USD", "Apple on Nasdaq"],
  ["US46625H1005", "XNYS", "USD", "JPMorgan on the NYSE"],
  ["SE0015811963", "XSTO", "SEK", "Investor B on Stockholm"],
  ["DK0062498333", "XCSE", "DKK", "Novo Nordisk B on Copenhagen"],
  ["FI0009000681", "XHEL", "EUR", "Nokia on Helsinki"],
  ["DE0007164600", "XETR", "EUR", "SAP on Xetra"],
  ["CH0038863350", "XSWX", "CHF", "Nestlé on SIX"],
  ["CA7800871021", "XTSE", "CAD", "Royal Bank of Canada on Toronto"],
  ["IE00B4L5Y983", "XETR", "EUR", "iShares Core MSCI World on Xetra"],
];
for (const [isin, mic, currency, label] of must) {
  if (!rows.some((row) => row.isin === isin && row.mic === mic && row.currency === currency)) throw new Error(`${label} is missing`);
}
if (rows.some((row) => row.type === "ETF" && (row.isin.startsWith("US") || US_LISTED.has(row.mic) || row.mic === "XTSE"))) throw new Error("a US or Canadian ETF came through");

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("sbanken-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byPlace = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byPlace.set(key, (byPlace.get(key) || 0) + 1);
}
const stocks = kept.filter((row) => row.type === "STOCK").length;
console.error(
  `${kept.length} listings (${stocks} STOCK, ${kept.length - stocks} ETF; ` +
    `${[...byPlace].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (left.size ? `; left out ${[...left].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "") +
    `; dropped on the official lists: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ") || "none"}` +
    `; place from the official list: ${[...relabelled].map(([label, count]) => `${count} ${label}`).join(", ") || "none"}; ${notes.join("; ")}`
);
