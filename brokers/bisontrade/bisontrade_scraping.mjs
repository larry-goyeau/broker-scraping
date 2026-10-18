// BisonTrade (Miralta Finance Bank) publishes its "Buscador de acciones y
// ETFs" as one static JSON file, with no login. Every product it lists
// carries a Saxo-style code (TICKER:mic), the name, the quote currency, the
// ISIN and a type: Acción, ETF, ETC or ETN. The file states its own product
// count, which must match the rows.
//
// The page says a product that is not in the search can be requested from
// the desk, so the file is the list of what is open today. Bonds, funds,
// futures, options and CFDs are sold elsewhere on the site and are not in it.
//
//   https://www.bisontrade.com/buscador-acciones-etfs/
//   https://www.bisontrade.com/wp-content/plugins/bisontrade-buscador-divi/assets/products.min.json
//
//   node brokers/bisontrade/bisontrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FILE = "https://www.bisontrade.com/wp-content/plugins/bisontrade-buscador-divi/assets/products.min.json";

// The code suffix is the Saxo exchange code. "xome" is Nasdaq Stockholm,
// "xmce" the Spanish continuous market, "xvtx" the SIX blue-chip segment.
const VENUES = {
  arcx: ["NYSE Arca", "ARCX"],
  bats: ["Cboe BZX", "BATS"],
  xams: ["Euronext Amsterdam", "XAMS"],
  xase: ["NYSE American", "XASE"],
  xbru: ["Euronext Brussels", "XBRU"],
  xcse: ["Nasdaq Copenhagen", "XCSE"],
  xdub: ["Euronext Dublin", "XMSM"],
  xetr: ["Xetra", "XETR"],
  xfra: ["Börse Frankfurt", "XFRA"],
  xhel: ["Nasdaq Helsinki", "XHEL"],
  xhkg: ["HKEX", "XHKG"],
  xlis: ["Euronext Lisbon", "XLIS"],
  xlon: ["London Stock Exchange", "XLON"],
  xmce: ["Bolsa de Madrid", "XMAD"],
  xmil: ["Euronext Milan", "XMIL"],
  xnas: ["Nasdaq", "XNAS"],
  xnys: ["NYSE", "XNYS"],
  xome: ["Nasdaq Stockholm", "XSTO"],
  xosl: ["Oslo Børs", "XOSL"],
  xpar: ["Euronext Paris", "XPAR"],
  xswx: ["SIX Swiss Exchange", "XSWX"],
  xtse: ["Toronto Stock Exchange", "XTSE"],
  xvtx: ["SIX Swiss Exchange", "XSWX"],
  xwbo: ["Wiener Börse", "XWBO"],
};

const TYPES = { "ACCIÓN": "STOCK", ETF: "ETF", ETC: "ETC", ETN: "ETN" };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function load() {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(FILE, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${FILE}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const body = await load();
const products = body.products;
const announced = Number(body.meta?.productCount);
if (!Array.isArray(products)) throw new Error("no product array");
if (products.length !== announced) throw new Error(`file announces ${announced} products and holds ${products.length}`);
if (products.length < 12000) throw new Error(`only ${products.length} products`);

const rows = [];
const seen = new Set();
const unknown = new Map();
for (const product of products) {
  const code = normalize(product.code);
  const [ticker, suffix] = code.split(":");
  const venue = VENUES[normalize(suffix).toLowerCase()];
  const type = TYPES[normalize(product.type).toUpperCase()];
  if (!venue || !type) {
    const label = venue ? `type ${product.type}` : `venue ${suffix}`;
    unknown.set(label, (unknown.get(label) || 0) + 1);
    continue;
  }
  const name = normalize(product.name);
  const currency = normalize(product.currency).toUpperCase();
  const isin = normalize(product.isin).toUpperCase();
  if (!ticker || !name) throw new Error(`${code} has no ticker or name`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${code} is quoted ${currency || "nowhere"}`);
  const key = `${ticker}|${venue[1]}|${currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: venue[0],
    mic: venue[1],
    currency,
    type,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    raw: [code, name, normalize(product.type), currency, isin].filter(Boolean).join(" "),
  });
}
if (unknown.size) throw new Error(`unmapped: ${[...unknown].map(([label, count]) => `${label} (${count})`).join(", ")}`);

rows.sort((left, right) =>
  left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker),
);

const apple = rows.find((row) => row.isin === "US0378331005" && row.mic === "XNAS");
if (!apple) throw new Error("Apple is not on Nasdaq");
const santander = rows.find((row) => row.isin === "ES0113900J37" && row.mic === "XMAD");
if (!santander) throw new Error("Santander is not on Madrid");

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bisontrade-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
console.error(`${kept.length} listings (${[...counts].map(([key, count]) => `${count} ${key}`).join(", ")})`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
