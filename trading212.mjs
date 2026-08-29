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
// throwing away progress already saved to parsed_json/trading212-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return "etfs.csv";
})();

// `--country=XX` overrides where the account is resident, for when the browser
// no longer remembers the last sign-in.
const countryOverride = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--country=([A-Za-z]{2})$/i);
    if (m) return m[1].toUpperCase();
  }
  return "";
})();

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv(csvPath);
const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const queries = uniqueQueries(
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : defaultQueries
);

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

// The CFD twin of a listing carries the same ISIN but is a different product,
// so only the real shares are kept.
const byIsin = new Map();
for (const instrument of instruments) {
  if (instrument.category !== "EQUITY" || !instrument.isin) continue;
  const isin = instrument.isin.toUpperCase();
  if (!byIsin.has(isin)) byIsin.set(isin, []);
  byIsin.get(isin).push(instrument);
}

console.error(
  `${byIsin.size} ISINs listed, ${queries.length} to check, as a ${residency} account at ${entity}`
);

// A listing can be in the catalogue and still be out of reach: US-domiciled
// funds have no KID for European clients, and some are withheld country by
// country even within the entity that offers them.
function refusal(instrument) {
  if (instrument.tradable === false) return "not tradable";
  if (instrument.suspended) return "suspended";
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

const outputPath = "parsed_json/trading212-parsed.json";
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
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

for (const [queryIndex, isin] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${isin}`);

  for (const instrument of byIsin.get(isin) || []) {
    const refused = refusal(instrument);
    if (refused) {
      console.error(`  ${instrument.shortName || instrument.ticker}: ${refused} — skipped`);
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
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
