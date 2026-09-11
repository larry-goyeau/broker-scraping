import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
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

// Al Ramz types every instrument as EQUITY, so it cannot say which of its
// listings are funds. The CSV is only what types a known ISIN; the live book
// is kept in full — dropping anything off `etfs.csv` left four NYSE funds
// and Al Ramz never showed on the page.
function loadIsinsFromCsv(csvPath, kind, map = new Map()) {
  if (!fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!map.has(isin)) map.set(isin, { kind, names: [] });
    const entry = map.get(isin);
    if (name && !entry.names.includes(name)) entry.names.push(name);
  }

  return map;
}

function listingType(name, kind) {
  if (kind === "STOCK") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  if (kind === "ETF") return "ETF";
  return "STOCK";
}

const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const csvIsins = new Map();
if (!stocksOnly) loadIsinsFromCsv(pathArg("csv", "../etfs.csv"), "ETF", csvIsins);
if (!etfsOnly) loadIsinsFromCsv(pathArg("stocks-csv", "../stocks.csv"), "STOCK", csvIsins);
console.error(`${csvIsins.size} ISINs typed from the catalogues`);

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

const outputPath = new URL("alramz-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
let untyped = 0;

for (const instrument of instruments) {
  const isin = toIsin(instrument.sC_ISIN_CODE);
  const exchange = (instrument.sc_exchange || instrument.sC_EXCHANGE || "").toUpperCase();
  const ticker = (
    instrument.tickeR_ID ||
    instrument.display_name ||
    instrument.scE_SHORT_NAME ||
    ""
  ).toUpperCase();
  if (!ticker || !exchange) continue;

  // A name can be quoted on more than one of Al Ramz's venues, and each
  // listing is its own tradable line.
  const key = `${exchange}:${isin || ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const entry = isin ? csvIsins.get(isin) : null;
  if (!entry) untyped += 1;
  const name = (instrument.scE_LONG_NAME || entry?.names[0] || ticker).replace(/\s+/g, " ").trim();
  const type = listingType(name, entry?.kind || "");
  if (etfsOnly && type === "STOCK") continue;
  if (stocksOnly && type !== "STOCK") continue;
  const currency = instrument.cuR_CODE || null;

  results.push({
    query: isin || ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
    isin: isin || "",
  });
}

fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (untyped ? `, ${untyped} not in the catalogues` : "")
);

await browser.disconnect();
