// Public's stock page prints bid and ask with no login. For an OTC
// ticker that is the OTC Markets quote. Listed US tapes stay on the
// NBBO. A missing side, a zero, or a stamp from outside the cash
// session is left out.
//
//   node brokers/public/public_otc_touch.mjs

import fs from "node:fs";
import path from "node:path";
import { catalogueFiles } from "../../catalogues.mjs";

const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const LOCK = new URL("../../spreads/spread.json.lock", import.meta.url);
const PAGE = "https://public.com/stocks";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const OTC = new Set(["OTC", "PINK", "OTCMKTS", "OTCQX", "OTCQB", "PINX", "OTCM", "GREY", "OOTC", "OTHEROTC", "OOTCOTHEROTC"]);
const CONCURRENCY = 6;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > bid)) return null;
  return Math.round((((ask - bid) / ((ask + bid) / 2)) * 1e4) * 100) / 100;
}

function inSession(stamp) {
  const when = new Date(stamp);
  if (Number.isNaN(when.getTime())) return false;
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return date === today && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(get("weekday")) && minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

function jobs() {
  const spreads = JSON.parse(fs.readFileSync(SPREAD, "utf8")).spreads || {};
  const found = new Map();
  for (const file of catalogueFiles()) {
    const broker = path.basename(path.dirname(file));
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const exchange = String(row.exchange || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!OTC.has(exchange)) continue;
      const isin = String(row.isin || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const currency = String(row.currency || "USD").toUpperCase();
      if (currency !== "USD") continue;
      const leaf = spreads[isin]?.OTCM?.USD;
      if (leaf?.bp > 0 || leaf?.perShare) continue;
      const ticker = String(row.ticker || "").toUpperCase();
      const prior = found.get(isin);
      if (!prior) found.set(isin, { isin, ticker, name: row.name || "", public: broker === "public" });
      else if (broker === "public" && ticker) {
        prior.ticker = ticker;
        prior.public = true;
      } else if (!prior.ticker && ticker) prior.ticker = ticker;
    }
  }
  return [...found.values()].filter((job) => job.ticker);
}

async function fiche(ticker) {
  const slug = ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  const url = `${PAGE}/${slug}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return { html: await response.text(), url };
      last = `${response.status}`;
      if (response.status === 429) await sleep(1500 * (attempt + 1));
      else if (response.status >= 500) await sleep(400 * (attempt + 1));
      else return null;
    } catch (error) {
      last = String(error.message || error).slice(0, 80);
      await sleep(400 * (attempt + 1));
    }
  }
  throw new Error(last || "échec");
}

function quoteOf(html, ticker) {
  const match = html.match(/"quote"\s*:\s*\{[^}]+\}/);
  if (!match) return null;
  let quote;
  try {
    quote = JSON.parse(match[0].replace(/^"quote"\s*:\s*/, ""));
  } catch {
    return null;
  }
  if (String(quote.symbol || "").toUpperCase() !== ticker) return null;
  return quote;
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

const todo = jobs();
console.error(`${todo.length} lignes OTC sans carnet`);
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
    const bid = Number(quote?.bid);
    const ask = Number(quote?.ask);
    const bp = quote && inSession(quote.lastUpdated) && !quote.tradingHalted ? bpFrom(bid, ask) : null;
    if (bp == null) skipped += 1;
    else {
      leaves.push({
        isin: job.isin,
        mic: "OTCM",
        currency: "USD",
        bp,
        bid,
        ask,
        ticker: job.ticker,
        url: page.url,
        at: quote.lastUpdated,
      });
    }
    done += 1;
    if (done % 50 === 0 || done === todo.length) {
      console.error(`${done}/${todo.length}, ${leaves.length} carnets, ${skipped} laissés`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, () => worker()));
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

const file = JSON.parse(fs.readFileSync(SPREAD, "utf8"));
let added = 0;
for (const leaf of leaves) {
  const book = ((file.spreads[leaf.isin] ||= {})[leaf.mic] ||= {});
  if (book[leaf.currency]?.bp > 0 || book[leaf.currency]?.perShare) continue;
  book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
  added += 1;
}
if (added) {
  file.generatedAt = new Date().toISOString();
  const tmp = `${SPREAD.pathname}.public-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
}
console.error(`${added} carnets écrits`);
for (const leaf of leaves.slice(0, 6)) {
  console.error(`${leaf.ticker} ${leaf.bid}/${leaf.ask} bp ${leaf.bp} ${leaf.isin}`);
}
