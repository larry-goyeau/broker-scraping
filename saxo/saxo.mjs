import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: ticker,isin,name and ticker,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      // Fallback: find the first ISIN-looking token in the row.
      for (const col of cols) {
        const isin = toIsin(col);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) =>
    /saxoinvestor|saxotrader|saxobank|saxo\./i.test(candidate.url())
  ) || (await browser.newPage());

if (!/saxoinvestor|saxotrader|saxobank|saxo\./i.test(page.url())) {
  await page.goto("https://www.saxoinvestor.fr/investor/page/portfolio", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to saxo-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();
const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("saxo-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// One fund reaches several venues, and a venue can carry it in more than one
// currency (SIX lists iShares MSCI ACWI in both USD and CHF), so the currency
// belongs in the key that tells two listings apart.
const entryKey = (isin, row) =>
  `${isin}:${row.ticker}:${row.exchange}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin && entry?.ticker) seen.add(entryKey(entry.isin, entry));
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

// The cash instruments an investor account can hold. Leaving this open would
// also return the CFD twin of every listing (AssetType "CfdOnEtf"), which is a
// different product quoted on the same line.
const ASSET_TYPES = "Etf,Etc,Etn,Fund,MutualFund,Stock";

// OpenAPI wants a bearer token and the platform keeps its own only in memory.
// This endpoint mints a fresh one from the session cookies, so being signed in
// is all we need. Tokens expire, hence the refresh on age and on a 401.
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;
let token = "";
let tokenFetchedAt = 0;

async function refreshToken() {
  const answer = await page.evaluate(async () => {
    try {
      const response = await fetch("/api/login/refresh_token?appId=investor", {
        method: "POST",
        credentials: "include",
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 200) };
      }
    } catch (error) {
      return { error: String(error) };
    }
  });

  // The OpenAPI bearer is the id_token; access_token belongs to the login realm.
  token = answer.json?.id_token || "";
  tokenFetchedAt = token ? Date.now() : 0;
  return Boolean(token);
}

async function api(path) {
  if (!token || Date.now() - tokenFetchedAt > TOKEN_MAX_AGE_MS) await refreshToken();

  const request = (bearer) =>
    page.evaluate(
      async (target, auth) => {
        try {
          const response = await fetch(`/openapi${target}`, {
            credentials: "include",
            headers: { authorization: `Bearer ${auth}` },
          });
          const text = await response.text();
          try {
            return { status: response.status, json: JSON.parse(text) };
          } catch {
            return { status: response.status, error: text.slice(0, 200) };
          }
        } catch (error) {
          return { error: String(error) };
        }
      },
      path,
      bearer
    );

  let answer = await request(token);
  if (answer.status === 401 && (await refreshToken())) answer = await request(token);
  return answer;
}

// The lookup the platform's own search box runs. An ISIN is an accepted keyword
// and every listing of the fund comes back in one answer, so no paging is
// needed: no fund is carried on more than a handful of venues.
async function searchIsin(isin) {
  const answer = await api(
    `/ref/v1/instruments?Keywords=${encodeURIComponent(isin)}&$top=100&AssetTypes=${ASSET_TYPES}`
  );
  // A signed-out session is refused rather than answered with an empty list.
  if (!Array.isArray(answer.json?.Data)) return null;

  // The search also matches on name, so it can offer a fund we did not ask
  // about; every listing kept here states the ISIN that was searched for.
  return answer.json.Data.filter(
    (hit) => (hit.Isin || "").toUpperCase() === isin && hit.Identifier
  );
}

// Drop the Keywords and the same endpoint enumerates the whole asset class,
// which is how a long run avoids a search per ISIN. Asked for one asset type at
// a time because paging stops at the end of each.
async function fetchUniverse() {
  const byIsin = new Map();

  for (const assetType of ASSET_TYPES.split(",")) {
    let listings = 0;
    for (let skip = 0; ; skip += 1000) {
      const answer = await api(
        `/ref/v1/instruments?AssetTypes=${assetType}&$top=1000&$skip=${skip}`
      );
      if (!Array.isArray(answer.json?.Data)) {
        throw new Error(
          `Saxo stopped handing over its instrument list (HTTP ${answer.status}). Is the session still signed in?`
        );
      }

      const rows = answer.json.Data;
      for (const row of rows) {
        const isin = (row.Isin || "").toUpperCase();
        if (!isin || !row.Identifier) continue;
        if (!byIsin.has(isin)) byIsin.set(isin, []);
        byIsin.get(isin).push(row);
        listings += 1;
      }

      if (rows.length < 1000 || !answer.json.__next) break;
    }
    console.error(`  ${assetType}: ${listings} listings`);
  }

  return byIsin;
}

// Neither the search nor the listing says whether the account may actually buy
// a line. The details do, and they take 200 instruments per call.
async function readDetails(uics) {
  const details = new Map();

  for (let offset = 0; offset < uics.length; offset += 200) {
    const chunk = uics.slice(offset, offset + 200);
    const answer = await api(
      `/ref/v1/instruments/details?Uics=${chunk.join(",")}&AssetTypes=${ASSET_TYPES}&$top=200`
    );
    for (const row of answer.json?.Data || []) {
      if (row?.Uic) details.set(row.Uic, row);
    }
  }

  return details;
}

// Progress is persisted as the run goes so an interruption keeps prior work.
// Rewriting the whole file after every hit would mean thousands of rewrites of
// a file thousands of entries long, so a crash costs a couple of seconds of
// work instead.
const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

// A search costs a round trip per ISIN, so a long list is cheaper to answer by
// reading the whole universe once (~40 calls) and matching it locally.
const pending = queries.slice(startIndex - 1);
const useUniverse = pending.length >= 200;

let universe = null;
let prefetchedDetails = null;

if (useUniverse) {
  console.error("reading Saxo's instrument list");
  universe = await fetchUniverse();
  console.error(`${universe.size} ISINs listed`);

  // Every line we are going to look at, asked for in as few calls as possible.
  const uics = pending.flatMap((query) =>
    (universe.get(query) || []).map((hit) => hit.Identifier)
  );
  console.error(`reading tradability of ${uics.length} matching listings`);
  prefetchedDetails = await readDetails(uics);
}

console.error(`${queries.length} ISINs to check`);

let silences = 0;

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  let hits;
  if (useUniverse) {
    hits = universe.get(query) || [];
  } else {
    hits = await searchIsin(query);
    if (hits === null) {
      silences += 1;
      console.error("  no answer");
      if (silences >= 5) {
        throw new Error("Saxo stopped answering. Is the session still signed in?");
      }
      continue;
    }
    silences = 0;
  }

  const details =
    prefetchedDetails || (await readDetails(hits.map((hit) => hit.Identifier)));

  for (const hit of hits) {
    // A line whose details never arrived is kept rather than guessed away.
    const detail = details.get(hit.Identifier) || {};

    // Saxo quotes lines it will not let the account buy -- most often a US ETF
    // with no KID, which EU retail rules leave sell-only.
    const reason = detail.NonTradableReason;
    if (detail.IsTradable === false || (reason && reason !== "None")) {
      console.error(`  ${hit.Symbol}: ${reason || "not tradable"} — skipped`);
      continue;
    }

    // Symbol is "<ticker>:<mic>", e.g. "SPYY:xetr".
    const [symbol, mic] = (detail.Symbol || hit.Symbol || "").split(":");
    const row = {
      name: (detail.Description || hit.Description || "").replace(/\s+/g, " ").trim(),
      ticker: (symbol || "").toUpperCase(),
      exchange: detail.Exchange?.ExchangeId || hit.ExchangeId || null,
      exchangeName: detail.Exchange?.Name || hit.ExchangeName || null,
      mic: (mic || "").toLowerCase() || null,
      currency: detail.CurrencyCode || hit.CurrencyCode || null,
      type: (detail.AssetType || hit.AssetType || "").toUpperCase(),
      tradingStatus: detail.TradingStatus || null,
    };
    if (!row.ticker) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      isin: query,
      ...row,
      uic: hit.Identifier,
      raw: [row.ticker, row.name, row.exchange, row.currency].filter(Boolean).join(" "),
    });
  }

  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
