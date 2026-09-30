// What neon invest sells. The public file is the list the site shows.
// A line in it is for sale. There is no separate telephone book.
//
// Every share, ETF and ETP is traded on BX Swiss, in francs. The file
// does not name a home exchange, so the place is BX Swiss on each row.
// Pillar 3a is Swisscanto funds held by another foundation, not this list.
//
//   https://static-assets.neon-free.ch/website/asset_list.json
//   https://www.neon-free.ch/en/faq/where-are-my-investments-traded
//
//   node neon/neon_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const LIST = "https://static-assets.neon-free.ch/website/asset_list.json";
const OUTPUT = new URL("neon-parsed.json", import.meta.url);

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function listingType(row) {
  const type = String(row.type || "").trim().toUpperCase();
  if (type === "STOCK") return "STOCK";
  if (type === "ETF") return "ETF";
  if (type === "ETP") return "ETP";
  return "";
}

const response = await fetch(LIST, {
  headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`neon asset list answered ${response.status}`);
const body = await response.json();
if (!Array.isArray(body)) throw new Error("neon asset list was not a list");

const seen = new Set();
const results = [];
let skipped = 0;
for (const row of body) {
  const isin = toIsin(row.isin);
  const type = listingType(row);
  if (!isin || !type) {
    skipped += 1;
    continue;
  }
  if (seen.has(isin)) continue;
  seen.add(isin);
  const name = String(row.originalName || row.name || isin).replace(/\s+/g, " ").trim();
  const planFree = row.zeroFeeForSavingsPlan === true;
  results.push({
    query: isin,
    ticker: isin,
    name,
    exchange: "BX Swiss",
    currency: "CHF",
    type,
    isin,
    ...(planFree ? { planFree: true } : {}),
    raw: [isin, name, row.name, "BX Swiss", "CHF"].filter(Boolean).join(" "),
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.name.localeCompare(right.name);
});

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const planFree = results.filter((row) => row.planFree).length;
console.error(
  `${results.length} listings over ${results.length} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    `, ${planFree} free to buy on the investment plan` +
    (skipped ? `, ${skipped} left out` : "")
);
