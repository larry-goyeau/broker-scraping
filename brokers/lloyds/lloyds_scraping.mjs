// What Lloyds sells in shares and exchange-traded
// funds, with no login. The share centre is one list of 4,285 lines,
// split into the United Kingdom, the United States and Europe. The ETF
// centre is a second list. Funds, bonds and gilts are other centres and
// are not here. Investment trusts sit in the share list.
//
// The visible line "Trading on" can be a dead name: 1&1 Drillisch prints
// Neuer Markt while the order form says XETRA. The row stores the form's
// market code. A code this repository already resolves is left as printed.
//
//   https://www.investments.lloydsbank.com/share-centre/
//   https://www.investments.lloydsbank.com/etf-centre/
//
//   node brokers/lloyds/lloyds_scraping.mjs
//   node brokers/lloyds/lloyds_scraping.mjs --limit=5
//
// `--limit` reads a sample and does not write the catalogue.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import https from "node:https";

const ORIGIN = "https://www.investments.lloydsbank.com";
const OUTPUT = new URL("lloyds-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const REGIONS = ["UK", "US", "EUROPE"];
const PAGE = 100;

function arg(name) {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}

const limit = Number(arg("limit")) > 0 ? Number(arg("limit")) : 0;
const lanes = Math.max(1, Number(arg("concurrency")) || 6);

const decode = (value) =>
  String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const announcedOf = (html) => {
  const hit = html.match(/Show\s+([\d,]+)\s+results/);
  const count = hit ? Number(hit[1].replace(/,/g, "")) : 0;
  return Number.isInteger(count) && count > 0 ? count : 0;
};

// The share centre sends a header block large enough that undici refuses it.
function request(url, { method = "GET", body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          "User-Agent": UA,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } : {}),
        },
        maxHeaderSize: 256 * 1024,
        timeout: 40_000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    if (body) req.write(body);
    req.end();
  });
}

async function post(url, body) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request(url, { method: "POST", body });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${url}`);
      return response.text;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw last;
}

async function get(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request(url);
      if (response.status === 404) return "";
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${url}`);
      return response.text;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw last;
}

function named(text) {
  const clean = decode(text);
  const parts = clean.match(/^(.*)\s+\(([^)]+)\)$/);
  return {
    name: parts ? parts[1].trim() : clean,
    ticker: (parts ? parts[2] : "").toUpperCase(),
  };
}

function shareRows(html) {
  const rows = [];
  const patterns = [
    [/href="(\/share-centre\/details\/\?csid=(\d+))"[^>]*>\s*([^<]+?)\s*<\/a>/gi, 2, 3],
    [/href="(\/investment-trust-centre\/details\/([A-Z0-9]{12}\/[^"]+))"[^>]*>\s*([^<]+?)\s*<\/a>/gi, 2, 3],
  ];
  for (const [pattern, idGroup, nameGroup] of patterns) {
    for (const match of html.matchAll(pattern)) {
      rows.push({ kind: "share", id: match[idGroup], path: match[1], ...named(match[nameGroup]) });
    }
  }
  // A few preference shares are listed with an empty link. The detail page is still the csid.
  const blank = /<tr\s+data-csid="(\d+)"(?:(?!<tr\s)[\s\S])*?<a class="link__mobile"\s+href="">\s*([^<]+?)\s*<\/a>/gi;
  for (const match of html.matchAll(blank)) {
    rows.push({
      kind: "share",
      id: match[1],
      path: `/share-centre/details/?csid=${match[1]}`,
      ...named(match[2]),
    });
  }
  return rows;
}

function etfRows(html) {
  const rows = [];
  const pattern = /href="\/etf-centre\/details\/([A-Z0-9]{12})\/([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const label = named(match[3]);
    rows.push({
      kind: "etf",
      id: `${match[1]}/${match[2]}`,
      path: `/etf-centre/details/${match[1]}/${match[2]}`,
      isin: match[1].toUpperCase(),
      name: label.name,
      ticker: label.ticker || match[2].toUpperCase(),
    });
  }
  return rows;
}

async function loadShares() {
  const jobs = [];
  const seen = new Set();
  for (const region of REGIONS) {
    let announced = 0;
    const found = [];
    for (let page = 1; page < 80; page += 1) {
      const html = await post(
        `${ORIGIN}/search/stock?from=${page}&size=${PAGE}&orderField=name&orderType=ASC&marketCapMin=&marketCapMax=&region=${region}`,
        `page=${page}`
      );
      announced ||= announcedOf(html);
      const rows = shareRows(html);
      if (!rows.length) break;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        found.push({ ...row, region });
      }
      if (announced && found.length >= announced) break;
    }
    if (!limit && found.length !== announced) {
      throw new Error(`${region} announced ${announced} shares and returned ${found.length}`);
    }
    console.error(`${found.length} ${region} shares`);
    jobs.push(...found);
  }
  return jobs;
}

async function loadEtfs() {
  const jobs = [];
  const seen = new Set();
  let announced = 0;
  // Page 1 is offset 0 (offset 1 repeats it). The next button sends 2, then 3.
  for (let page = 0; page < 40; page += 1) {
    if (page === 1) continue;
    const html = await post(
      `${ORIGIN}/modules/etf/result/?orderField=UnitNameLong&orderType=asc&offset=0&limit=50`,
      `offset=${page}`
    );
    announced ||= announcedOf(html);
    const rows = etfRows(html);
    if (!rows.length) break;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      jobs.push(row);
    }
    if (announced && jobs.length >= announced) break;
  }
  if (!limit && jobs.length !== announced) {
    throw new Error(`ETFs announced ${announced} and returned ${jobs.length}`);
  }
  console.error(`${jobs.length} ETFs`);
  return jobs;
}

function hidden(html, name) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return decode(match?.[1] || "");
}

function listingType(kind, name) {
  if (kind === "share") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

function parseDetail(html, job) {
  const isin = (hidden(html, "ISIN") || html.match(/ISIN:\s*<\/p>\s*<p class="description__text">\s*([A-Z0-9]{12})/i)?.[1] || job.isin || "").toUpperCase();
  const exchange = hidden(html, "Market").toUpperCase();
  const currency = hidden(html, "Currency").toUpperCase();
  const name = job.name;
  const ticker = job.ticker;
  const type = listingType(job.kind, name);
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return { row: null, why: "pas d'ISIN" };
  if (!exchange) return { row: null, why: "pas de marché" };
  if (!ticker) return { row: null, why: "pas de ticker" };
  if (!type) return { row: null, why: "pas de type" };
  return {
    row: {
      query: isin,
      ticker,
      name,
      exchange,
      currency: currency || null,
      type,
      isin,
      raw: [ticker, name, exchange, currency, isin].filter(Boolean).join(" "),
    },
  };
}

async function mapPool(items, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, () => worker()));
  return out;
}

const shares = await loadShares();
const etfs = await loadEtfs();
const jobs = [...shares, ...etfs];
if (!jobs.length) throw new Error("Lloyds returned no instruments");
const sample = limit > 0 ? jobs.slice(0, limit) : jobs;

let done = 0;
const misses = [];
const details = await mapPool(sample, async (job) => {
  const url = `${ORIGIN}${job.path}`;
  let html = "";
  try {
    html = await get(url);
  } catch (error) {
    misses.push({ path: job.path, name: job.name, why: String(error.message || error).slice(0, 120) });
    done += 1;
    return null;
  }
  if (!html) {
    misses.push({ path: job.path, name: job.name, why: "page vide" });
    done += 1;
    return null;
  }
  const parsed = parseDetail(html, job);
  done += 1;
  if (done % 200 === 0) console.error(`${done}/${sample.length}`);
  if (!parsed.row) {
    misses.push({ path: job.path, name: job.name, ticker: job.ticker, why: parsed.why });
    return null;
  }
  return parsed.row;
});

const seen = new Set();
const results = [];
for (const row of details) {
  if (!row) continue;
  const id = `${row.isin}|${row.exchange}|${row.ticker}|${row.type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push(row);
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

if (!limit) {
  const oil = results.find((row) => row.isin === "GB00BRQMRP25");
  const drillisch = results.find((row) => row.isin === "DE0005545503");
  if (!oil || oil.exchange !== "LSE") throw new Error("1947 Oil & Gas was not stored on LSE");
  if (!drillisch || drillisch.exchange !== "XETRA") throw new Error("1&1 Drillisch was not stored on XETRA");
  if (results.some((row) => /neuer markt/i.test(row.exchange))) throw new Error("a display name was stored as the market");
}

const byType = new Map();
const byExchange = new Map();
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byExchange.set(row.exchange, (byExchange.get(row.exchange) || 0) + 1);
}
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (misses.length ? `, ${misses.length} fiches unread` : "")
);
for (const miss of misses) console.error(`manque ${miss.why} — ${miss.name || ""} ${miss.path}`);
console.error([...byExchange].sort((a, b) => b[1] - a[1]).map(([exchange, count]) => `${count} ${exchange}`).join(", "));

if (limit > 0) {
  console.log(JSON.stringify(results, null, 2));
} else {
  fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));
}
