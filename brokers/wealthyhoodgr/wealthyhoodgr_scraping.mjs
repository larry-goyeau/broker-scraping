// Wealthyhood publishes one page per stock and per ETF it offers, listed in
// two sitemaps. No login. Each page has a Gatsby page-data JSON with the
// name, ticker, place, quote currency and (often) the ISIN.
//
//   https://wealthyhood.com/sitemap-stocks.xml
//   https://wealthyhood.com/sitemap-etfs.xml
//   https://wealthyhood.com/page-data/en/stocks/aapl.nasdaq/page-data.json
//
// The address suffix is the place (EODHD codes: xetra, f, lse, pa, as, br,
// ls, mi, mc, at = Athens, sw = SIX, nasdaq, nyse, amex, bats, nyse arca,
// pink/otc/otcqb/otcmkts/otcgrey = OTC Markets). A title on several places
// has one page per place, so one row per place. The American places are one
// NBBO tape and each title has a single US page.
//
// The asset pages are one universe for both entities (Wealthyhood Ltd in the
// UK, Wealthyhood Europe AEPEY in Greece; every page renders with locale
// "eu"). broker-list.json describes the Greek entity, which cannot sell
// US-domiciled ETFs (no PRIIPs KID): the US-listed American ETFs (SPY, VOO,
// QQQ...) are the UK side and are left out. One stock page carries the bare
// "US" suffix (HOS, an NYSE listing) and is stored as NYSE.
//
// A product named "ETC" (iShares Physical Gold ETC), Xetra-Gold, and the
// commodity pages ("commodities_" id) that are not UCITS funds (WisdomTree
// Physical Gold, WisdomTree Agriculture) are ETC. A name with "ETN" is ETN.
//
//   node brokers/wealthyhoodgr/wealthyhoodgr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://wealthyhood.com";
const SITEMAPS = [
  { url: `${SITE}/sitemap-stocks.xml`, kind: "stocks", floor: 6000 },
  { url: `${SITE}/sitemap-etfs.xml`, kind: "etfs", floor: 2000 },
];
const WORKERS = 3;
// The site sits behind a rate rule: about 6 requests a second for a few
// minutes gets the address refused for ~5 minutes. Stay at 4 a second.
const GAP_MS = 250;

// Address suffix -> place stored.
const PLACE = {
  nasdaq: { exchange: "Nasdaq", mic: "XNAS" },
  nyse: { exchange: "NYSE", mic: "XNYS" },
  us: { exchange: "NYSE", mic: "XNYS" },
  amex: { exchange: "NYSE American", mic: "XASE" },
  "nyse arca": { exchange: "NYSE Arca", mic: "ARCX" },
  bats: { exchange: "Cboe BZX", mic: "BATS" },
  pink: { exchange: "OTC Markets", mic: "OTCM" },
  otc: { exchange: "OTC Markets", mic: "OTCM" },
  otcqb: { exchange: "OTC Markets", mic: "OTCM" },
  otcmkts: { exchange: "OTC Markets", mic: "OTCM" },
  otcgrey: { exchange: "OTC Markets", mic: "OTCM" },
  xetra: { exchange: "Börse Xetra", mic: "XETR" },
  f: { exchange: "Börse Frankfurt", mic: "XFRA" },
  lse: { exchange: "London Stock Exchange", mic: "XLON" },
  pa: { exchange: "Euronext Paris", mic: "XPAR" },
  as: { exchange: "Euronext Amsterdam", mic: "XAMS" },
  br: { exchange: "Euronext Brussels", mic: "XBRU" },
  ls: { exchange: "Euronext Lisbon", mic: "XLIS" },
  mi: { exchange: "Euronext Milan", mic: "XMIL" },
  mc: { exchange: "Bolsa de Madrid", mic: "XMAD" },
  at: { exchange: "Athens Stock Exchange", mic: "XATH" },
  sw: { exchange: "SIX Swiss Exchange", mic: "XSWX" },
};
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "OTCM"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextSlot = 0;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  await sleep(at - now);
}

async function get(url, as = "text") {
  let last = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await slot();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "application/xml,text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return as === "json" ? response.json() : response.text();
      last = `${response.status} ${url}`;
      if (response.status === 404 && as === "json") return null;
    } catch (error) {
      last = `${url}: ${error.cause?.code || error.message || error}`;
    }
    // A refused connection is the rate rule: wait it out.
    await sleep(Math.min(30_000 * (attempt + 1), 120_000));
  }
  throw new Error(last);
}

const pages = [];
for (const map of SITEMAPS) {
  const xml = await get(map.url);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  if (locs.length < map.floor) throw new Error(`${map.url}: ${locs.length} pages, expected at least ${map.floor}`);
  for (const loc of locs) {
    const path = new URL(loc).pathname;
    const slug = decodeURIComponent(path.split("/").filter(Boolean).pop());
    const suffix = slug.slice(slug.lastIndexOf(".") + 1);
    if (!PLACE[suffix]) throw new Error(`unknown place suffix "${suffix}" in ${loc}`);
    pages.push({ loc, path, kind: map.kind, suffix });
  }
  await sleep(300);
}

// Page data, a few at a time.
let next = 0;
let done = 0;
async function worker() {
  while (next < pages.length) {
    const page = pages[next++];
    const data = await get(`${SITE}/page-data${page.path}page-data.json`, "json");
    page.context = data?.result?.pageContext || null;
    done += 1;
    if (done % 1000 === 0) console.error(`${done}/${pages.length}`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

const rows = [];
const left = { usEtf: 0, noPage: 0 };
for (const page of pages) {
  const context = page.context;
  if (!context) {
    left.noPage += 1;
    continue;
  }
  const data = context.stockData || context.etfData;
  if (!data?.about) throw new Error(`no asset data at ${page.loc}`);
  const about = data.about;
  const place = PLACE[page.suffix];
  const id = context.assetCommonId || data.key || "";
  const isin = String(about.isin || "").trim().toUpperCase();
  const name = String(about.name || "").replace(/\s+/g, " ").trim();
  const currency = String(about.currency || about.tradedCurrency || "").trim().toUpperCase();
  const ticker = String(about.ticker || context.ticker || "").trim();
  if (!ticker || !currency) throw new Error(`missing ticker or currency at ${page.loc}`);

  let type = "STOCK";
  if (page.kind === "etfs") {
    // The Greek entity: no American ETFs.
    if (US_MICS.has(place.mic) || isin.startsWith("US")) {
      left.usEtf += 1;
      continue;
    }
    type = "ETF";
    if (/\bETN\b/i.test(name)) type = "ETN";
    else if (/\bETC\b|Xetra-Gold/i.test(name)) type = "ETC";
    else if (/^commodities_/.test(id) && !/UCITS/i.test(name) && !/^(IE|LU)/.test(isin)) type = "ETC";
  }

  rows.push({
    query: isin || ticker,
    ticker,
    name,
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    isin,
    raw: [page.loc, name, about.tradingOn, currency, isin || "-", id].join(" | "),
  });
}

// Known titles, one per market.
const KNOWN = [
  ["AAPL", "XNAS"], ["MMM", "XNYS"], ["III", "XLON"], ["1U1", "XETR"], ["AC", "XPAR"],
  ["ABI", "XBRU"], ["AALB", "XAMS"], ["BCP", "XLIS"], ["A2A", "XMIL"], ["ACX", "XMAD"],
  ["AEGN", "XATH"], ["UUU", "XFRA"], ["CBUS5A", "XSWX"], ["PHAU", "XAMS"],
];
for (const [ticker, mic] of KNOWN) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === mic)) throw new Error(`${ticker} on ${mic} missing`);
}
if (left.noPage > pages.length / 100) throw new Error(`${left.noPage} pages without data`);
if (rows.length < 8500) throw new Error(`only ${rows.length} rows`);

rows.sort((a, b) => a.mic.localeCompare(b.mic) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(new URL("wealthyhoodgr-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts, "left out:", left, "rows:", rows.length);
