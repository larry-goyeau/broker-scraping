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

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

// Naming ISINs on the command line narrows a run down to those.
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliIsins = new Set(positionalArgs.map(toIsin).filter(Boolean));
const wanted = cliIsins.size > 0 ? cliIsins : new Set(loadIsinsFromCsv(csvPath));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page = pages.find((p) => /degiro\./i.test(p.url())) || (await browser.newPage());

if (!/degiro\./i.test(page.url())) {
  await page.goto("https://trader.degiro.nl/trader/#/markets", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// Every call the trader makes carries the session and the account number in
// plain sight, so they are read back off its own traffic rather than guessed.
// The browser keeps a bounded log of those requests, hence the reload when
// nothing turns up.
async function readSession() {
  return page.evaluate(() => {
    const found = {};
    for (const entry of performance.getEntriesByType("resource")) {
      const query = new URL(entry.name).searchParams;
      if (query.get("sessionId")) found.sessionId = query.get("sessionId");
      if (query.get("intAccount")) found.intAccount = query.get("intAccount");
    }
    return found;
  });
}

let session = await readSession();
if (!session.sessionId || !session.intAccount) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  session = await readSession();
}
if (!session.sessionId || !session.intAccount) {
  throw new Error("Could not read the DeGiro session. Is the trader signed in?");
}

const tail = `intAccount=${session.intAccount}&sessionId=${session.sessionId}`;

async function api(path) {
  const answer = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    try {
      return { status: response.status, json: JSON.parse(text) };
    } catch {
      return { status: response.status, error: text.slice(0, 160) };
    }
  }, path);

  if (answer.status !== 200) {
    throw new Error(`DeGiro answered ${answer.status} for ${path.split("?")[0]}`);
  }
  return answer.json;
}

// Products name their venue by number; the dictionary turns that into the
// short code the trader shows in its own product table.
async function loadExchanges() {
  const payload = await api(`/productsearch/secure/v1/config/dictionary?${tail}`);
  const names = new Map();
  for (const row of payload?.exchanges || []) {
    names.set(String(row.id), (row.hiqAbbr || row.name || "").toUpperCase());
  }
  return names;
}

// The whole tracker shelf comes down a page at a time, so the CSV is matched
// against it afterwards instead of asking DeGiro about one ISIN at a time.
async function loadEtfs() {
  const products = [];
  const pageSize = 1000; // The service caps a page here whatever is asked for.

  for (let offset = 0; offset < 100000; offset += pageSize) {
    const payload = await api(
      `/product_search/secure/v5/etfs?popularOnly=false&inputAggregateTypes=&inputAggregateValues=` +
        `&searchText=&offset=${offset}&limit=${pageSize}&requireTotal=true` +
        `&sortColumns=name&sortTypes=asc&${tail}`
    );

    const batch = payload?.products || [];
    products.push(...batch);
    console.error(`  ${products.length}/${payload?.total ?? "?"} listings`);
    if (batch.length < pageSize) break;
  }

  return products;
}

const exchanges = await loadExchanges();
console.error(`${exchanges.size} exchanges named, ${wanted.size} ISINs wanted`);

const shelf = await loadEtfs();

const results = [];
const seen = new Set();
let untradable = 0;
let absent = 0;

for (const product of shelf) {
  const isin = toIsin(product?.isin);
  if (!isin) continue;

  if (!wanted.has(isin)) {
    absent += 1;
    continue;
  }
  // Listings the account cannot act on are no use in a shopping list.
  if (!product.tradable || !product.active) {
    untradable += 1;
    continue;
  }

  const ticker = String(product.symbol || "").toUpperCase();
  const exchange = exchanges.get(String(product.exchangeId)) || String(product.exchangeId);
  const key = `${exchange}:${ticker}:${isin}`;
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: isin,
    name: String(product.name || "").replace(/\s+/g, " ").trim(),
    ticker,
    exchange,
    currency: product.currency || null,
    isin,
  });
}

fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../parsed_json/degiro-parsed.json", import.meta.url), JSON.stringify(results, null, 2));

console.error(
  `${results.length} listings kept over ${new Set(results.map((row) => row.isin)).size} funds, ` +
    `${untradable} not tradable, ${absent} the CSV does not carry`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
