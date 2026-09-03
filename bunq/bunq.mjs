import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// bunq names an instrument once and does not say where it trades it, so the
// listing is keyed by ISIN alone and the CSV supplies the ticker.
function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const ticker = normalizeTicker(columns[0]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();

    const entry = map.get(isin) || { tickers: new Map(), byExchange: new Map(), names: [] };
    map.set(isin, entry);

    if (ticker) {
      entry.tickers.set(ticker, (entry.tickers.get(ticker) || 0) + 1);
      const venue = entry.byExchange.get(exchange) || new Map();
      entry.byExchange.set(exchange, venue);
      venue.set(ticker, (venue.get(ticker) || 0) + 1);
    }
    if (name && !entry.names.includes(name)) entry.names.push(name);
  }

  return map;
}

// bunq is a Dutch/German bank whose stock service trades on Xetra, so a fund's
// German-listing ticker is the one its clients would recognise. Whichever
// ticker appears most across all venues could otherwise be a foreign code.
const HOME_EXCHANGES = ["XETR", "EURONEXT"];

// Venues list a fund under a plain ticker and under suffixed variants of it
// ("EUNL" beside "EUNL-ETFP"), and the plain one is the one that is quoted.
function bestTicker(tickers) {
  if (!tickers || tickers.size === 0) return "";

  return [...tickers.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    const plain = Number(/[-.]/.test(left[0])) - Number(/[-.]/.test(right[0]));
    if (plain !== 0) return plain;
    if (left[0].length !== right[0].length) return left[0].length - right[0].length;
    return left[0].localeCompare(right[0]);
  })[0][0];
}

function pickTicker(entry) {
  for (const exchange of HOME_EXCHANGES) {
    const ticker = bestTicker(entry.byExchange.get(exchange));
    if (ticker) return ticker;
  }
  return bestTicker(entry.tickers);
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

function listedType(category) {
  if (category === "STOCK") return "STOCK";
  if (category === "ETF") return "ETF";
  return "";
}

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). bunq's ginmon dump is the whole
// book — funds and single names — in one answer; there is no spot crypto.
// `--funds-only` / `--etfs-only` answer for the funds; `--stocks-only` for
// the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const fundsIsins = stocksOnly ? new Map() : loadIsinsFromCsv(csvPath);
const stocksIsins = fundsOnly ? new Map() : loadIsinsFromCsv(stocksCsvPath);
if (!stocksOnly) console.error(`${fundsIsins.size} funds in the CSV`);
if (!fundsOnly) console.error(`${stocksIsins.size} shares in the CSV`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("web.bunq.com")) || (await browser.newPage());
if (!page.url().includes("web.bunq.com")) {
  await page.goto("https://web.bunq.com/", { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

const userId = page.url().match(/user\/(\d+)/)?.[1];
if (!userId) {
  throw new Error("Could not read the bunq user id. Is web.bunq.com signed in?");
}

// bunq signs each call with a client proof it derives from the logged-in
// session, so rather than reconstruct it the proof and client version are read
// off the app's own traffic; a reload makes it fire the calls that carry them.
let proof = null;
let version = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("api.web.bunq.com")) return;
  const sent = event.request.headers || {};
  proof = sent["x-bunq-authentication-client-proof"] || proof;
  version = sent["x-bunq-client-version"] || version;
});

async function captureProof() {
  for (let attempt = 0; attempt < 3 && !proof; attempt += 1) {
    await page
      .goto(`https://web.bunq.com/user/${userId}/stocks`, { waitUntil: "networkidle2" })
      .catch(() => {});
    for (let waited = 0; waited < 15000 && !proof; waited += 250) await sleep(250);
  }
  return Boolean(proof);
}

if (!(await captureProof())) {
  throw new Error("Could not read bunq's session proof. Is web.bunq.com signed in?");
}

// The whole stock offering comes down in one answer: `all_instrument` carries
// every instrument bunq trades, so there is nothing to search or page through.
async function loadInstruments() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(
      async (uid, pf, ver) => {
        try {
          const response = await fetch(
            `https://api.web.bunq.com/v1/user/${uid}/ginmon-overview?count=200&include_balance=false&include_instruments=true&include_valuation_history=false&period=ONE_DAY`,
            {
              method: "GET",
              credentials: "include",
              headers: {
                "x-bunq-language": "en_US",
                "x-bunq-authentication-token-type": "USER",
                "x-bunq-authentication-client-proof": pf,
                "x-bunq-client-request-id": crypto.randomUUID(),
                "x-bunq-client-version": ver,
              },
            }
          );
          if (!response.ok) return { status: response.status };
          return { status: 200, json: await response.json() };
        } catch (error) {
          return { status: 0 };
        }
      },
      userId,
      proof,
      version
    );

    if (answer.status === 200) {
      const overview = answer.json?.Response?.find((row) => row.GinmonOverview)?.GinmonOverview;
      return overview?.all_instrument || [];
    }

    // The proof rides the session; wait for the app to fire a fresh call.
    const stale = proof;
    for (let waited = 0; waited < 20000 && proof === stale; waited += 250) await sleep(250);
    if (proof === stale) await captureProof();
  }

  return [];
}

const instruments = await loadInstruments();
if (instruments.length === 0) {
  throw new Error("bunq returned no instruments.");
}
console.error(`${instruments.length} instruments in bunq's offering`);

const wantedIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);

const outputPath = new URL("bunq-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
let offList = 0;
let skippedKind = 0;

for (const instrument of instruments) {
  const kind = listedType(instrument.category);
  if (!kind) {
    skippedKind += 1;
    continue;
  }
  if (fundsOnly && kind !== "ETF") continue;
  if (stocksOnly && kind !== "STOCK") continue;

  const isin = toIsin(instrument.isin);
  if (!isin || seen.has(isin)) continue;
  if (wantedIsins.size > 0 && !wantedIsins.has(isin)) continue;

  const csv = kind === "STOCK" ? stocksIsins : fundsIsins;
  const entry = csv.get(isin);
  if (!entry) {
    offList += 1;
    continue;
  }

  seen.add(isin);
  // The search box is a Fuse.js filter on `name` and `ticker` only — an ISIN
  // typed there matches nothing. bunq leaves `ticker` blank, so the marketing
  // name ("ING", "MSCI World") is the string that actually finds the line.
  const name = (instrument.legal_name || instrument.name || entry.names[0] || "").trim();
  const query = String(instrument.name || name).trim();
  results.push({
    query,
    ticker: pickTicker(entry),
    name,
    // bunq routes its orders to Xetra, which quotes in euros.
    currency: "EUR",
    type: kind,
    raw: [instrument.name, instrument.legal_name, isin].filter(Boolean).join(" "),
    isin,
  });
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (offList ? `, ${offList} not in the CSV` : "") +
    (skippedKind ? `, ${skippedKind} outside funds and shares` : "")
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
