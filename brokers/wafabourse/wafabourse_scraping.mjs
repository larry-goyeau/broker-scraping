// What Wafa Bourse sells in shares, with no login. There is no Wafa
// list. The online order is the cash equities of the Casablanca
// exchange. The exchange instrument page is that book. Every row is a
// first-line share. A right, a bond and a fund stay out. Casablanca
// lists no ETF. The page prints the ISIN.
//
//   https://www.attijariwafabank.com/fr/marques-et-filiales-marocaines/wafabourse
//   https://www.casablanca-bourse.com/marches-produits/actions
//
//   node brokers/wafabourse/wafabourse_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const PAGE = "https://www.casablanca-bourse.com/marches-produits/actions";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// The exchange chain is missing from Node's certificate store. curl uses
// the system store, which does hold it.
async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "45", "-A", UA, url], { maxBuffer: 8_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function casablancaShares(html) {
  const match = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">(.*?)<\/script>/s);
  if (!match) throw new Error("Casablanca instrument page has no list");
  const rows = JSON.parse(match[1])?.boursenova?.actions;
  if (!Array.isArray(rows) || rows.length < 70) throw new Error(`Casablanca printed ${rows?.length ?? 0} shares`);
  const listings = [];
  const seen = new Set();
  for (const row of rows) {
    const kind = String(row.categorie || "").trim().toUpperCase();
    if (kind !== "ACTIONS 1ERE LIGNE") throw new Error(`${row.ticker} is ${kind || "unmarked"}, not a share`);
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const isin = String(row.codeISIN || "").trim().toUpperCase();
    const name = String(row.emetteur || row.instrument || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(row.ticker)}`);
    if (!/^MA[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange: "Casablanca",
      currency: "MAD",
      type: "STOCK",
      isin,
      raw: [ticker, name, "Casablanca", isin, "STOCK"].join(" "),
    });
  }
  listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return listings;
}

const listings = casablancaShares(await getText(PAGE));
fs.writeFileSync(new URL("wafabourse-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error(`${listings.length} listings (${listings.length} STOCK)`);
