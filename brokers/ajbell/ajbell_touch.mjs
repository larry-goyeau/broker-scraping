// AJ Bell's screener prints bid and ask with no login. London, Aquis and
// Chi-X are that venue's book. A CDI is stored under CDI plus the
// underlying MIC, and only while that market is open. The foreign book
// and the American NBBO are left as they are.
//
//   node brokers/ajbell/ajbell_touch.mjs

import fs from "node:fs";
import { sessionState, VENUES } from "../../spreads/venues.mjs";

const HOME = new Map(VENUES.map((venue) => [venue.mic, venue]));

const SCREEN = "https://www.ajbell.co.uk/market-research/api/screener";
const CATALOGUE = new URL("ajbell-parsed.json", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const LOCK = new URL("../../spreads/spread.json.lock", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const MIC = { XLON: "XLON", LSE: "XLON", AQSE: "AQSE", CHIX: "CHIX" };
const PAGE = "https://www.ajbell.co.uk/market-research/screener";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function twinOf(currency) {
  if (currency === "GBP") return "GBX";
  if (currency === "GBX") return "GBP";
  return "";
}

function londonOpen() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day) && minutes >= 8 * 60 && minutes <= 16 * 60 + 30;
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > bid)) return null;
  return Math.round((((ask - bid) / ((ask + bid) / 2)) * 1e4) * 100) / 100;
}

function needed() {
  const parsed = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  const spreads = JSON.parse(fs.readFileSync(SPREAD, "utf8")).spreads || {};
  const want = new Map();
  for (const row of rows) {
    const mic = MIC[String(row.exchange || "").toUpperCase()];
    if (!mic) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!isin || !currency) continue;
    const book = spreads[isin]?.[mic] || {};
    const twin = twinOf(currency);
    if (book[currency]?.bp > 0 || book[currency]?.perShare) continue;
    if (twin && (book[twin]?.bp > 0 || book[twin]?.perShare)) continue;
    const key = `${isin}|${mic}`;
    const set = want.get(key) || new Set();
    set.add(currency);
    want.set(key, set);
  }
  for (const row of rows) {
    const underlying = String(row.exchange || "").match(/^CDI\s+([A-Z0-9]+)$/i)?.[1].toUpperCase();
    const home = underlying ? HOME.get(underlying) : null;
    if (!home || !sessionState(home).open) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!isin || !currency) continue;
    const mic = `CDI${underlying}`;
    const book = spreads[isin]?.[mic] || {};
    if (book[currency]?.bp > 0 || book[currency]?.perShare) continue;
    const key = `${isin}|${mic}`;
    const set = want.get(key) || new Set();
    set.add(currency);
    want.set(key, set);
  }
  return want;
}

async function shelf(screenerType) {
  const rows = [];
  // A page of 2 000 drops the bid and the ask. 200 keeps them.
  for (let page = 1; page < 120; page += 1) {
    let body = null;
    let last = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(SCREEN, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: "https://www.ajbell.co.uk",
          },
          body: JSON.stringify({
            screenerType,
            rowsPerPage: 200,
            currentPage: page,
            search: "",
            sortOrder: "Name asc",
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) {
          body = await response.json();
          break;
        }
        last = `${response.status}`;
        if (response.status === 429) await sleep(1500 * (attempt + 1));
        else if (response.status >= 500) await sleep(400 * (attempt + 1));
        else break;
      } catch (error) {
        last = String(error.message || error).slice(0, 80);
        await sleep(400 * (attempt + 1));
      }
    }
    if (!body) throw new Error(`${screenerType} page ${page}: ${last || "échec"}`);
    const batch = Array.isArray(body.rows) ? body.rows : [];
    rows.push(...batch);
    if (page % 10 === 0) console.error(`${screenerType} ${rows.length}/${body.total}`);
    if (!batch.length || rows.length >= body.total) break;
  }
  return rows;
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

if (!londonOpen()) {
  console.error("Londres est fermé");
  process.exit(0);
}

const want = needed();
console.error(`${want.size} titres sans carnet sur Londres, Aquis ou Chi-X`);
const leaves = [];
const seen = new Set();
for (const screenerType of ["Equity", "ETF"]) {
  const rows = await shelf(screenerType);
  console.error(`${rows.length} lignes ${screenerType}`);
  for (const row of rows) {
    const rawMic = String(row.MIC || "").toUpperCase();
    const homeMic = MIC[rawMic];
    const homeVenue = HOME.get(rawMic);
    const targets = [];
    if (homeMic) targets.push(homeMic);
    if (homeVenue && sessionState(homeVenue).open) targets.push(`CDI${rawMic}`);
    if (!targets.length) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const twin = twinOf(currency);
    const mic = targets.find((candidate) => {
      const missing = want.get(`${isin}|${candidate}`);
      if (!missing) return false;
      if (candidate.startsWith("CDI")) return missing.has(currency);
      return missing.has(currency) || (twin && missing.has(twin));
    });
    if (!mic) continue;
    const bid = Number(row["Intraday.Bid"]);
    const ask = Number(row["Intraday.Ask"]);
    const bp = bpFrom(bid, ask);
    if (bp == null) continue;
    const id = `${isin}|${mic}|${currency}`;
    if (seen.has(id)) continue;
    seen.add(id);
    leaves.push({
      isin,
      mic,
      currency,
      bp,
      bid,
      ask,
      ticker: row.Symbol,
      name: row.name,
      url: `${PAGE}/${screenerType === "ETF" ? "etf" : "shares"}`,
    });
  }
}
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
  const twin = twinOf(leaf.currency);
  if (book[leaf.currency]?.bp > 0 || book[leaf.currency]?.perShare) continue;
  if (twin && (book[twin]?.bp > 0 || book[twin]?.perShare)) continue;
  book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
  added += 1;
}
if (added) {
  file.generatedAt = new Date().toISOString();
  const tmp = `${SPREAD.pathname}.ajbell-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
}
console.error(`${added} carnets écrits`);
for (const leaf of leaves.slice(0, 6)) {
  console.error(`${leaf.mic} ${leaf.ticker} ${leaf.currency} ${leaf.bid}/${leaf.ask} bp ${leaf.bp} ${leaf.isin}`);
}
