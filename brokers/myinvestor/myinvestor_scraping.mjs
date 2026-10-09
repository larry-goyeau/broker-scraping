// What MyInvestor sells in shares and exchange-traded funds, with no login.
// The public search is the catalogue: one page of shares, one page of ETFs.
// Mutual funds, plans and the robo-adviser stay out.
//
// Most market codes name one book, and the row uses that book's alias.
// Four codes can take more than one spread, and those names are written
// once per book:
//   SET and LSE     London's main book, and the international order book.
//   VIR not in CHF  every book the other catalogues already quote for that
//                   ISIN and currency. A franc line is the Swiss book.
//   RV GLOBAL and RV CLEARSTREAM   the same lookup. Neither code names a place.
//
//   https://api.myinvestor.es/ms-broker/public/broker/product
//
//   node brokers/myinvestor/myinvestor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const PRODUCT = "https://api.myinvestor.es/ms-broker/public/broker/product";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// One alias each, and each alias is an exact venue name. Frankfurt (FFT)
// stays the floor. Xetra is the other German book. BSE is Brussels, not Bombay.
const PLACE = {
  XTR: ["XETR"],
  VEX: ["XWBO"],
  VEN: ["VENTURE"],
  TOR: ["TOR"],
  SWX: ["SWX"],
  PAR: ["PAR"],
  OSL: ["OSL"],
  NYS: ["NYS"],
  NDQ: ["NDQ"],
  MEX: ["MEXICO"],
  HEX: ["HEX"],
  FFT: ["FFT"],
  AEX: ["AEX"],
  BLI: ["XLIS"],
  SEX: ["XSTO"],
  COP: ["XCSE"],
  MCI: ["XMIL"],
  BSE: ["XBRU"],
  BMA: ["MADRID"],
  "NDQ OTC": ["OTC"],
  CMA: ["CORROS"],
  CBA: ["CORROS"],
  MABEX: ["MABEX"],
};

// SETS and the international order book are both London in the venue
// file today, so both lines read the same touch. The two labels stay,
// because MyInvestor prints them as two markets.
const LONDON = ["LSE", "LSEIOB"];

function fundType(name, productType) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || productType === "ETF") return "ETF";
  return "STOCK";
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function products(productType) {
  const first = await getJson(
    `${PRODUCT}?limit=200&page=1&suggest=&showDiscontinuedResults=false&productType=${productType}`
  );
  const payload = first.payload;
  if (!payload || !Array.isArray(payload.data)) throw new Error(`MyInvestor ${productType} page 1 had no rows`);
  const pages = Number(payload.pagination?.totalPages) || 1;
  const out = [...payload.data];
  console.error(`${productType} page 1/${pages}`);
  let page = 2;
  async function worker() {
    while (page <= pages) {
      const current = page;
      page += 1;
      const body = await getJson(
        `${PRODUCT}?limit=200&page=${current}&suggest=&showDiscontinuedResults=false&productType=${productType}`
      );
      const data = body.payload?.data;
      if (!Array.isArray(data)) throw new Error(`MyInvestor ${productType} page ${current} had no rows`);
      out.push(...data);
      if (current % 5 === 0 || current === pages) console.error(`${productType} page ${current}/${pages}`);
    }
  }
  await Promise.all(Array.from({ length: 2 }, () => worker()));
  return out;
}

// Places the other catalogues already quote for these ISINs, in that currency.
function quotedBooks(isins) {
  const want = new Set(isins);
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "myinvestor") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!want.has(isin)) continue;
      const currency = String(row.currency || "").trim().toUpperCase();
      const { venue } = resolveVenue(row);
      if (!venue || !currency) continue;
      const id = `${isin}|${currency}`;
      if (!book.has(id)) book.set(id, new Set());
      book.get(id).add(venue.mic);
    }
  }
  return book;
}

function placesOf(product, books) {
  const code = String(product.marketCode || "").trim();
  const currency = String(product.currency || "").trim().toUpperCase();
  const isin = String(product.isin || "").trim().toUpperCase();
  if (code === "SET" || code === "LSE") return LONDON;
  if (code === "VIR" && currency === "CHF") return ["SWX"];
  if (code === "VIR" || code === "RVG" || code === "RVCBL") {
    const found = [...(books.get(`${isin}|${currency}`) || [])].filter((mic) => code !== "VIR" || mic !== "XSWX");
    if (found.length) return found.sort();
    if (code === "VIR") return ["SWX EUROPE"];
    if (code === "RVCBL") return ["RV CLEARSTREAM"];
    return ["RV GLOBAL"];
  }
  const known = PLACE[code];
  if (!known) throw new Error(`unread MyInvestor market ${code || "blank"}`);
  return known;
}

const shares = await products("RV");
const funds = await products("ETF");
const special = [...shares, ...funds].filter((row) => {
  const code = String(row.marketCode || "").trim();
  return code === "RVG" || code === "RVCBL" || (code === "VIR" && String(row.currency || "").toUpperCase() !== "CHF");
});
const books = quotedBooks(special.map((row) => String(row.isin || "").toUpperCase()));

const rows = [];
const seen = new Set();
for (const product of [...shares, ...funds]) {
  const isin = String(product.isin || "").trim().toUpperCase();
  const ticker = String(product.ticker || "").trim().toUpperCase();
  const name = String(product.name || "").replace(/\s+/g, " ").trim();
  const currency = String(product.currency || "").trim().toUpperCase();
  const code = String(product.marketCode || "").trim();
  if (!isin || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`no ISIN for ${ticker || name} on ${code}`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${isin} is quoted ${currency || "nowhere"}`);
  const type = fundType(name, product.productType || (funds.includes(product) ? "ETF" : "RV"));
  for (const exchange of placesOf(product, books)) {
    const id = `${isin}|${exchange}|${currency}|${type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const symbol = ticker || isin;
    rows.push({
      query: symbol,
      ticker: symbol,
      name: name || symbol,
      exchange,
      currency,
      type,
      isin,
      raw: [symbol, name, exchange, currency, type, code].filter(Boolean).join(" "),
    });
  }
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

const apple = rows.filter((row) => row.isin === "US0378331005");
if (!apple.some((row) => row.exchange === "XETR")) throw new Error("Apple was not on Xetra");
const london = rows.filter((row) => row.raw.includes(" SET") || row.raw.endsWith(" LSE"));
if (!london.length || london.some((row) => row.exchange !== "LSE" && row.exchange !== "LSEIOB")) {
  throw new Error("a London line was not written twice");
}
const nestle = rows.filter((row) => row.isin === "CH0038863350");
const swiss = nestle.filter((row) => row.currency === "CHF");
if (swiss.length !== 1 || swiss[0].exchange !== "SWX") throw new Error("Nestlé was not the Swiss book");
if (!nestle.some((row) => row.exchange === "XETR" && row.currency === "EUR")) throw new Error("Nestlé was not on Xetra");

fs.writeFileSync(
  new URL("myinvestor-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(rows)), null, 2)
);

const byType = new Map();
const byPlace = new Map();
for (const row of rows) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
}
console.error(
  `${rows.length} listings (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")}); ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}`
);
