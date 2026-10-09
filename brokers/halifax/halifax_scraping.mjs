// What Halifax sells in shares and exchange-traded funds.
// The book is the Lloyds catalogue. Both sites are
// Halifax Share Dealing Limited. The share centre announces 4,285 lines
// and the ETF centre 1,550, and the first row of each tab is the same
// instrument, down to the 1947 Oil & Gas file number.
//
// Funds, bonds and gilts stay on their own centres and are not in this copy.
//
//   https://www.investments.halifax.co.uk/share-centre/
//   https://www.investments.halifax.co.uk/etf-centre/
//
//   node brokers/halifax/halifax_scraping.mjs

import fs from "node:fs";

const SOURCE = new URL("../lloyds/lloyds-parsed.json", import.meta.url);
const OUTPUT = new URL("halifax-parsed.json", import.meta.url);

if (!fs.existsSync(SOURCE)) {
  throw new Error("le catalogue Lloyds n'existe pas encore : lancer `node brokers/lloyds/lloyds_scraping.mjs`");
}

fs.copyFileSync(SOURCE, OUTPUT);
const rows = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
if (!Array.isArray(rows) || !rows.length) throw new Error("le catalogue Lloyds est vide");

const oil = rows.find((row) => row.isin === "GB00BRQMRP25");
const drillisch = rows.find((row) => row.isin === "DE0005545503");
if (!oil || oil.exchange !== "LSE") throw new Error("1947 Oil & Gas was not stored on LSE");
if (!drillisch || drillisch.exchange !== "XETRA") throw new Error("1&1 Drillisch was not stored on XETRA");

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${rows.length} listings copied from Lloyds ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
