// What Zesty publishes as its catalogue, with no login. One Algolia index,
// the same one the dividends page searches. A line is kept when it is
// active and not marked untradable. Chilean shares leave `tradable` empty
// and stay. A warrant or a closed name marked `tradable: false` is left
// out, and so is an inactive line. The help page says a missing name can
// be added within a day, so this file is the public list, not a promise
// that nothing else can be bought.
//
// Zesty writes NASDAQ, NYSE, ARCA, AMEX, BATS and OTC. Those are stored as
// the MICs the venue list already knows. AMEX here is NYSE American: a bare
// "AMEX" would be read as Arca. Santiago is `BCS`, which that list does not
// name. Coins are `ETH/USD` and the like, kept as the base, in dollars.
//
// Zesty prints no ISIN. The stock and ETF lists supply it, matched on the
// ticker and the place. One candidate on that place is taken. Several need
// a name, and a tie goes to the ISIN the lists repeat on the most venues:
// that is the current line, not the old CUSIP filed beside it.
//
//   https://dividends.zestyfinance.com/
//   https://help.zestyfinance.com/es/articles/15937643-en-que-puedo-invertir-en-zesty
//
//   node brokers/zesty/zesty_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const APP = "YL9L52U78A";
const KEY = "d5effff70ed6ce7c2d669fec1bf29a5e";
const INDEX = "assets";
const QUERY = `https://${APP}-dsn.algolia.net/1/indexes/${INDEX}/query`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// Zesty's label, then the code stored on the row.
const VENUES = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  ARCA: "ARCX",
  AMEX: "XASE",
  BATS: "BATS",
  OTC: "OTCM",
  BCS: "BCS",
  CRYPTO: "CRYPTO",
};

// What the lists call the same place.
const CSV_VENUES = {
  XNAS: ["NASDAQ"],
  XNYS: ["NYSE"],
  ARCX: ["AMEX"],
  XASE: ["AMEX"],
  BATS: ["CBOE", "AMEX"],
  OTCM: ["OTC"],
  BCS: ["BCS"],
};

const US_LISTED = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE"]);

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH",
  "THE", "CO", "TRUST", "ETF", "SHARES", "CLASS", "COMMON", "STOCK",
]);

const PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function listTicker(value) {
  const text = String(value || "").trim().toUpperCase().split(":").pop();
  const preferred = text.match(/^([A-Z0-9]+)\/P([A-Z])$/);
  if (preferred) return `${preferred[1]}.PR${preferred[2]}`;
  return text;
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
    const name = columns.slice(3).join(",").trim();
    const bucket = into.get(ticker) || [];
    const existing = bucket.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
      if (name && !existing.names.includes(name)) existing.names.push(name);
    } else {
      bucket.push({
        isin,
        names: name ? [name] : [],
        exchanges: new Set(exchange ? [exchange] : []),
      });
      into.set(ticker, bucket);
    }
  }
  return into;
}

function pickIsin(rows, name, minScore, acceptSole) {
  if (rows.length === 0) return "";
  const isins = [...new Set(rows.map((row) => row.isin))];
  if (acceptSole && isins.length === 1) return isins[0];
  const scored = rows.map((row) => ({
    isin: row.isin,
    venues: row.exchanges.size,
    score: Math.max(0, ...row.names.map((candidate) => nameScore(name, candidate))),
  }));
  const best = Math.max(...scored.map((row) => row.score));
  if (!(best >= minScore)) return "";
  const byIsin = new Map();
  for (const row of scored) {
    if (row.score !== best) continue;
    const prev = byIsin.get(row.isin);
    if (!prev || row.venues > prev.venues) byIsin.set(row.isin, row);
  }
  const winners = [...byIsin.values()];
  if (winners.length === 1) return winners[0].isin;
  const most = Math.max(...winners.map((row) => row.venues));
  const popular = winners.filter((row) => row.venues === most);
  return popular.length === 1 ? popular[0].isin : "";
}

function venueGroups(index, ticker, place) {
  const key = place === "BCS" ? ticker.replace(/-/g, "_") : ticker;
  const candidates = index.get(key) || index.get(ticker) || [];
  const allowed = new Set(CSV_VENUES[place] || []);
  const groups = new Map();
  for (const row of candidates) {
    for (const exchange of row.exchanges) {
      if (!allowed.has(exchange)) continue;
      if (!groups.has(exchange)) groups.set(exchange, new Set());
      groups.get(exchange).add(row.isin);
    }
  }
  return groups;
}

function resolveIsin(index, ticker, name, place) {
  // Santiago writes SQM-B. The lists write SQM_B.
  const key = place === "BCS" ? ticker.replace(/-/g, "_") : ticker;
  const candidates = index.get(key) || index.get(ticker) || [];
  const allowed = new Set(CSV_VENUES[place] || []);
  const sameVenue = candidates.filter((row) => [...row.exchanges].some((exchange) => allowed.has(exchange)));
  const onVenue = pickIsin(sameVenue, name, 0.5, true);
  if (onVenue) return onVenue;
  if (place === "BCS" || place === "CRYPTO") return "";
  const american = candidates.filter((row) => [...row.exchanges].some((exchange) => US_LISTED.has(exchange)));
  return pickIsin(american, name, 0.8, false);
}

// A few live shares and ETFs arrive with no assetType. The name still says
// which they are. A blank name with no type is not kept.
function kindOf(hit) {
  if (hit.assetType === "ETF") return "ETF";
  if (hit.assetType === "Stock") return "STOCK";
  const name = String(hit.name || "");
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name)) return "ETF";
  if (name.trim()) return "STOCK";
  return "";
}

async function postJson(body) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(QUERY, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Algolia-Application-Id": APP,
          "X-Algolia-API-Key": KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${QUERY}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function listedOn(exchange, prefix) {
  const body = await postJson({
    query: prefix,
    restrictSearchableAttributes: ["symbol"],
    filters: `exchange:${exchange}`,
    hitsPerPage: 1000,
    attributesToRetrieve: ["symbol", "name", "exchange", "assetType", "status", "tradable"],
  });
  if ((body.nbHits || 0) > 1000) {
    throw new Error(`Zesty ${exchange} ${prefix} returned ${body.nbHits}; the page is capped at 1000`);
  }
  return body.hits || [];
}

const isins = loadIsins(new URL("../../assets/etfs.csv", import.meta.url), new Map());
loadIsins(new URL("../../assets/stocks.csv", import.meta.url), isins);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

const total = await postJson({ query: "", hitsPerPage: 0 });
console.error(`Index ${total.nbHits}. Lecture…`);

for (const exchange of Object.keys(VENUES)) {
  const prefixes = exchange === "CRYPTO" || exchange === "BCS" || exchange === "AMEX" ? [""] : PREFIXES;
  for (const prefix of prefixes) {
    for (const hit of await listedOn(exchange, prefix)) {
      if (hit.tradable === false) {
        skip("not tradable");
        continue;
      }
      if (hit.status && hit.status !== "active") {
        skip(hit.status);
        continue;
      }
      const place = VENUES[exchange];
      const rawSymbol = String(hit.symbol || "").trim().toUpperCase();
      if (!rawSymbol) {
        skip("no ticker");
        continue;
      }
      const crypto = place === "CRYPTO";
      const [base, quote] = crypto ? rawSymbol.split("/") : [rawSymbol, ""];
      const ticker = crypto ? base : rawSymbol;
      const currency = crypto ? quote || "USD" : place === "BCS" ? "CLP" : "USD";
      if (!ticker || (crypto && currency !== "USD")) {
        skip(crypto ? "not a dollar coin" : "no ticker");
        continue;
      }
      const type = crypto ? "CRYPTO" : kindOf(hit);
      if (!type) {
        skip(hit.assetType || "unknown type");
        continue;
      }
      const name = String(hit.name || "").replace(/\s+/g, " ").trim() || ticker;
      const isin = crypto ? "" : resolveIsin(isins, ticker, name, place);
      const id = crypto ? `${ticker}:CRYPTO:${currency}:CRYPTO` : `${isin || ticker}:${place}:${currency}:${type}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const line = {
        query: ticker,
        ticker,
        name,
        exchange: place,
        currency,
        type,
        raw: [rawSymbol, name, place, currency, isin].filter(Boolean).join(" "),
        isin,
      };
      if (!crypto && !isin) stampIsinMatches(line, venueGroups(isins, ticker, place), ticker);
      results.push(line);
    }
  }
  console.error(`${exchange} fait`);
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker) || left.currency.localeCompare(right.currency);
});

fs.writeFileSync(
  new URL("zesty-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const equities = results.filter((row) => row.type !== "CRYPTO");
const named = equities.filter((row) => row.isin).length;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, ISIN on ${named} of ${equities.length} stocks and ETFs` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "") +
    (total.nbHits && results.length + (skipped.get("not tradable") || 0) + (skipped.get("inactive") || 0) < total.nbHits
      ? `, index ${total.nbHits}`
      : "")
);
