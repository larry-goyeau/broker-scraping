// Books missing from the Swissquote catalogue, read on its public
// trading screen. Bid and ask are the quote. A last trade is never
// written in their place.
//
// Each reading is stored under the exchange's own MIC, so another
// broker looking up the same ISIN and currency finds it. London
// pence and pounds are one book: the figure is filed under both.
//
//   node spreads/sq-touch.mjs

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { catalogueFiles } from "../catalogues.mjs";
import { listingKey } from "./venues.mjs";

const TOUCH = fileURLToPath(new URL("./sq-touch.json", import.meta.url));
const STORE = fileURLToPath(new URL("./spread.json", import.meta.url));
const CATALOGUE = fileURLToPath(new URL("../brokers/swissquote/swissquote-parsed.json", import.meta.url));
const AT_ONCE = 8;

// Platform exchange id, learned from the quote screen. The name test
// picks the line when a search is needed.
const VENUE = {
  XLON: { id: 361, name: /london|^lse$/i },
  XETR: { id: 44, name: /xetra/i },
  XFRA: { id: 13, name: /frankfurt/i },
  XSTU: { id: 16, name: /stuttgart/i },
  XMUN: { id: 15, name: /munchen|munich/i },
  XHAM: { id: 17, name: /hamburg/i },
  XDUS: { id: 14, name: /dusseldorf/i },
  XHAN: { id: 19, name: /hannover/i },
  XSWX: { id: 4, name: /^six$/i },
  XSES: { id: 120, name: /singapore|sgx/i },
  XASX: { id: 111, name: /australia/i },
  XNAS: { id: 67, name: /nasdaq/i },
  XHEL: { id: 40, name: /helsinki/i },
  // The quote screen for a Stockholm line is /fullQuote/{isin}/53_SEK.
  XSTO: { id: 53, name: /stockholm/i },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const twinOf = (currency) => {
  const ccy = String(currency || "").toUpperCase();
  if (ccy === "GBP") return "GBX";
  if (ccy === "GBX") return "GBP";
  if (ccy === "CNH") return "CNY";
  if (ccy === "CNY") return "CNH";
  return "";
};

const hasLeaf = (spreads, isin, mic, currency) => {
  const book = spreads[isin]?.[mic];
  if (!book) return false;
  const twin = twinOf(currency);
  const present = (leaf) => leaf?.bp > 0 || leaf?.perShare > 0;
  return present(book[currency]) || (twin && present(book[twin]));
};

function jobsOf(spreads, onlyMic = "") {
  const files = onlyMic ? catalogueFiles() : [CATALOGUE];
  const rows = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    rows.push(...(Array.isArray(parsed) ? parsed : parsed.rows || []));
  }
  const jobs = new Map();
  for (const row of rows) {
    if (String(row.type || "").toUpperCase() === "CRYPTO") continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const { venue } = listingKey(row);
    if (!venue?.mic) continue;
    if (onlyMic && venue.mic !== onlyMic) continue;
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    const key = `${venue.mic}|${isin}|${currency}`;
    if (jobs.has(key)) continue;
    jobs.set(key, {
      isin,
      mic: venue.mic,
      currency,
      ticker: String(row.ticker || "").toUpperCase(),
    });
  }
  return [...jobs.values()].sort(
    (a, b) => (b.mic === "XLON") - (a.mic === "XLON") || a.mic.localeCompare(b.mic)
  );
}

async function connect() {
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
  const page = (await browser.pages()).find((p) => /trade\.swissquote\.ch/i.test(p.url()));
  if (!page) throw new Error("aucun onglet Swissquote ouvert (trade.swissquote.ch)");
  return { browser, page };
}

async function api(page, path, body) {
  return page.evaluate(
    async (url, body) => {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        credentials: "include",
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body } : {}),
      });
      const text = await response.text();
      try {
        return { status: response.status, body: JSON.parse(text) };
      } catch {
        return { status: response.status, text: text.slice(0, 160) };
      }
    },
    path,
    body ? JSON.stringify(body) : null
  );
}

function exchangeIds(jobs) {
  const ids = new Map(Object.entries(VENUE).map(([mic, venue]) => [mic, venue.id]));
  const skipped = [...new Set(jobs.map((job) => job.mic))].filter((mic) => !ids.has(mic));
  if (skipped.length) console.error(`sans identifiant de place : ${skipped.join(", ")}`);
  return ids;
}

async function quote(page, job, exchangeId) {
  const currencies = [job.currency, twinOf(job.currency)].filter(Boolean);
  for (const currency of currencies) {
    const key = `${job.isin}_${exchangeId}_${currency}`;
    const mask = await api(page, `/eding_securities-retail-trademask-plugin/api/trademask/stock-key/${key}?orderSide=BUY`);
    const body = mask.body || {};
    const prices = body.prices || {};
    const bid = Number(prices.bidPrice);
    const ask = Number(prices.askPrice);
    const bp = bpFrom(bid, ask);
    if (bp == null) continue;
    const ticker = String(body.symbol || job.ticker || "").toUpperCase();
    return {
      isin: job.isin,
      mic: job.mic,
      currency,
      ticker,
      bid,
      ask,
      bp,
      stamp: String(prices.bidTimestamp || prices.lastTimestamp || ""),
      url:
        job.mic === "XLON" && ticker
          ? `https://www.londonstockexchange.com/stock/${encodeURIComponent(ticker)}/x/company-page`
          : `https://trade.swissquote.ch/eding_trading-platform/#fullQuote/${job.isin}/${exchangeId}_${currency}`,
    };
  }
  return null;
}

async function pool(items, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, run));
}

function currenciesOf(row) {
  const currency = String(row.currency || "").toUpperCase();
  if ((row.mic === "XLON" && (currency === "GBP" || currency === "GBX")) || currency === "CNH" || currency === "CNY") {
    return [currency, twinOf(currency)];
  }
  return [currency];
}

const onlyMic = (process.argv.find((arg) => arg.startsWith("--only=")) || "").slice(7).toUpperCase();
const spreads = JSON.parse(fs.readFileSync(STORE, "utf8")).spreads;
const jobs = jobsOf(spreads, onlyMic);
console.error(`${jobs.length} lignes sans carnet. Londres d'abord.`);
const london = jobs.filter((job) => job.mic === "XLON").length;
console.error(`${london} à Londres, ${jobs.length - london} ailleurs.`);

const { browser, page } = await connect();
const ids = exchangeIds(jobs);
const readable = jobs.filter((job) => ids.has(job.mic));
console.error(`${readable.length} lignes dont la place est lisible.`);
const found = [];
let empty = 0;
let failed = 0;
let done = 0;
await pool(readable, async (job) => {
  const exchangeId = ids.get(job.mic);
  done += 1;
  if (!exchangeId) {
    failed += 1;
    return;
  }
  try {
    const row = await quote(page, job, exchangeId);
    if (!row) empty += 1;
    else found.push(row);
  } catch {
    failed += 1;
  }
  if (done % 250 === 0) console.error(`${done}/${readable.length} — ${found.length} carnets`);
});
await browser.disconnect();

found.sort((a, b) => a.mic.localeCompare(b.mic) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(
  TOUCH,
  JSON.stringify({ at: new Date().toISOString(), rows: found, empty, failed }, null, 2)
);
console.error(`${found.length} carnets, ${empty} sans bid et ask, ${failed} échecs. Écrit dans sq-touch.json.`);

const file = JSON.parse(fs.readFileSync(STORE, "utf8"));
let written = 0;
for (const row of found) {
  const book = (file.spreads[row.isin] ||= {})[row.mic] ||= {};
  for (const currency of currenciesOf(row)) {
    if (book[currency]?.bp > 0 || book[currency]?.perShare > 0) continue;
    book[currency] = { bp: row.bp, url: row.url };
    written += 1;
  }
}
fs.writeFileSync(STORE, JSON.stringify(file, null, 2));
console.error(`${written} feuilles ajoutées dans spread.json.`);
process.exit(0);
