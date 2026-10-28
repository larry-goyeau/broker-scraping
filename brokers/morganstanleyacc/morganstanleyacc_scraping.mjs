// What Morgan Stanley Access Direct (Morgan Stanley Smith Barney LLC, the
// self-directed account for stock plan participants) sells in shares and
// exchange-traded products, with no login. Morgan Stanley publishes no list
// of titles. Its pricing page gives "Stocks + ETFs $0" for online trades
// and sends restrictions to the Morgan Stanley Online Trade Restrictions
// PDF, whose Access Direct table reads:
//   "Most US equities" / "Most US ETFs" (allowed),
//   "Inverse/Leveraged ETFs: Sell only",
//   "Preferred Stock: Not available",
//   "Stock priced < $2: Not available",
//   "OTC Stock priced < $5 (excludes ADRs)", "OTC Caveat Emptor",
//   "OTC Pink Sheet - No Information", "OTC Grey Market": "Not available".
//
//   https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details
//   https://www.morganstanley.com/content/dam/msdotcom/what-we-do/wealth-management-master/access-direct/Morgan_Stanley_Online_Trade_Restrictions.pdf
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, partnership units,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas Stock Exchange, less the lines with an open
// trade halt), less:
// - preferred shares ("Not available"; usBook { preferreds: false });
// - inverse and leveraged ETFs and ETNs ("Sell only": they cannot be
//   bought). No list is published, so they are read from the fund's name:
//   a multiple (2X, 3x, -1x, 1.5X), ProShares Ultra/UltraPro/UltraShort/
//   Short, "Inverse", "Leveraged" (not "Leveraged Loan"), "Bull"/"Bear"
//   (not "Bull/Bear Hedge", "Bond Bull"), "Short" when it is not a bond
//   term ("Short-Term", "Short Duration"...) or a long/short fund, and
//   Leverage Shares' daily funds;
// - shares whose last sale is under $2 ("Stock priced < $2: Not
//   available"), from Nasdaq's public stock screener (every US-listed line);
//   a line the screener does not price stays:
//     https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
// "Most US equities" names no other exclusion, so nothing else is removed.
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the PDF only
// lists OTC lines it refuses, never says which OTC lines it takes.
// Not a removal, a remark: Access Direct is "Available only to stock plan
// participants"; purchases are "blocked at > $500,000 or >25,000 shares".
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online stocks and ETFs; $25 representative-assisted):
//   https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details
//
//   node brokers/morganstanleyacc/morganstanleyacc_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { houseTicker, usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PRICING = "https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details";
const SCREENER = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const MIN_PRICE = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The pricing page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#43;/g, "+")
    .replace(/&#36;/g, "$")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// House ticker -> last sale in dollars (screener BRK/B is BRK.B).
async function lastSales() {
  const body = await getJson(SCREENER);
  const list = body?.data?.rows || body?.data?.data?.rows;
  if (!Array.isArray(list) || list.length < 5000) throw new Error(`Nasdaq stock screener: ${Array.isArray(list) ? list.length : "no"} rows`);
  const prices = new Map();
  for (const item of list) {
    const price = Number(String(item.lastsale ?? "").replace(/[$,\s]/g, ""));
    const ticker = houseTicker(String(item.symbol || "").trim().toUpperCase().replace(/\//g, ".").replace(/\^/g, "$"));
    if (item.symbol && Number.isFinite(price) && price > 0) prices.set(ticker, price);
  }
  const apple = prices.get("AAPL");
  if (!(apple > 20 && apple < 2000)) throw new Error(`Nasdaq screener prices AAPL at ${apple}`);
  return prices;
}

// Inverse or leveraged fund, read from its name.
const BOND_TERM = "term|duration|maturity|dated|treasury|bond|income|government|corporate|municipal|muni|high|tips|inflation|investment|u\\.s|us|t-bill|interest|real|fixed|horizon";
const MULTIPLE = /(?:^|[\s(])-?(?:[2-9]|\d\.\d+)\s?x\b|(?:^|[\s(])-\d+(?:\.\d+)?\s?x\b|(?:^|\s)-?\d+(?:\.\d+)?\s?[×?](?=\s)/i;
const SHORT = new RegExp(`(?<!long[/ -]|ultra[- ])\\bshort\\b(?![- ](?:${BOND_TERM})\\b)`, "i");
function levered(name) {
  const text = name.replace(/[®™]/g, "");
  if (MULTIPLE.test(text)) return true;
  if (/\bultra(?:pro|short)|^proshares (?:ultra|short)\b/i.test(text)) return true;
  if (/\binverse\b|\bleveraged\b(?! loan)/i.test(text)) return true;
  if (/\b(?:bull|bear)\b/i.test(text) && !/\b(?:bull|bear) hedge\b|\bbond bull\b/i.test(text)) return true;
  if (/^leverage shares\b.*\bdaily\b/i.test(text)) return true;
  return SHORT.test(text);
}

await evidence(PRICING, [/Stocks \+ ETFs \$0/i, /Available only to stock plan participants/i, /Trade Restrictions/i]);

const rows = await usBook({ preferreds: false });
const prices = await lastSales();
const lever = [];
const cheap = [];
const offered = rows.filter((row) => {
  if (row.type !== "STOCK" && levered(row.name)) {
    lever.push(row.ticker);
    return false;
  }
  const price = prices.get(row.ticker);
  if (row.type === "STOCK" && price !== undefined && price < MIN_PRICE) {
    cheap.push(`${row.ticker} $${price}`);
    return false;
  }
  return true;
});
const kept = stampRows(withoutObligations(offered));
if (kept.length < 8000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("morganstanleyacc-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
console.error(`${rows.filter((row) => row.type === "STOCK" && prices.has(row.ticker)).length} of ${rows.filter((row) => row.type === "STOCK").length} share lines priced by the Nasdaq screener`);
console.error(`left out ${lever.length} inverse/leveraged funds (${lever.slice(0, 12).join(", ")}, ...)`);
console.error(`left out ${cheap.length} shares under $${MIN_PRICE} (${cheap.slice(0, 12).join(", ")}${cheap.length > 12 ? ", ..." : ""})`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < offered.length) console.error(`${offered.length - kept.length} bonds left out`);
