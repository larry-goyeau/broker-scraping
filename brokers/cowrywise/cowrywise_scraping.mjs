// What Cowrywise sells on the Nigerian Exchange, with no login. The public
// stock list, and the public offers beside it. An index row is a market
// level, not a share, and is left out. The list has no ETF.
//
// Cowrywise prints no ISIN. The stock list supplies it when the Lagos
// ticker has one.
//
//   https://dashboard.cowrywise.com/api/v2/stocks/public/
//   https://dashboard.cowrywise.com/api/v2/stocks/public/offers
//   https://cowrywise.com/stocks
//
//   node brokers/cowrywise/cowrywise_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const STOCKS = "https://dashboard.cowrywise.com/api/v2/stocks/public/";
const OFFERS = "https://dashboard.cowrywise.com/api/v2/stocks/public/offers";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const PLACE = "NSENG";

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "COMPANY", "HOLDING",
  "HOLDINGS", "GROUP", "THE", "CO", "TRUST",
]);

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function listTicker(value) {
  return String(value || "").trim().toUpperCase().split(":").pop();
}

function nameTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scraped, candidate) {
  const left = nameTokens(scraped);
  const right = nameTokens(candidate);
  if (left.length === 0 || right.length === 0) return 0;
  const used = new Set();
  let matched = 0;
  for (const token of left) {
    const index = right.findIndex((other, position) => !used.has(position) && tokensMatch(token, other));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(left.length, right.length);
}

function loadIsins(csvPath, into) {
  if (!fs.existsSync(csvPath)) return into;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = listTicker(columns[0]);
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    if (!ticker || !isin) continue;
    const exchange = String(columns[1] || "").trim().toUpperCase();
    if (exchange !== PLACE) continue;
    const name = columns.slice(3).join(",").trim();
    const bucket = into.get(ticker) || [];
    const existing = bucket.find((row) => row.isin === isin);
    if (existing) {
      if (name && !existing.names.includes(name)) existing.names.push(name);
    } else {
      bucket.push({ isin, names: name ? [name] : [] });
      into.set(ticker, bucket);
    }
  }
  return into;
}

function lagos(index, ticker, name) {
  const rows = index.get(ticker) || [];
  const isins = [...new Set(rows.map((row) => row.isin))];
  if (isins.length === 1) return isins[0];
  if (isins.length === 0) return "";
  const scored = rows.map((row) => ({
    isin: row.isin,
    score: Math.max(0, ...row.names.map((candidate) => nameScore(name, candidate))),
  }));
  const best = Math.max(...scored.map((row) => row.score));
  const winners = [...new Set(scored.filter((row) => row.score === best && row.score >= 0.5).map((row) => row.isin))];
  return winners.length === 1 ? winners[0] : "";
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function openOffer(row, now) {
  if (String(row.status || "").toUpperCase() !== "ACTIVE") return false;
  const end = Date.parse(row.end_date || "");
  return !Number.isFinite(end) || end > now;
}

const isins = loadIsins(new URL("../../assets/etfs.csv", import.meta.url), new Map());
loadIsins(new URL("../../assets/stocks.csv", import.meta.url), isins);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

function add({ ticker, name }) {
  const id = `${ticker}:NSENG`;
  if (seen.has(id)) return;
  seen.add(id);
  const isin = lagos(isins, ticker, name);
  results.push({
    query: ticker,
    ticker,
    name,
    exchange: PLACE,
    currency: "NGN",
    type: "STOCK",
    raw: [ticker, name, PLACE, "NGN", isin].filter(Boolean).join(" "),
    isin,
  });
}

const stocks = await getJson(STOCKS);
const stockRows = stocks?.data;
if (!Array.isArray(stockRows)) throw new Error("Cowrywise stocks/public returned no list");
for (const row of stockRows) {
  const ticker = String(row.symbol || "").trim().toUpperCase();
  if (!ticker) {
    skip("no symbol");
    continue;
  }
  if (row.is_index) {
    skip("index");
    continue;
  }
  add({ ticker, name: String(row.name || ticker).replace(/\s+/g, " ").trim() });
}

const offers = await getJson(OFFERS);
const offerRows = offers?.data;
if (!Array.isArray(offerRows)) throw new Error("Cowrywise stocks/public/offers returned no list");
const now = Date.now();
for (const row of offerRows) {
  if (!openOffer(row, now)) {
    skip("closed offer");
    continue;
  }
  const ticker = String(row.symbol || row.code || "").trim().toUpperCase();
  if (!ticker) {
    skip("offer without a code");
    continue;
  }
  add({ ticker, name: String(row.name || ticker).replace(/\s+/g, " ").trim() });
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker, "en"));

fs.writeFileSync(
  new URL("cowrywise-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const named = results.filter((row) => row.isin).length;
console.error(
  `${results.length} listings, ISIN on ${named} of ${results.length}` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
