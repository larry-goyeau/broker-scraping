import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Al Ramz types every instrument as EQUITY, so it cannot say which of its
// listings are funds; the CSV is what marks an ISIN as an ETF worth keeping.
function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();

    const entry = map.get(isin) || { names: [] };
    map.set(isin, entry);
    if (name && !entry.names.includes(name)) entry.names.push(name);
  }

  return map;
}

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const csvIsins = loadIsinsFromCsv(csvPath);
console.error(`${csvIsins.size} ISINs in the CSV`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("alramz.ae")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("alramz.ae")) {
  await page.goto("https://webtrade.alramz.ae/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// The whole tradable universe comes down in one answer, so there is nothing to
// search or page through; the platform itself keeps a copy in session storage
// and only refetches it on login, which is the fallback when the call fails.
async function loadInstruments() {
  const answer = await page.evaluate(async () => {
    try {
      const response = await fetch("/Base/GetSearchScripts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const text = await response.text();
      const payload = JSON.parse(text);
      const rows = Array.isArray(payload) ? payload : payload.responseObj;
      if (!Array.isArray(rows)) return { status: response.status };
      return { status: 200, rows };
    } catch {
      return { status: 0 };
    }
  });

  if (answer.status === 200 && Array.isArray(answer.rows)) return answer.rows;

  const cached = await page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem("getSearchScriptsData") || "[]");
    } catch {
      return [];
    }
  });
  if (cached.length > 0) console.error("live call failed, using the app's cached universe");
  return cached;
}

const instruments = await loadInstruments();
if (instruments.length === 0) {
  throw new Error("Al Ramz returned no instruments. Is webtrade.alramz.ae signed in?");
}
console.error(`${instruments.length} instruments in Al Ramz's offering`);

const outputPath = "parsed_json/alramz-parsed.json";
const results = [];
const seen = new Set();
let offList = 0;

for (const instrument of instruments) {
  const isin = toIsin(instrument.sC_ISIN_CODE);
  if (!isin) continue;

  const entry = csvIsins.get(isin);
  if (!entry) {
    offList += 1;
    continue;
  }

  const exchange = (instrument.sc_exchange || instrument.sC_EXCHANGE || "").toUpperCase();
  const ticker = (
    instrument.tickeR_ID ||
    instrument.display_name ||
    instrument.scE_SHORT_NAME ||
    ""
  ).toUpperCase();
  if (!ticker || !exchange) continue;

  // A fund can be quoted on more than one of Al Ramz's venues, and each
  // listing is its own tradable line.
  const key = `${exchange}:${isin}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const name = (instrument.scE_LONG_NAME || entry.names[0] || "").replace(/\s+/g, " ").trim();
  const currency = instrument.cuR_CODE || null;

  results.push({
    query: isin,
    ticker,
    name,
    exchange,
    currency,
    type: "ETF",
    raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
    isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched, ${offList} instruments not in the CSV`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
