// What Hargreaves Lansdown sells. The public site is the book: a name that
// is not on it is not for sale, and the telephone is the same book at a
// higher charge.
//
// Shares, ETFs, investment trusts, gilts and other listed lines are one
// page per letter. The comment after each line is the SEDOL. The place
// and the ISIN are on the factsheet (`marketListing`, `isin`). A factsheet
// with `internetTradable` false is a price page, not a sale: an OTC line,
// an escrow line, a corporate-action line. Those are left out.
//
//   https://www.hl.co.uk/shares/shares-search-results/a
//   https://www.hl.co.uk/shares/share-dealing/overseas-share-dealing-service
//
// Funds are a second alphabet. A fund is not listed on an exchange, and
// the factsheet prints a SEDOL and no ISIN.
//
//   https://www.hl.co.uk/funds/fund-discounts,-prices--and--factsheets/search-results/a
//
//   node brokers/hargreaveslansdown/hargreaveslansdown_scraping.mjs
//   node brokers/hargreaveslansdown/hargreaveslansdown_scraping.mjs --letters=a --limit=5
//
// `--limit` reads a sample and does not write the catalogue.

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.hl.co.uk";
const SHARE_INDEX = `${ORIGIN}/shares/shares-search-results/`;
const FUND_INDEX = `${ORIGIN}/funds/fund-discounts,-prices--and--factsheets/search-results/`;
const QUOTES = "https://online.hl.co.uk/ajaxx/rest.php/security_data";
const CACHE = new URL("hargreaveslansdown-lookedup.json", import.meta.url);
const OUTPUT = new URL("hargreaveslansdown-parsed.json", import.meta.url);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// HL's factsheet code, written as a name this repository already resolves.
// An unknown code is kept as printed.
const PLACE = {
  LSE: "LSE",
  LON: "LSE",
  NAS: "NASDAQ",
  NMS: "NASDAQ",
  NSM: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NYS: "NYSE",
  NYQ: "NYSE",
  ARC: "ARCA",
  PCQ: "ARCA",
  ASE: "AMEX",
  MIL: "MIL",
  PAR: "XPAR",
  AMS: "XAMS",
  BRU: "XBRU",
  LIS: "XLIS",
  MAD: "XMAD",
  SWX: "XSWX",
  EBS: "XSWX",
  OSL: "OSL",
  STO: "XSTO",
  HEL: "XHEL",
  CPH: "XCSE",
  VIE: "XWBO",
  WBO: "XWBO",
  DUB: "XMSM",
  ISE: "XMSM",
  ETR: "XETR",
  GER: "XETR",
  IBIS: "XETR",
  FRA: "XFRA",
  TOR: "XTSE",
  TSX: "XTSE",
  CVE: "XTSX",
  VAN: "XTSX",
};

const BOND_LISTS = [
  "/shares/corporate-bonds-gilts/bond-prices/gbp-bonds",
  "/shares/corporate-bonds-gilts/bond-prices/uk-gilts",
  "/shares/corporate-bonds-gilts/bond-prices/uk-index-linked-gilts",
  "/shares/corporate-bonds-gilts/bond-prices/pibs-and-others",
];

function arg(name) {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}

function numberArg(name, fallback) {
  const text = arg(name);
  return text && Number(text) > 0 ? Number(text) : fallback;
}

const letters = (arg("letters") || "abcdefghijklmnopqrstuvwxyz0123456789").split("");
const limit = numberArg("limit", 0);
const lanes = Math.max(1, numberArg("concurrency", 4));
const sharesOnly = process.argv.includes("--shares-only");
const fundsOnly = process.argv.includes("--funds-only");

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function decode(value) {
  return String(value || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function get(url, accept = "text/html") {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 404) return "";
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.text();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw last;
}

async function mapPool(items, limitCount, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limitCount, items.length) }, () => worker()));
  return out;
}

function shareRows(html) {
  const rows = [];
  const pattern =
    /href="https:\/\/www\.hl\.co\.uk\/shares\/shares-search-results\/([a-z0-9]\/[^"]+)"[^>]*title="([^"]*)"[\s\S]*?<\/a>\s*-\s*([^<]*?)\s*<!--\s*([A-Z0-9]{6,7})\s*-->/gi;
  for (const match of html.matchAll(pattern)) {
    const description = decode(match[3]);
    const epic = description.match(/\(([A-Z0-9.]+)\)$/)?.[1] || "";
    rows.push({
      kind: "share",
      slug: match[1],
      name: decode(match[2]),
      description: description.replace(/\s*\([A-Z0-9.]+\)$/, "").trim(),
      epic,
      sedol: match[4].toUpperCase(),
    });
  }
  return rows;
}

function fundRows(html) {
  const rows = [];
  const pattern =
    /href="https:\/\/www\.hl\.co\.uk\/funds\/fund-discounts,-prices--and--factsheets\/search-results\/([a-z0-9]\/[^"]+)"[^>]*title="([^"]*)"/gi;
  for (const match of html.matchAll(pattern)) {
    rows.push({ kind: "fund", slug: match[1], name: decode(match[2]), sedol: "", epic: "" });
  }
  return rows;
}

function placeOf(code) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "";
  return PLACE[key] || key;
}

function listingType(kind, name) {
  if (kind === "etf") return /\bETC\b/i.test(name) ? "ETC" : /\bETN\b/i.test(name) ? "ETN" : "ETF";
  if (kind === "fund") return "FUND";
  if (kind === "bond" || kind === "gilt") return "BOND";
  if (kind === "share" || kind === "equity") return "STOCK";
  return "";
}

function parseShare(html, index) {
  if (/"internetTradable":false/.test(html)) return { skip: true };
  const isin = toIsin(html.match(/"isin":"([A-Z0-9]{12})"/)?.[1]);
  const market = html.match(/"marketListing":"([^"]+)"/)?.[1] || "";
  const kind = html.match(/"type":"(share|etf|fund|bond|gilt)"/)?.[1] || "share";
  const epic = html.match(/"epic":"([^"]*)"/)?.[1] || index.epic || "";
  const currency = html.match(/"currency":"([A-Z]{3})"/)?.[1] || "";
  const name = decode(html.match(/"Instrument Name":"([^"]+)"/)?.[1] || html.match(/"name":"([^"]+)"/)?.[1] || "");
  const exchange = placeOf(market);
  const type = listingType(kind, name || index.name);
  if (!exchange || !type) return null;
  const ticker = (epic || index.sedol || "").toUpperCase();
  if (!ticker) return null;
  const printed = name || [index.name, index.description].filter(Boolean).join(" ");
  return {
    query: isin || index.sedol,
    ticker,
    name: printed,
    exchange,
    currency: currency || null,
    type,
    isin: isin || null,
    tradable: true,
    raw: [ticker, printed, exchange, currency, isin || index.sedol].filter(Boolean).join(" "),
  };
}

function parseFund(html, index) {
  const sedol = (
    html.match(/content="([A-Z0-9]{6,7})"\s+name="Fund_Sedol"/i)?.[1]
    || html.match(/var sedol\s*=\s*'([A-Z0-9]{6,7})'/i)?.[1]
    || ""
  ).toUpperCase();
  if (!sedol) return null;
  const isin = toIsin(html.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/)?.[0]);
  return {
    query: isin || sedol,
    ticker: sedol,
    name: index.name,
    exchange: null,
    currency: null,
    type: "FUND",
    isin: isin || null,
    sedol,
    raw: [sedol, index.name, isin].filter(Boolean).join(" "),
  };
}

async function loadIndex() {
  const jobs = [];
  const seen = new Set();
  const shelves = [];
  if (!fundsOnly) shelves.push(["share", SHARE_INDEX, shareRows]);
  if (!sharesOnly) shelves.push(["fund", FUND_INDEX, fundRows]);

  for (const [kind, root, parse] of shelves) {
    const pages = await mapPool(letters, 3, async (letter) => {
      const html = await get(`${root}${letter}`);
      return html ? parse(html) : [];
    });
    let count = 0;
    for (const rows of pages) {
      for (const row of rows) {
        const key = `${kind}:${row.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(row);
        count += 1;
      }
    }
    console.error(`${count} ${kind === "share" ? "listed lines" : "funds"} on the letter pages`);
  }

  if (!fundsOnly) {
    let added = 0;
    for (const path of BOND_LISTS) {
      const html = await get(`${ORIGIN}${path}`);
      for (const row of shareRows(html)) {
        const key = `share:${row.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(row);
        added += 1;
      }
    }
    if (added) console.error(`${added} bond lines were not on a letter page`);
  }
  return jobs;
}

function loadCache() {
  if (!fs.existsSync(CACHE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return parsed.rows && typeof parsed.rows === "object" ? parsed.rows : {};
  } catch {
    return {};
  }
}

function saveCache(rows) {
  fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), rows }));
}

const jobs = await loadIndex();
if (jobs.length === 0) throw new Error("Hargreaves Lansdown returned no instruments");

const sample = limit > 0 ? jobs.slice(0, limit) : jobs;
const cache = loadCache();
let done = 0;
let failed = 0;
let skipped = 0;

function cached(job) {
  const row = cache[`${job.kind}:${job.slug}`];
  if (!row) return false;
  if (row.skip) return true;
  if (job.kind === "fund") return true;
  return row.tradable === true;
}

await mapPool(sample, lanes, async (job) => {
  const key = `${job.kind}:${job.slug}`;
  if (cached(job)) {
    if (cache[key]?.skip) skipped += 1;
    done += 1;
    return;
  }
  const root = job.kind === "fund" ? FUND_INDEX : SHARE_INDEX;
  let html = "";
  try {
    html = await get(`${root}${job.slug}`);
  } catch {
    failed += 1;
    done += 1;
    return;
  }
  const row = html ? (job.kind === "fund" ? parseFund(html, job) : parseShare(html, job)) : null;
  if (row?.skip) {
    cache[key] = { skip: true };
    skipped += 1;
  } else if (row) cache[key] = row;
  else failed += 1;
  done += 1;
  if (done % 200 === 0) {
    saveCache(cache);
    console.error(`${done}/${sample.length}`);
  }
});
saveCache(cache);

const fundSedols = sample
  .filter((job) => job.kind === "fund" && cache[`fund:${job.slug}`] && !cache[`fund:${job.slug}`].currency)
  .map((job) => cache[`fund:${job.slug}`].sedol);
for (let index = 0; index < fundSedols.length; index += 40) {
  const batch = fundSedols.slice(index, index + 40);
  let payload;
  try {
    payload = JSON.parse(await get(`${QUOTES}?sedols=${batch.join(",")}&format=json`, "application/json"));
  } catch {
    continue;
  }
  const bySedol = new Map((payload.data || []).map((row) => [String(row.sedol || "").toUpperCase(), row.currency]));
  for (const job of sample) {
    const row = cache[`fund:${job.slug}`];
    if (!row || row.currency || !bySedol.get(row.sedol)) continue;
    row.currency = String(bySedol.get(row.sedol)).toUpperCase();
    row.raw = [row.ticker, row.name, row.currency, row.isin].filter(Boolean).join(" ");
  }
}

const seen = new Set();
const results = [];
for (const job of sample) {
  const row = cache[`${job.kind}:${job.slug}`];
  if (!row || row.skip) continue;
  const { sedol, tradable, ...listing } = row;
  const id = `${listing.isin || listing.query}|${listing.exchange || ""}|${listing.ticker}|${listing.type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push(listing);
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange || "").localeCompare(String(right.exchange || ""));
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.query)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped ? `, ${skipped} not for sale` : "") +
    (failed ? `, ${failed} pages unread` : "")
);

if (limit > 0) {
  console.log(JSON.stringify(results, null, 2));
} else {
  fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(results), null, 2));
}
