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
      // Supports both: symbol,isin,name and symbol,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

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
  pages.find((candidate) => candidate.url().includes("app.trading212.com")) ||
  (await browser.newPage());

if (!page.url().includes("app.trading212.com")) {
  await page.goto("https://app.trading212.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to trading212-parsed.json. It counts
// against the order the catalogue came in, so a resume is only exact for as
// long as Trading212's own list has not moved underneath it.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();

function flagValue(name) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// `--csv=PATH` and `--stocks-csv=PATH` narrow a run to the ISINs those files
// name. Left alone it answers for the whole catalogue, which is the honest
// default here: Trading212 hands over every line it will show this account with
// the ISIN, name, venue and currency already on it, so a list of our own can
// only leave things out, never add. `--etfs-only` and `--stocks-only` split the
// answer by what Trading212 itself calls each line.
const listPaths = ["csv", "stocks-csv"].map(flagValue).filter(Boolean);
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

// Whether a line may still be *bought* is not in the catalogue. Trading212 keeps
// it on its own endpoint, one ticker per call, and it matters: 8% of the shares
// on offer and a handful of the funds are sell-only. That is a call per line, so
// `--no-close-only-check` is there for a run that only needs the listing and
// `--lanes=N` for how hard to lean on the endpoint.
const skipCloseOnly = hasFlag("no-close-only-check");
const lanes = Math.max(1, Number(flagValue("lanes")) || 12);

// `--country=XX` overrides where the account is resident, for when the browser
// no longer remembers the last sign-in.
const countryOverride = (() => {
  const value = flagValue("country");
  return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : "";
})();

const positionalQueries = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map(toIsin)
  .filter(Boolean);

// Trading212's app does not search server-side: it downloads the whole
// catalogue it is allowed to show this account and matches locally. Doing the
// same answers every ISIN from one request instead of one search per ISIN.
const CATALOGUE = "https://live.services.trading212.com/instrumentarium/v2/instruments/0";
const EXCHANGES = "https://live.services.trading212.com/instrumentarium/v1/exchanges/0";

// The app tags its calls with the device and account it is signed in as. The
// catalogue is served on the session cookie alone, so this is sent when the
// browser can tell us what to send and simply left off when it cannot.
const traderClient = await page.evaluate(() => {
  try {
    const device = JSON.parse(localStorage.getItem("usedDeviceIdForKeys") || '""');
    const account = localStorage.getItem("lastLogInAccountId") || "";
    if (!device || !account) return "";
    return `application=WC4,version=8.44.1,dUUID=${device},accountId=${account}`;
  } catch {
    return "";
  }
});

async function get(url) {
  return page.evaluate(
    async (target, client) => {
      const headers = client
        ? { "X-Trader-Client": client, "X-Trader-Target-Type": "EQUITY" }
        : {};
      try {
        const response = await fetch(target, { credentials: "include", headers });
        if (!response.ok) return { status: response.status };
        return { status: response.status, json: await response.json() };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    url,
    traderClient
  );
}

// Which country's rules the account trades under. It decides whether a fund is
// offered at all, so answering as the wrong country would answer for someone else.
const residency =
  countryOverride ||
  (await page.evaluate(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("cachedLoginResponse") || "null");
      return (cached?.loginResponse?.residencyCode || "").toUpperCase();
    } catch {
      return "";
    }
  }));

if (!residency) {
  throw new Error(
    "Could not read the account's country of residence. Sign in again, or pass --country=XX."
  );
}


console.error("reading Trading212's instrument list");
const catalogue = await get(CATALOGUE);
const instruments = catalogue.json?.instruments;
if (!Array.isArray(instruments)) {
  throw new Error(
    `Trading212 did not hand over its instrument list (HTTP ${catalogue.status}). Is the session still signed in?`
  );
}

const exchanges = await get(EXCHANGES);
if (!Array.isArray(exchanges.json?.items)) {
  throw new Error(`Trading212 did not hand over its exchange list (HTTP ${exchanges.status}).`);
}

// Exchanges are listed by their opening hours rather than by an id, and an
// instrument's exchangeId points at one of those schedules.
const exchangeById = new Map();
for (const item of exchanges.json.items) {
  for (const schedule of item.workingSchedules || []) exchangeById.set(schedule.id, item);
}

// Which Trading212 company holds the account. Availability is written per
// company, and the catalogue only ever names the one serving this session.
const entityCounts = new Map();
for (const instrument of instruments) {
  for (const key of Object.keys(instrument.supportedCountries || {})) {
    entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
  }
}
const entity = [...entityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
if (!entity) {
  throw new Error("Could not tell which Trading212 entity the account belongs to.");
}

// The CFD twin of a listing carries the same ISIN but is a different product: it
// is financed nightly on the whole notional, so holding it is not an investment at
// all. Only the real shares are kept, and the category is the test to use — 1944 of
// the 9204 CFDs carry no `_CFD` suffix, so matching on the ticker would leak.
// Crypto is left out for want of an ISIN rather than on principle.
const byIsin = new Map();
const excluded = new Map();
for (const instrument of instruments) {
  const wanted =
    instrument.category === "EQUITY" &&
    Boolean(instrument.isin) &&
    (!etfsOnly || instrument.type === "ETF") &&
    (!stocksOnly || instrument.type === "STOCK");
  if (!wanted) {
    const reason =
      instrument.category !== "EQUITY"
        ? instrument.category || "no category"
        : !instrument.isin
          ? "no ISIN"
          : `not asked for (${instrument.type})`;
    excluded.set(reason, (excluded.get(reason) || 0) + 1);
    continue;
  }
  const isin = instrument.isin.toUpperCase();
  if (!byIsin.has(isin)) byIsin.set(isin, []);
  byIsin.get(isin).push(instrument);
}

console.error(`${byIsin.size} ISINs listed, as a ${residency} account at ${entity}`);
console.error(
  `  left out: ${[...excluded].map(([reason, count]) => `${count} ${reason}`).join(", ") || "nothing"}`
);

// A listing can be in the catalogue and still be out of reach: US-domiciled
// funds have no KID for European clients, and some are withheld country by
// country even within the entity that offers them.
//
// Each test below was read back from Trading212's own order validator, which
// answers what an order would do without placing one. Asking it for a line the
// catalogue flags this way is what named the flag:
//
//   tradable not true      -> "NonTradableInstrument"  (every CVR and CorpAct line)
//   conditionalVisibility  -> "InstrumentInvisible"    (Wirecard, delisted lines, warrants)
//
// `conditionalVisibility` is the flag the app uses to keep a line out of its own
// search while still showing it to whoever holds it, so it reads as "position
// only". It is the whole reason warrants are absent from the answer: all 35 of
// them carry it, and the validator refuses every one.
function refusal(instrument) {
  if (instrument.tradable !== true) return "not for trading";
  if (instrument.suspended) return "suspended";
  if (instrument.conditionalVisibility) return "position only";
  if ((instrument.dealerExclusions || []).includes(entity)) return `not offered by ${entity}`;

  const allowed = instrument.supportedCountries?.[entity];
  if (allowed) return allowed.includes(residency) ? "" : `not offered in ${residency}`;

  // A fund may only be sold where it is registered, and the catalogue lists
  // those countries. A fund carrying no list at all is not one this account can
  // buy: the US trackers that reach this line are kept in the catalogue for the
  // accounts that already hold them. Shares are not sold under that rule, so
  // for them silence means yes.
  return instrument.type === "ETF" ? `not registered in ${residency}` : "";
}

const offered = new Map();
const refusals = new Map();
for (const [isin, listings] of byIsin) {
  const open = [];
  for (const listing of listings) {
    const refused = refusal(listing);
    if (refused) refusals.set(refused, (refusals.get(refused) || 0) + 1);
    else open.push(listing);
  }
  if (open.length > 0) offered.set(isin, open);
}

const offeredLines = [...offered.values()].reduce((total, list) => total + list.length, 0);
console.error(`  ${offeredLines} listings on ${offered.size} ISINs pass the catalogue's own flags`);
for (const [reason, count] of [...refusals].sort((a, b) => b[1] - a[1])) {
  console.error(`    ${String(count).padStart(5)} ${reason}`);
}

// Nothing in the catalogue says whether a line is still open to buyers, so the
// question is put to the endpoint the app itself asks, one ticker at a time. A
// line that comes back `closeOnly` can only be sold, which for a catalogue of
// what is for sale is the same as not being there.
async function sellOnlyTickers(tickers) {
  const found = new Set();
  let failed = 0;
  const CHUNK = 600;

  for (let at = 0; at < tickers.length; at += CHUNK) {
    const batch = tickers.slice(at, at + CHUNK);
    const answers = await page.evaluate(
      async (slice, client, width) => {
        const out = {};
        let next = 0;
        async function lane() {
          while (next < slice.length) {
            const ticker = slice[next++];
            try {
              const response = await fetch(
                "https://live.services.trading212.com/instrumentarium/v1/instrument-trading-statuses" +
                  `?ticker=${encodeURIComponent(ticker)}`,
                {
                  credentials: "include",
                  headers: { "X-Trader-Client": client, "X-Trader-Target-Type": "EQUITY" },
                }
              );
              out[ticker] = response.ok ? await response.json() : null;
            } catch {
              out[ticker] = null;
            }
          }
        }
        await Promise.all(Array.from({ length: width }, lane));
        return out;
      },
      batch,
      traderClient,
      lanes
    );

    for (const [ticker, status] of Object.entries(answers)) {
      if (status === null) failed += 1;
      else if (status.closeOnly) found.add(ticker);
    }
    console.error(
      `  ${Math.min(at + CHUNK, tickers.length)}/${tickers.length} asked, ${found.size} sell-only`
    );
  }

  if (failed > 0) console.error(`  ${failed} did not answer and are taken at their listing`);
  return found;
}

// This file answers what Trading212 sells, not what it costs. The two were mixed here
// and it made the catalogue impossible to keep honest: a cost is a fact about a broker
// and a moment, while a listing is a fact about a broker and a fund. What a round trip
// costs now lives in `trading212_cost.mjs`, which reads the exchange's figure from
// `parsed_json/spread.json` and applies this broker's own terms to it.

function rowFrom(query, instrument) {
  const exchange = exchangeById.get(instrument.exchangeId);
  const ticker = (instrument.shortName || "").toUpperCase();
  const name = (instrument.description || instrument.fullName || "").replace(/\s+/g, " ").trim();
  return {
    query,
    isin: instrument.isin || query,
    ticker: ticker || null,
    name,
    // What the app shows in its own lists, which is where the (Acc)/(Dist)
    // share class shows up.
    label: (instrument.fullName || "").replace(/\s+/g, " ").trim() || null,
    // Trading212's own code for the listing, e.g. "SPYYd_EQ".
    code: instrument.ticker || null,
    // Trading212 names its venues rather than coding them, and it names them
    // loosely: the funds it files under "NYSE" are quoted on NYSE Arca. That is
    // too coarse to turn into a MIC, so the name is passed on as it comes.
    exchange: exchange?.readableCaption || null,
    exchangeId: instrument.exchangeId ?? null,
    // What the account pays in, which is not always what the fund itself is
    // denominated in: a USD world tracker also trades here in euros and pence.
    currency: instrument.currency || null,
    type: instrument.type || null,
    subclasses: instrument.subclasses || null,
    raw: [ticker, name, exchange?.readableCaption, instrument.currency].filter(Boolean).join(" "),
  };
}

const outputPath = new URL("trading212-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// One fund is listed on several exchanges, and the same exchange can quote it
// in more than one currency, so the currency belongs in the key that tells two
// listings apart. The venue goes in by id: London's dollar and sterling order
// books answer to the same name.
const entryKey = (row) =>
  `${row.isin}:${row.ticker}:${row.exchangeId ?? row.exchange}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin && entry?.ticker) seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

// An ISIN named on the command line is answered even when the catalogue has
// nothing open on it, so that asking about one fund still says so out loud.
const listedQueries = listPaths.flatMap((path) => loadIsinsFromCsv(path));
const queries = uniqueQueries(
  positionalQueries.length > 0
    ? positionalQueries
    : listedQueries.length > 0
      ? listedQueries.filter((isin) => offered.has(isin))
      : [...offered.keys()]
);
if (listedQueries.length > 0) {
  console.error(
    `${uniqueQueries(listedQueries).length} ISINs in the lists given, ${queries.length} of them on offer`
  );
}

const pending = queries.slice(startIndex - 1);
const sellOnly = skipCloseOnly
  ? new Set()
  : await (async () => {
      const tickers = uniqueQueries(
        pending.flatMap((isin) => (offered.get(isin) || []).map((listing) => listing.ticker))
      );
      console.error(`asking which of ${tickers.length} listings are sell-only`);
      return sellOnlyTickers(tickers);
    })();

let sellOnlyDropped = 0;

for (const [queryIndex, isin] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;

  for (const instrument of offered.get(isin) || []) {
    if (sellOnly.has(instrument.ticker)) {
      sellOnlyDropped += 1;
      continue;
    }

    const row = rowFrom(isin, instrument);
    if (!row.ticker) continue;

    const key = entryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(row);
  }

  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  if ((queryIndex + 1) % 2000 === 0) {
    console.error(`  [${queryIndex + 1}/${queries.length}] ${results.length} listings kept`);
  }
}

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings on ${new Set(results.map((row) => row.isin)).size} ISINs: ` +
    [...byType].map(([type, count]) => `${count} ${type}`).join(", ")
);
if (sellOnlyDropped > 0) console.error(`${sellOnlyDropped} listings left out as sell-only`);

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
