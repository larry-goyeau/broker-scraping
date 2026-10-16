// Kraken prints bid and ask with no login.
// An xStock fiche shows the underlying share's touch. That book is stored
// under XSTK, never on the US tape. A coin's dollar book is the public
// ticker, stored under KRKN.
//
//   node brokers/kraken/kraken_touch.mjs

import fs from "node:fs";

const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const PRICES = new URL("../../assets/prices.json", import.meta.url);
const LOCK = new URL("../../spreads/spread.json.lock", import.meta.url);
const CATALOGUE = new URL("kraken-parsed.json", import.meta.url);
const PAIRS = "https://api.kraken.com/0/public/AssetPairs";
const TICKER = "https://api.kraken.com/0/public/Ticker";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BASE = { XBT: "BTC", XXBT: "BTC", XDG: "DOGE", XXDG: "DOGE" };
const CONCURRENCY = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > bid) || ask / bid > 20) return null;
  return Math.round((((ask - bid) / ((ask + bid) / 2)) * 1e4) * 100) / 100;
}

function nyParts(when) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function inCash(stamp) {
  const when = new Date(stamp);
  if (Number.isNaN(when.getTime())) return false;
  const now = nyParts(new Date());
  const then = nyParts(when);
  return then.date === now.date && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(then.weekday) && then.minutes >= 9 * 60 + 30 && then.minutes <= 16 * 60;
}

function rows() {
  const parsed = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.rows || [];
}

function xstockJobs(spreads) {
  const jobs = [];
  const seen = new Set();
  for (const row of rows()) {
    if (row.xstock !== true && String(row.exchange || "").toLowerCase() !== "xstock") continue;
    const isin = String(row.isin || "").toUpperCase();
    const ticker = String(row.ticker || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !ticker || seen.has(isin)) continue;
    seen.add(isin);
    if (spreads[isin]?.XSTK?.USD?.bp > 0) continue;
    jobs.push({ isin, ticker, name: row.name || "" });
  }
  return jobs;
}

function quoteOf(html, ticker) {
  const found = [];
  const re = /"([A-Z0-9.]+)":\{"time":(\d+),"ask":"([0-9.]+)","ask_size":"[0-9.]+","bid":"([0-9.]+)"[^}]*?"status":"([^"]+)"[^}]*?"delayed":(true|false)/g;
  let match;
  while ((match = re.exec(html))) {
    found.push({
      symbol: match[1],
      time: Number(match[2]),
      ask: Number(match[3]),
      bid: Number(match[4]),
      status: match[5],
      delayed: match[6] === "true",
      extended: /"ext_trd_hrs":true/.test(match[0]),
    });
  }
  const underlying = ticker.endsWith("X") ? ticker.slice(0, -1) : "";
  return found.find((q) => q.symbol === ticker || (underlying && q.symbol === underlying)) || null;
}

async function fiche(ticker) {
  const url = `https://www.kraken.com/xstocks/${ticker.toLowerCase()}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return { html: await response.text(), url };
      last = `${response.status}`;
      if (response.status === 429 || response.status >= 500) await sleep(8000 * (attempt + 1));
      else return null;
    } catch (error) {
      last = String(error.message || error).slice(0, 80);
      await sleep(400 * (attempt + 1));
    }
  }
  throw new Error(last || "échec");
}

async function xstockLeaves(spreads) {
  const todo = xstockJobs(spreads);
  console.error(`${todo.length} xStocks`);
  const leaves = [];
  let cursor = 0;
  let done = 0;
  let skipped = 0;
  async function worker() {
    while (cursor < todo.length) {
      const job = todo[cursor];
      cursor += 1;
      let page = null;
      try {
        page = await fiche(job.ticker);
      } catch (error) {
        console.error(`${job.ticker} ${error.message}`);
      }
      const quote = page ? quoteOf(page.html, job.ticker) : null;
      const bp = quote && quote.status === "active" && !quote.extended && inCash(quote.time) ? bpFrom(quote.bid, quote.ask) : null;
      if (bp == null) skipped += 1;
      else {
        leaves.push({
          isin: job.isin,
          mic: "XSTK",
          currency: "USD",
          bp,
          bid: quote.bid,
          ask: quote.ask,
          mid: (quote.bid + quote.ask) / 2,
          ticker: job.ticker,
          url: page.url,
        });
      }
      done += 1;
      await sleep(1500);
      if (done % 25 === 0 || done === todo.length) console.error(`${done}/${todo.length}, ${leaves.length} carnets, ${skipped} laissés`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, () => worker()));
  return leaves;
}

function krakenBase(wsname, base) {
  const raw = String(wsname || "").split("/")[0] || String(base || "");
  const u = raw.toUpperCase();
  return BASE[u] || u;
}

async function coinLeaves(spreads) {
  const wanted = new Set();
  for (const row of rows()) {
    if (row.type !== "CRYPTO" && String(row.exchange || "").toUpperCase() !== "CRYPTO") continue;
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker || spreads[`CRYPTO:${ticker}`]?.KRKN?.USD?.bp > 0) continue;
    wanted.add(ticker);
  }
  const pairs = (await (await fetch(PAIRS, { signal: AbortSignal.timeout(60_000) })).json()).result || {};
  const usd = new Map();
  for (const [id, pair] of Object.entries(pairs)) {
    const quote = String(pair.wsname || "").split("/")[1] || "";
    if (quote !== "USD") continue;
    const base = krakenBase(pair.wsname, pair.base);
    if (base && wanted.has(base) && !usd.has(base)) usd.set(base, { id, alt: pair.altname || id });
  }
  const alts = [...usd.entries()];
  console.error(`${alts.length} coins with a USD pair, of ${wanted.size}`);
  const leaves = [];
  for (let i = 0; i < alts.length; i += 40) {
    const chunk = alts.slice(i, i + 40);
    const body = await (
      await fetch(`${TICKER}?pair=${chunk.map(([, pair]) => pair.alt).join(",")}`, { signal: AbortSignal.timeout(30_000) })
    ).json();
    const tickers = body.result || {};
    for (const [id, q] of Object.entries(tickers)) {
      const bid = Number(q.b?.[0]);
      const ask = Number(q.a?.[0]);
      const bp = bpFrom(bid, ask);
      const base = chunk.find(([, pair]) => pair.id === id || pair.alt === id)?.[0];
      if (!base || bp == null) continue;
      leaves.push({
        isin: `CRYPTO:${base}`,
        mic: "KRKN",
        currency: "USD",
        bp,
        bid,
        ask,
        ticker: base,
        url: `https://api.kraken.com/0/public/Ticker?pair=${id}`,
      });
    }
  }
  console.error(`${leaves.length} coin books`);
  return leaves;
}

function lockHeld() {
  if (!fs.existsSync(LOCK)) return false;
  try {
    process.kill(JSON.parse(fs.readFileSync(LOCK, "utf8")).pid, 0);
    return true;
  } catch {
    return false;
  }
}

const ny = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
}).format(new Date());
console.error(`New York ${ny}`);

const stored = JSON.parse(fs.readFileSync(SPREAD, "utf8")).spreads || {};
const [xstocks, coins] = await Promise.all([xstockLeaves(stored), coinLeaves(stored)]);
const leaves = [...xstocks, ...coins];
console.error(`${leaves.length} carnets à écrire`);
if (!leaves.length) process.exit(0);

for (let attempt = 0; attempt < 40 && lockHeld(); attempt += 1) {
  console.error("un autre passage écrit le fichier partagé");
  await sleep(15_000);
}
if (lockHeld()) {
  console.error("fichier partagé occupé");
  process.exit(1);
}
fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
const unlock = () => {
  try {
    if (JSON.parse(fs.readFileSync(LOCK, "utf8")).pid === process.pid) fs.unlinkSync(LOCK);
  } catch {}
};
process.on("exit", unlock);

const file = JSON.parse(fs.readFileSync(SPREAD, "utf8"));
let added = 0;
let refreshed = 0;
for (const leaf of leaves) {
  const book = ((file.spreads[leaf.isin] ||= {})[leaf.mic] ||= {});
  const prior = book[leaf.currency];
  if (prior?.bp === leaf.bp && prior?.url === leaf.url) continue;
  if (prior?.bp > 0 || prior?.perShare) refreshed += 1;
  else added += 1;
  book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
}
file.generatedAt = new Date().toISOString();
const tmp = `${SPREAD.pathname}.kraken-tmp`;
fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
fs.renameSync(tmp, SPREAD.pathname);
console.error(`${added} nouveaux, ${refreshed} repris`);

const prices = JSON.parse(fs.readFileSync(PRICES, "utf8"));
const day = new Date().toISOString().slice(0, 10);
let priced = 0;
for (const leaf of xstocks) {
  const slot = (prices.prices[leaf.isin] ||= {});
  if (Number(slot.USD?.price) > 0) continue;
  slot.USD = {
    price: Number(leaf.mid.toFixed(6)),
    at: day,
    from: { [`XSTK:${leaf.ticker}`]: { price: Number(leaf.mid.toFixed(6)), at: day, primary: true } },
  };
  priced += 1;
}
if (priced) {
  prices.generatedAt = new Date().toISOString();
  const priceTmp = `${PRICES.pathname}.kraken-tmp`;
  fs.writeFileSync(priceTmp, JSON.stringify(prices, null, 2));
  fs.renameSync(priceTmp, PRICES.pathname);
}
console.error(`${priced} prix ajoutés`);
for (const leaf of xstocks.slice(0, 4)) console.error(`${leaf.ticker} ${leaf.bid}/${leaf.ask} bp ${leaf.bp} ${leaf.isin}`);
const btc = coins.find((leaf) => leaf.ticker === "BTC");
if (btc) console.error(`BTC ${btc.bid}/${btc.ask} bp ${btc.bp}`);
