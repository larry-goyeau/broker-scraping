// What INDmoney sells in shares and exchange-traded funds, with no login.
// The public sitemaps are the shelf. A line is sold when its catalogue
// says is_active. Indian names come from the Indian catalogue. American
// names come from the US catalogue. The page names the venue, and a name
// listed on both NSE and BSE is kept twice. Sovereign gold bonds are
// marked is_sgb and stay out. A warrant, a rights line or a unit stays
// out. A bond ETF stays. The site challenges a plain request for the
// sitemaps and the Indian catalogue, so those go through Chrome. The US
// catalogue answers a normal request. The printed ISIN is kept. When a
// line has none, one match on the named venue fills it, and several stay
// on the row.
//
//   https://www.indmoney.com/sitemap.xml
//   https://apixt-in.indmoney.com/isb-bg/catalog/v2/get-entity-details/
//   https://apixt-us.indmoney.com/us-stock-broker/us/catalog/get-entity-details
//
//   node brokers/indmoney/indmoney_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const SITEMAP = "https://www.indmoney.com/sitemap.xml";
const INDIAN = "https://apixt-in.indmoney.com/isb-bg/catalog/v2/get-entity-details/";
const AMERICAN = "https://apixt-us.indmoney.com/us-stock-broker/us/catalog/get-entity-details?response_format=web&id=";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const CCY = {
  NSE: "INR",
  BSE: "INR",
  NYSE: "USD",
  NASDAQ: "USD",
  AMEX: "USD",
  CBOE: "USD",
  ARCA: "USD",
  OTC: "USD",
  BATS: "USD",
};
const ASIDE = {
  warrant: /\bwarrants?\b/i,
  rights: /\brights?\b/i,
  unit: /\bunits?\b/i,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function locsOf(xml, url) {
  if (!xml.includes("<loc>")) throw new Error(`${url} has no addresses`);
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

function targetsOf(locs) {
  const indian = [];
  const american = [];
  const seen = new Set();
  for (const loc of locs) {
    let url;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    const path = url.pathname;
    const share = path.match(/^\/stocks\/(.+)-share-price$/);
    const etf = path.match(/^\/etfs\/([^/]+)$/);
    const usShare = path.match(/^\/us-stocks\/.+-share-price-([a-z0-9][a-z0-9.-]*)$/i);
    const usEtf = path.match(/^\/us-stocks\/etfs\/([a-z0-9][a-z0-9.-]*)$/i);
    if (share) add(indian, share[1].toLowerCase());
    else if (etf) add(indian, etf[1].toLowerCase());
    else if (usShare) add(american, usShare[1].toUpperCase());
    else if (usEtf && !/etf/i.test(usEtf[1]) && usEtf[1].split("-").length < 3) add(american, usEtf[1].toUpperCase());
  }
  return { indian, american };

  function add(list, id) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push(id);
  }
}

function slim(body) {
  const catalog = body?.catalog;
  const basic = catalog?.entity_basic;
  if (!catalog || !basic) return null;
  const details = catalog.stock_details || catalog.etf_details || {};
  const segments = [];
  const held = new Set();
  const listed = Array.isArray(catalog.tradable_segments) ? catalog.tradable_segments : [];
  for (const segment of listed) {
    const exchange = String(segment.Exchange || "").trim().toUpperCase();
    const symbol = String(segment.StockSymbol || "").trim().toUpperCase();
    if (!exchange || !symbol || held.has(`${exchange}|${symbol}`)) continue;
    held.add(`${exchange}|${symbol}`);
    segments.push({ exchange, symbol });
  }
  if (!segments.length) {
    const exchange = String(basic.exchange || "").trim().toUpperCase();
    const symbol = String(basic.symbol || basic.ind_key || "").trim().toUpperCase();
    if (exchange && symbol) segments.push({ exchange, symbol });
  }
  const isin = String(details.isin || "").trim().toUpperCase();
  const mark = body?.currency_symbol;
  const currency = mark === "$" ? "USD" : mark === "₹" ? "INR" : "";
  return {
    cls: String(catalog.entity_class || "").trim().toUpperCase(),
    name: String(basic.name || basic.display_name || "").replace(/\s+/g, " ").trim(),
    active: basic.is_active === true,
    sgb: basic.is_sgb === true,
    currency,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    segments,
  };
}

let gap = 40;

async function americanOne(id) {
  const url = `${AMERICAN}${encodeURIComponent(id)}`;
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (gap) await sleep(gap);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.indmoney.com", Referer: "https://www.indmoney.com/" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        gap = Math.max(20, gap - 5);
        const row = slim(await response.json());
        if (row) return row;
        last = `${url} has no catalogue`;
      } else if (response.status === 404 || response.status === 410) return null;
      else {
        last = `${response.status} ${url}`;
        if (response.status === 429) gap = Math.min(1500, gap + 80);
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, width, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, run));
  return out;
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

if (!fs.existsSync(CHROME)) throw new Error(`Chrome is not at ${CHROME}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const opened = await page.goto(SITEMAP, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!opened?.ok()) throw new Error(`${SITEMAP} answered ${opened ? opened.status() : "nothing"}`);
  const indexXml = await page.evaluate(() => document.documentElement.innerText);
  const files = locsOf(indexXml, SITEMAP).filter((loc) => /\/sitemaps\/(?:stocks|us-stocks|us-stocks-etf)\.xml$/.test(loc));
  if (files.length !== 3) throw new Error(`the sitemap index has ${files.length} product files`);
  const locs = [];
  for (const file of files) {
    const xml = await page.evaluate(async (url) => await (await fetch(url)).text(), file);
    locs.push(...locsOf(xml, file));
  }
  const { indian, american } = targetsOf(locs);
  if (indian.length < 1000) throw new Error(`the Indian shelf has ${indian.length} names`);
  if (american.length < 1000) throw new Error(`the US shelf has ${american.length} names`);
  console.error(`${indian.length} Indian names, ${american.length} US names`);

  const probe = await page.evaluate(async (slug) => {
    const response = await fetch(`https://apixt-in.indmoney.com/isb-bg/catalog/v2/get-entity-details/${slug}?response_format=web&catalog-required=true`);
    if (!response.ok) return { status: response.status };
    return { status: response.status, body: await response.json() };
  }, indian[0]);
  if (probe.status !== 200 || !slim(probe.body)?.segments.length) {
    throw new Error(`the Indian catalogue answered ${probe.status} for ${indian[0]}`);
  }

  const tally = { inactive: 0, gold: 0, warrant: 0, rights: 0, unit: 0, absent: 0, other: new Map() };
  const rows = [];
  const seen = new Set();
  const unknown = new Set();

  function take(item) {
    if (!item) {
      tally.absent += 1;
      return;
    }
    if (!item.active) {
      tally.inactive += 1;
      return;
    }
    if (item.sgb || /sovereign gold bond/i.test(item.name)) {
      tally.gold += 1;
      return;
    }
    if (item.cls !== "STOCK" && item.cls !== "ETF") {
      tally.other.set(item.cls || "unmarked", (tally.other.get(item.cls || "unmarked") || 0) + 1);
      return;
    }
    if (!(item.cls === "ETF" && /\bETF\b/i.test(item.name))) {
      for (const [label, pattern] of Object.entries(ASIDE)) {
        if (pattern.test(item.name)) {
          tally[label] += 1;
          return;
        }
      }
    }
    if (!item.name || !item.segments.length) throw new Error(`unread catalogue line ${item.name || item.cls}`);
    for (const segment of item.segments) {
      const key = `${segment.exchange}|${segment.symbol}|${item.cls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const currency = item.currency || CCY[segment.exchange] || "";
      if (!currency) unknown.add(segment.exchange);
      rows.push({
        query: segment.symbol,
        ticker: segment.symbol,
        name: item.name,
        exchange: segment.exchange,
        currency: currency || null,
        type: item.cls,
        raw: [segment.symbol, item.name, segment.exchange, item.isin, item.cls].filter(Boolean).join(" "),
        isin: item.isin,
      });
    }
  }

  const americanJob = pool(american, 4, async (id, index) => {
    take(await americanOne(id));
    if ((index + 1) % 500 === 0) console.error(`US ${index + 1}/${american.length}`);
  });

  const indianJob = (async () => {
    for (let start = 0; start < indian.length; start += 120) {
      const batch = indian.slice(start, start + 120);
      const found = await page.evaluate(async (slugs) => {
        const out = [];
        for (let i = 0; i < slugs.length; i += 6) {
          const part = await Promise.all(slugs.slice(i, i + 6).map(async (slug) => {
            const url = `https://apixt-in.indmoney.com/isb-bg/catalog/v2/get-entity-details/${slug}?response_format=web&catalog-required=true`;
            let last = "";
            for (let attempt = 0; attempt < 4; attempt += 1) {
              try {
                const response = await fetch(url);
                if (response.status === 404 || response.status === 410) return null;
                if (response.ok) return { body: await response.json() };
                last = `${response.status} ${slug}`;
              } catch (error) {
                last = String(error && error.message || error);
              }
              await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
            }
            return { error: last };
          }));
          out.push(...part);
        }
        return out;
      }, batch);
      for (const item of found) {
        if (item?.error) throw new Error(item.error);
        take(item ? slim(item.body) : null);
      }
      console.error(`India ${Math.min(start + batch.length, indian.length)}/${indian.length}`);
    }
  })();

  await Promise.all([americanJob, indianJob]);
  if (tally.other.size) {
    const text = [...tally.other].map(([kind, count]) => `${kind} ${count}`).join(", ");
    throw new Error(`unread catalogue class ${text}`);
  }

  const isins = loadIsinIndex();
  let matched = 0;
  for (const row of rows) {
    if (row.isin) continue;
    const groups = new Map();
    const ids = isins.get(row.ticker)?.get(row.exchange);
    if (ids?.size) groups.set(row.exchange, ids);
    const only = stampIsinMatches(row, groups, row.ticker);
    if (only) row.isin = only;
    if (row.isin || row.matches) matched += 1;
  }

  const kept = stampRows(withoutObligations(rows));
  kept.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));
  fs.writeFileSync(new URL("indmoney-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
  const withIsin = kept.filter((row) => row.isin).length;
  const withMatches = kept.filter((row) => row.matches).length;
  console.error(
    `${kept.length} listings (${withIsin} with an ISIN, ${withMatches} with matches). ` +
      `Left out: ${tally.inactive} inactive, ${tally.gold} gold bonds, ${tally.warrant} warrants, ${tally.rights} rights, ${tally.unit} units, ${tally.absent} absent. ` +
      `${matched} empty ISINs filled from the lists.` +
      (unknown.size ? ` Unpriced venues: ${[...unknown].join(", ")}.` : "")
  );
} finally {
  await browser.close();
}
