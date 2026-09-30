// What Toss Securities sells. The order sitemaps list every product page.
// Each page's JSON gives the market, the ISIN and the kind. A share and a
// depositary receipt, a foreign share and a listed REIT are stocks. EF is an ETF. EN is an
// ETN. There is no ETC kind. A subscription right is not one of those products and stays out. A
// line with trading suspended stays out. status other than N is unread.
//
//   https://www.tossinvest.com/sitemap/stocks-order/0-5000.xml
//   https://wts-info-api.tossinvest.com/api/v2/stock-infos/A005930
//
//   node brokers/toss/toss_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ORIGIN = "https://www.tossinvest.com";
const PARTS = ["0-5000", "5000-10000", "10000-15000", "15000-20000"];
const INFO = "https://wts-info-api.tossinvest.com/api/v2/stock-infos";
const JOBS = 16;
const CACHE = new URL("toss-cache.jsonl", import.meta.url);

const MARKET = {
  KSP: "KOSPI",
  KSQ: "KOSDAQ",
  NYS: "NYSE",
  NSQ: "NASDAQ",
  AMX: "AMEX",
  US_ETC: "US_ETC",
};

const TYPE = {
  ST: "STOCK",
  FS: "STOCK",
  DR: "STOCK",
  RT: "STOCK",
  IF: "STOCK",
  EF: "ETF",
  EN: "ETN",
};

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json,application/xml,text/plain", Referer: `${ORIGIN}/` },
        signal: controller.signal,
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

const codes = [];
for (const part of PARTS) {
  const xml = await textOf(`${ORIGIN}/sitemap/stocks-order/${part}.xml`);
  const found = [...xml.matchAll(/<loc>[^<]*\/stocks\/([^/<]+)\/order<\/loc>/g)].map((match) => match[1]);
  if (!found.length) throw new Error(`Toss sitemap ${part} listed no order page`);
  codes.push(...found);
}
if (new Set(codes).size !== codes.length) throw new Error("Toss sitemap repeated a code");

const cache = new Map();
if (fs.existsSync(CACHE)) {
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    const saved = JSON.parse(line);
    cache.set(saved.code, saved);
  }
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < codes.length) {
    const index = cursor;
    cursor += 1;
    const code = codes[index];
    let row = cache.get(code);
    if (!row) {
      const body = JSON.parse(await textOf(`${INFO}/${encodeURIComponent(code)}`));
      const asset = body?.result;
      if (!asset?.code) throw new Error(`unread stock ${code}`);
      row = {
        code: asset.code,
        symbol: asset.symbol || "",
        name: asset.name || "",
        englishName: asset.englishName || "",
        isin: asset.isinCode || "",
        status: asset.status,
        group: asset.group?.code || "",
        market: asset.market?.code || "",
        currency: asset.currency || "",
        tradingSuspended: asset.tradingSuspended,
      };
      fs.appendFileSync(CACHE, `${JSON.stringify(row)}\n`);
      cache.set(code, row);
    }
    if (row.tradingSuspended !== true && row.tradingSuspended !== false) {
      throw new Error(`unread tradingSuspended ${row.code} ${row.tradingSuspended}`);
    }
    if (row.tradingSuspended) {
      skip("suspended");
      continue;
    }
    if (row.status !== "N") throw new Error(`unread status ${row.status} ${row.code}`);
    if (row.group === "SR") {
      skip("subscription right");
      continue;
    }
    if (row.group === "EW") {
      skip("warrant");
      continue;
    }
    const type = TYPE[row.group];
    if (!type) {
      skip(`unread group ${row.group}`);
      continue;
    }
    const exchange = MARKET[row.market];
    if (!exchange) throw new Error(`unread market ${row.market} ${row.code}`);
    const currency = String(row.currency || "").trim().toUpperCase();
    if (!currency) throw new Error(`unread currency ${row.code}`);
    const ticker = String(row.symbol || "").trim().toUpperCase();
    if (!ticker) throw new Error(`unread ticker ${row.code}`);
    const isin = String(row.isin || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`unread isin ${isin} ${row.code}`);
    const local = String(row.name || "").replace(/\s+/g, " ").trim();
    const english = String(row.englishName || "").replace(/\s+/g, " ").trim();
    const name = (currency === "KRW" ? local || english : english || local) || ticker;
    results.push({
      query: isin,
      ticker,
      name,
      exchange,
      currency,
      type,
      raw: [ticker, name, exchange, currency, type, isin, row.code].filter(Boolean).join(" "),
      isin,
    });
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, codes.length) }, worker));

const seen = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seen.has(key)) {
    skip("duplicate");
    continue;
  }
  seen.add(key);
  unique.push(row);
}
unique.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const unread = [...skipped.keys()].filter((reason) => reason.startsWith("unread group"));
if (unread.length) {
  console.error(`left unread ${unread.map((reason) => `${skipped.get(reason)} ${reason}`).join(", ")}`);
  process.exit(1);
}
fs.writeFileSync(new URL("toss-parsed.json", import.meta.url), JSON.stringify(stampRows(unique), null, 2));
fs.rmSync(CACHE, { force: true });

const byBook = new Map();
for (const row of unique) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(unique.map((row) => row.isin)).size;
console.error(
  `${unique.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
