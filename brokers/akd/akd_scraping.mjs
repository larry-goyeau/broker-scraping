// What AKD Securities sells in shares and ETFs, with no login.
// The Roshan page says the conventional account trades across the board
// of the Pakistan Stock Exchange. It does not print the names. The
// exchange does: the regular deliverable market, one symbol per line.
// A right stays out. A future, a bond and an odd-lot twin stay out,
// because they are other boards. A preferred share stays. Every line
// here is quoted in rupees.
//
//   https://akdsl.com/Services/RDA
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
//   node brokers/akd/akd_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { withoutDelisted } from "../../psxStatus.mjs";
import fs from "node:fs";

const LIST = "https://dps.psx.com.pk/data/eligible-scrips/REG.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const OUTPUT = new URL("akd-parsed.json", import.meta.url);

function clean(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isRight(name) {
  return /\bright\b/i.test(name);
}

function isEtf(name) {
  return /\bETF\b|exchange traded fund/i.test(name);
}

const response = await fetch(LIST, {
  headers: { "User-Agent": UA, Accept: "application/xml, text/xml, */*" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`PSX regular market answered ${response.status}`);
const xml = await response.text();
const pairs = [...xml.matchAll(/<symbol_code>([\s\S]*?)<\/symbol_code>\s*<symbol_name>([\s\S]*?)<\/symbol_name>/g)];
if (pairs.length < 400) throw new Error(`PSX published ${pairs.length} regular symbols`);

const results = [];
for (const pair of pairs) {
  const ticker = clean(pair[1]).toUpperCase();
  const name = clean(pair[2]) || ticker;
  if (!ticker || isRight(name)) continue;
  const type = isEtf(name) ? "ETF" : "STOCK";
  results.push({
    query: ticker,
    ticker,
    name,
    exchange: "PSX",
    currency: "PKR",
    type,
    raw: [ticker, name, "PSX", "PKR", type].join(" "),
    isin: "",
  });
}

const seen = new Set();
const unique = [];
for (const row of results) {
  if (seen.has(row.ticker)) continue;
  seen.add(row.ticker);
  unique.push(row);
}
unique.sort((left, right) => left.ticker.localeCompare(right.ticker));

if (!unique.some((row) => row.ticker === "OGDC" && row.type === "STOCK")) {
  throw new Error("OGDC was not a PSX share");
}
if (!unique.some((row) => row.ticker === "MIIETF" && row.type === "ETF")) {
  throw new Error("MIIETF was not a PSX ETF");
}
if (unique.some((row) => row.ticker === "786R")) throw new Error("a right stayed in the file");

// Delisted and suspended companies stay in the list but cannot be bought.
const stamped = stampRows(withoutDelisted(withoutObligations(unique)));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const etf = stamped.filter((row) => row.type === "ETF").length;
const withIsin = stamped.filter((row) => row.isin).length;
console.error(`${stamped.length} listings, ${withIsin} avec ISIN, ${etf} ETF`);
