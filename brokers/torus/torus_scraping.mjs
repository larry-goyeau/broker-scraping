// What Torus Digital sells in shares and exchange-traded funds on the NSE
// and the BSE, with no login. The site's stock directory (A to Z, with a
// "View More" button) prints every company on each venue: the button reads
// one JSON page after another, for the NSE and for the BSE. The ETF page
// lists the funds. Neither prints a code, so each name is looked up in the
// site's own search, which returns the NSE symbol, the BSE scrip code, the
// ISIN and whether each venue lists the line and has it active. A name the
// search does not return is read from its share page, which prints the same
// symbol, code, ISIN and venues.
//
//   https://www.torusdigital.com/stocks/list-of-stocks
//   https://www.torusdigital.com/stocks-next-page-list?type=allstock&exchange=nse|bse
//   https://www.torusdigital.com/etf
//   https://api-k8.torusdigital.com/bff/api/v1/globalsearch?q=<name>&filter=stk
//   https://www.torusdigital.com/stocks/<slug>-share-price
//
// A line is kept on a venue when the directory puts it there, or the search
// flags it as listed there, and the search does not say that venue delisted
// or suspended it. The directory still prints some companies that were
// suspended long ago, so each line is also checked against the exchange
// cash book in the public Upstox instrument master, the file indianCash.mjs
// reads: the NSE symbol, the BSE scrip code or the ISIN must be there, and
// the BSE line is written with the trading symbol the master gives that
// code. The series must be a sold one (indianCash.mjs keepSold), so debt
// series and the BSE F group of closed fund units stay out, with debenture
// ISINs and iNAV symbols. After a split the site can still print the old
// ISIN; the master's current one is written. An INF ISIN is an exchange
// fund. The directory lags new listings: most companies and ETFs listed in
// the last four months are not in it yet, nor is a DVR share, which carries
// its company's name. Torus offers no foreign shares.
//
//   node brokers/torus/torus_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { isinOf, debtIsin, isInav, keepSold, soldSeries } from "../../indianCash.mjs";

const SITE = "https://www.torusdigital.com";
const NEXT_PAGE = `${SITE}/stocks-next-page-list`;
const ETF_PAGE = `${SITE}/etf`;
const SEARCH = "https://api-k8.torusdigital.com/bff/api/v1/globalsearch";
const MASTER = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const OUTPUT = new URL("torus-parsed.json", import.meta.url);
const WORKERS = 4;
const MIC = { NSE: "XNSE", BSE: "XBOM" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, as = "json") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "*/*", Referer: `${SITE}/` },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        if (as === "buffer") return Buffer.from(await response.arrayBuffer());
        if (as === "text") return response.text();
        return response.json();
      }
      last = `${response.status} ${url}`;
      if (response.status === 404) break;
      if (response.status === 429) await sleep(3000 * (attempt + 1));
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(700 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index]);
        await sleep(80);
      }
    }),
  );
  return results;
}

function clean(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const key = (name) => clean(name).toLowerCase();

// The site's own slug rule (smt-sub-page.js).
function slugOf(name) {
  return clean(name)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

// The directory, one venue at a time, the way "View More" reads it.
async function directory(exchange) {
  const names = [];
  let last = ["", "0"];
  for (let page = 0; page < 1000; page += 1) {
    const url = new URL(NEXT_PAGE);
    url.searchParams.append("lastsort", JSON.stringify(last));
    url.searchParams.append("type", "allstock");
    url.searchParams.append("exchange", exchange);
    url.searchParams.append("startwith", "None");
    const body = await get(url);
    const data = Array.isArray(body?.data) ? body.data : [];
    if (!data.length) return names;
    for (const row of data) if (clean(row.companyname)) names.push(clean(row.companyname));
    if (!Array.isArray(body.last_sort) || JSON.stringify(body.last_sort) === JSON.stringify(last)) return names;
    last = body.last_sort;
    await sleep(120);
  }
  throw new Error(`the ${exchange} directory did not end`);
}

async function etfPage() {
  const html = await get(ETF_PAGE, "text");
  const funds = new Map();
  for (const match of html.matchAll(/<a href="\/etf\/([a-z0-9-]+)">([^<]+)<\/a>/g)) {
    funds.set(match[1], clean(match[2]));
  }
  return funds;
}

async function search(name) {
  const url = `${SEARCH}?q=${encodeURIComponent(name.toLowerCase())}&filter=stk&page=1&limit=20`;
  const body = await get(url);
  if (!Array.isArray(body)) throw new Error(`the search answered ${JSON.stringify(body).slice(0, 120)} for ${name}`);
  return body.filter((row) => row && row.type === "STK");
}

// A share page prints "NSE: SYMBOL" or "BSE: code", the ISIN and the venues.
async function sharePage(path) {
  let html;
  try {
    html = await get(`${SITE}${path}`, "text");
  } catch {
    return null;
  }
  const nse = html.match(/id="nseSymbol">NSE: ([^<\s]+)/);
  const bse = html.match(/id="bseSymbol">BSE: ([^<\s]+)/);
  const isin = html.match(/ISIN: ([A-Z0-9]{12})/);
  const venues = html.match(/data-exchanges="\[([^\]]*)\]"/);
  const listed = new Set((venues?.[1] || "").match(/[A-Z]+/g) || []);
  if (!isin) return null;
  return {
    nsesymbol: nse?.[1] || "",
    bsecode: bse?.[1] || "",
    isin: isin[1],
    nselistedflag: listed.has("NSE") ? "Y" : "N",
    bselistedflag: listed.has("BSE") ? "Y" : "N",
    NSEStatus: listed.has("NSE") ? "Active" : "Not Listed",
    BSEStatus: listed.has("BSE") ? "Active" : "Not Listed",
    fromPage: true,
  };
}

// The NSE and BSE cash books, as the public Upstox master prints them.
async function cashMaster() {
  const rows = JSON.parse(gunzipSync(await get(MASTER, "buffer")).toString("utf8"));
  const book = { NSE: { bySymbol: new Map(), byCode: new Map(), byIsin: new Map() }, BSE: { bySymbol: new Map(), byCode: new Map(), byIsin: new Map() } };
  for (const row of rows) {
    if (row.segment !== "NSE_EQ" && row.segment !== "BSE_EQ") continue;
    const venue = book[row.exchange];
    if (!venue) continue;
    const entry = {
      symbol: String(row.trading_symbol || "").trim().toUpperCase(),
      series: String(row.instrument_type || "").trim().toUpperCase(),
      isin: isinOf(row.isin),
    };
    if (!entry.symbol) continue;
    // A debenture can share the share's NSE symbol (MOTHERSON, series D1).
    // A sold series wins the symbol.
    entry.sold = soldSeries(row.exchange, entry.series);
    const put = (map, id) => {
      if (!id) return;
      const prior = map.get(id);
      if (!prior || (!prior.sold && entry.sold)) map.set(id, entry);
    };
    put(venue.bySymbol, entry.symbol);
    put(venue.byCode, String(row.exchange_token || "").trim());
    put(venue.byIsin, entry.isin);
  }
  if (book.NSE.byIsin.size < 2500 || book.BSE.byCode.size < 4000) {
    throw new Error(`the Upstox master held ${book.NSE.byIsin.size} NSE and ${book.BSE.byCode.size} BSE lines`);
  }
  return book;
}

const gone = (status) => /delist|suspend/i.test(String(status || ""));

const [nseNames, bseNames, funds, master] = await Promise.all([directory("nse"), directory("bse"), etfPage(), cashMaster()]);
if (nseNames.length < 2500) throw new Error(`the NSE directory printed ${nseNames.length} companies`);
if (bseNames.length < 4000) throw new Error(`the BSE directory printed ${bseNames.length} companies`);
if (funds.size < 250) throw new Error(`the ETF page listed ${funds.size} funds`);

// name -> where the site lists it
const wanted = new Map();
function want(name, venue, path) {
  const id = key(name);
  const entry = wanted.get(id) || { name, venues: new Set(), path, fund: false };
  if (venue === "ETF") entry.fund = true;
  else entry.venues.add(venue);
  if (venue === "ETF") entry.path = path;
  wanted.set(id, entry);
}
for (const name of nseNames) want(name, "NSE", `/stocks/${slugOf(name)}-share-price`);
for (const name of bseNames) want(name, "BSE", `/stocks/${slugOf(name)}-share-price`);
for (const [slug, name] of funds) want(name, "ETF", `/etf/${slug}`);

// One search can answer for several names, so each answer is kept.
const found = new Map();
let fromPages = 0;
let notFound = [];
const entries = [...wanted.values()];
await pool(entries, async (entry) => {
  const id = key(entry.name);
  if (found.has(id)) return;
  const hits = await search(entry.name);
  for (const hit of hits) {
    const hid = key(hit.companyname);
    if (wanted.has(hid) && !found.has(hid)) found.set(hid, hit);
  }
  if (found.has(id)) return;
  const slug = slugOf(entry.name);
  const bySlug = hits.find((hit) => hit.companySlug === slug);
  if (bySlug) {
    found.set(id, bySlug);
    return;
  }
  const page = await sharePage(entry.path);
  if (page) {
    fromPages += 1;
    found.set(id, page);
  } else notFound.push(entry.name);
});
if (notFound.length > wanted.size * 0.01) {
  throw new Error(`${notFound.length} of ${wanted.size} names had no code: ${notFound.slice(0, 10).join(", ")}`);
}

const rows = [];
const seen = new Set();
let renewed = 0;
const leftOut = { delisted: 0, notInBook: 0, notSold: 0, debt: 0, noCode: notFound.length };
function push(row) {
  const id = `${row.exchange}|${row.ticker}`;
  if (seen.has(id)) return;
  seen.add(id);
  rows.push(row);
}

for (const entry of entries) {
  const hit = found.get(key(entry.name));
  if (!hit) continue;
  const isin = isinOf(hit.isin);
  if (debtIsin(isin)) {
    leftOut.debt += 1;
    continue;
  }
  const fund = entry.fund || isin.startsWith("INF") || /^ETF$/i.test(hit.sectorname || "");
  const name = clean(hit.companyname) || entry.name;
  // The directory's venue, and any venue the search flags as listed: a BSE
  // company that has just been admitted on the NSE is still only in the BSE
  // directory.
  const venues = new Set([...entry.venues, ...["NSE", "BSE"].filter((v) => hit[`${v.toLowerCase()}listedflag`] === "Y")]);
  for (const exchange of venues) {
    const status = exchange === "NSE" ? hit.NSEStatus : hit.BSEStatus;
    const flag = exchange === "NSE" ? hit.nselistedflag : hit.bselistedflag;
    if (gone(status) || flag === "N") {
      leftOut.delisted += 1;
      continue;
    }
    // A line that neither code nor ISIN finds in the exchange's cash book is
    // a suspended or delisted company the directory still prints.
    const book = master[exchange];
    const code = clean(hit.bsecode);
    const symbol = clean(hit.nsesymbol).toUpperCase();
    // The ISIN first. Then the symbol or code: after a split the site can
    // still print the old ISIN, and the master's current one is written.
    const line =
      (isin ? book.byIsin.get(isin) : null) ||
      (exchange === "NSE" ? symbol && book.bySymbol.get(symbol) : code && book.byCode.get(code)) ||
      null;
    if (!line) {
      leftOut.notInBook += 1;
      continue;
    }
    const ticker = line.symbol;
    const current = line.isin || isin;
    if (current !== isin) renewed += 1;
    if (debtIsin(current) || !keepSold(exchange, line.series, ticker, current, fund)) {
      leftOut.notSold += 1;
      continue;
    }
    const detail = [exchange === "BSE" ? code : "", line.series].filter(Boolean).join(" ");
    const kind = fund || current.startsWith("INF") ? "ETF" : "STOCK";
    push({
      query: current || ticker,
      ticker,
      name,
      exchange,
      mic: MIC[exchange],
      currency: "INR",
      type: kind,
      isin: current,
      raw: [ticker, name, exchange, detail, kind, current, hit.sectorname].filter(Boolean).join(" "),
    });
  }
}

const count = (exchange, type) => rows.filter((row) => row.exchange === exchange && (!type || row.type === type)).length;
if (count("NSE", "STOCK") < 2300) throw new Error(`only ${count("NSE", "STOCK")} NSE shares stayed`);
if (count("BSE", "STOCK") < 3800) throw new Error(`only ${count("BSE", "STOCK")} BSE shares stayed`);
if (count("NSE", "ETF") < 200) throw new Error(`only ${count("NSE", "ETF")} NSE ETFs stayed`);
if (!rows.some((row) => row.exchange === "NSE" && row.ticker === "RELIANCE" && row.isin === "INE002A01018")) {
  throw new Error("Reliance was not an NSE share");
}
if (!rows.some((row) => row.exchange === "NSE" && row.ticker === "NIFTYBEES" && row.type === "ETF")) {
  throw new Error("NIFTYBEES was not an NSE ETF");
}
if (rows.some((row) => !["STOCK", "ETF"].includes(row.type))) throw new Error("an unknown type was written");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(
  `${kept.length} listings ${JSON.stringify(counts)}, ${kept.filter((row) => row.isin).length} with an ISIN; ` +
    `directory NSE ${nseNames.length}, BSE ${bseNames.length}, ETF page ${funds.size}; ${fromPages} read from share pages; ${renewed} ISINs renewed from the master; ` +
    `left out ${Object.entries(leftOut).map(([what, n]) => `${n} ${what}`).join(", ")}`,
);
