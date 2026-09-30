// Official BSE cash touch, and the NSE book only while it is being read.
// Bid and ask come from the exchange's own book: quote-equity on the NSE,
// MarketDepth on the BSE. A last trade is never written in their place. One
// side missing, or a crossed book, leaves the line out. The NSE figures are
// not written: the round trip on file is the six-month impact cost.
//
// The cash session is 9:15–15:30 Mumbai time, Monday to Friday. Past the close
// the script stops asking, so a late run cannot file the closing print as a touch.
//
//   node india-touch.mjs
//   node india-touch.mjs --jobs=12

import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { debtIsin, isinOf, isInav, keepSold, rootOf } from "./indianCash.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const UPSTOX = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const STORE = "parsed_json/spread.json";
const JOBS = Math.max(1, Number((process.argv.find((a) => a.startsWith("--jobs=")) || "").slice(7) || 8));
const CLOSE = 15 * 60 + 30;

const mumbai = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const weekday = parts.weekday;
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) && minutes >= 9 * 60 + 15 && minutes <= CLOSE;
  return { weekday, minutes, open, clock: `${parts.hour}:${parts.minute}` };
};

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

// Round trip at the touch, in basis points. A locked or crossed book is not a cost.
const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const nseTouch = (body) => {
  const book = body?.marketDeptOrderBook || {};
  const bid = num(book.bid?.[0]?.price);
  const ask = num(book.ask?.[0]?.price);
  return { bid, ask, bp: bpFrom(bid, ask) };
};

const bseTouch = (body) => {
  const bid = num(body?.BPrice1);
  const ask = num(body?.SPrice1);
  return { bid, ask, bp: bpFrom(bid, ask) };
};

async function cashNames() {
  const response = await fetch(UPSTOX);
  if (!response.ok) throw new Error(`Upstox a répondu ${response.status}`);
  const rows = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
  const nse = new Map();
  const bse = new Map();
  for (const row of rows) {
    if (row.segment !== "NSE_EQ" && row.segment !== "BSE_EQ") continue;
    const isin = isinOf(row.isin);
    if (!isin || debtIsin(isin) || isInav(row.trading_symbol)) continue;
    const series = String(row.instrument_type || "").toUpperCase();
    const etf = series === "ETF" || isin.startsWith("INF");
    if (!keepSold(row.exchange, series, row.trading_symbol, isin, etf)) continue;
    const symbol = rootOf(row.trading_symbol);
    if (row.segment === "NSE_EQ") {
      if (!nse.has(symbol)) nse.set(symbol, { isin, symbol });
    } else {
      const code = String(row.exchange_token || "").replace(/\D/g, "");
      if (code && !bse.has(code)) bse.set(code, { isin, symbol, code });
    }
  }
  return { nse: [...nse.values()], bse: [...bse.values()] };
}

const sessionOver = () => !mumbai().open;

async function pull(page, url) {
  if (sessionOver()) return null;
  try {
    return await page.evaluate(async (url) => {
      // The page's own calls are XHR. fetch() is refused by the exchange edge.
      return await new Promise((resolve) => {
        const req = new XMLHttpRequest();
        req.open("GET", url);
        req.onload = () => resolve({ status: req.status, text: req.responseText });
        req.onerror = () => resolve(null);
        req.send();
      });
    }, url);
  } catch {
    return null;
  }
}

async function pool(items, n, fn) {
  const queue = items[Symbol.iterator]();
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (const item of queue) {
        if (sessionOver()) return;
        await fn(item);
      }
    })
  );
}

const found = [];

async function readNse(page, row) {
  const got = await pull(page, `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(row.symbol)}`);
  if (!got || got.status !== 200) return;
  let body;
  try { body = JSON.parse(got.text); } catch { return; }
  const touch = nseTouch(body);
  if (touch.bp == null) return;
  found.push({
    isin: row.isin,
    mic: "XNSE",
    bp: touch.bp,
    url: `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(row.symbol)}`,
  });
}

async function readBse(page, row) {
  const got = await pull(
    page,
    `https://api.bseindia.com/RealTimeBseIndiaAPI/api/MarketDepth/w?flag=&quotetype=EQ&scripcode=${row.code}`
  );
  if (!got || got.status !== 200) return;
  let body;
  try { body = JSON.parse(got.text); } catch { return; }
  const touch = bseTouch(body);
  if (touch.bp == null) return;
  found.push({
    isin: row.isin,
    mic: "XBOM",
    bp: touch.bp,
    url: `https://api.bseindia.com/RealTimeBseIndiaAPI/api/MarketDepth/w?flag=&quotetype=EQ&scripcode=${row.code}`,
  });
}

function merge() {
  const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : {};
  const spreads = (store.spreads ||= {});
  const state = (store.state ||= {});
  const at = new Date().toISOString();
  let written = 0;
  for (const row of found) {
    // NSE round trips use the six-month impact cost written by spread.mjs.
    // A session touch must not replace that average.
    if (row.mic === "XNSE") continue;
    const byMic = (spreads[row.isin] ||= {});
    const byCcy = (byMic[row.mic] ||= {});
    const prev = state[`${row.isin}|${row.mic}|INR`] || {};
    const readings = [...(prev.bp || []), row.bp].slice(-24);
    byCcy.INR = { bp: readings.length === 1 ? row.bp : Number((median(readings)).toFixed(2)), url: row.url };
    state[`${row.isin}|${row.mic}|INR`] = { bp: readings, at };
    written += 1;
  }
  store.generatedAt = at;
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  return written;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const clock = mumbai();
if (!clock.open) {
  console.error(`Séance cash fermée à Mumbai (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}

console.error(`Mumbai ${clock.clock}. Liste des actions et ETF, et ouverture des pages…`);
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const nsePage = await browser.newPage();
const bsePage = await browser.newPage();
const namesP = cashNames();
const nseReady = nsePage
  .goto("https://www.nseindia.com/get-quote/equity/RELIANCE", { waitUntil: "domcontentloaded", timeout: 20000 })
  .catch((e) => console.error(`NSE page : ${e.message}`));
const bseReady = bsePage
  .goto("https://www.bseindia.com/stock-share-price/reliance-industries-ltd/reliance/500325/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  })
  .catch((e) => console.error(`BSE page : ${e.message}`));
const { nse, bse } = await namesP;
console.error(`${nse.length} NSE, ${bse.length} BSE. ${JOBS} en parallèle, arrêt à 15:30.`);

let asked = 0;
const tick = () => {
  asked += 1;
  if (asked % 100 === 0) console.error(`${asked} demandés, ${found.length} touches, Mumbai ${mumbai().clock}`);
};

await Promise.all([
  nseReady.then(() => pool(nse, JOBS, async (row) => { tick(); await readNse(nsePage, row); })),
  bseReady.then(() => pool(bse, JOBS, async (row) => { tick(); await readBse(bsePage, row); })),
]);

await nsePage.close().catch(() => {});
await bsePage.close().catch(() => {});
await browser.disconnect();

if (!found.length) {
  console.error(`Aucune touche retenue (Mumbai ${mumbai().clock}). Le carnet n'est pas modifié.`);
  process.exit(0);
}
const written = merge();
console.error(`${written} touches écrites dans ${STORE}. Mumbai ${mumbai().clock}.`);
