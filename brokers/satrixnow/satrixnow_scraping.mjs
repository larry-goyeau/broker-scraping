// SatrixNOW sells only Satrix products: the full range of Satrix ETFs and
// unit trusts. Satrix publishes its fund range as a filterable product page
// with no login. Each card carries the product name and, per share class,
// the minimum-disclosure link named after the JSE code (/fund/mdd/STX40).
//
//   https://satrix.co.za/platform
//   https://satrix.co.za/api/products/search/filter?fundType=ETF&categoryId=1
//   https://satrix.co.za/api/products/search/filter?fundType=AMETF&categoryId=1
//   https://satrix.co.za/daily-fund-prices?fundtype=ETF  (count check)
//
// Index ETFs (type E) and actively managed ETFs (type A) are kept; they are
// listed on the JSE in rand. Unit trusts, retirement plans and the
// Botswana/Kenya feeder classes are not exchange-listed and are skipped.
// The site does not show ISINs.
//
//   node brokers/satrixnow/satrixnow_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH = "https://satrix.co.za/api/products/search/filter";
const PRICES = "https://satrix.co.za/daily-fund-prices?fundtype=ETF";
const KINDS = ["ETF", "AMETF"];

function decode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const rows = [];
const seen = new Set();
for (const kind of KINDS) {
  const params = new URLSearchParams({ risk: "0", fundType: kind, assetclass: "0", order: "0", categoryId: "1" });
  const page = await get(`${SEARCH}?${params}`);
  const cards = page.split('<div class="card">').slice(1);
  if (!cards.length) throw new Error(`${kind}: no product cards`);
  for (const card of cards) {
    const name = decode(card.match(/<h4 class="card-title"[^>]*>\s*<a[^>]*>([^<]*)<\/a>/)?.[1]);
    for (const [, letter, code] of card.matchAll(/mdd-icon\s+type_([A-Z])"\s+href="\/fund\/mdd\/([A-Z0-9]+)"/g)) {
      if (letter !== "E" && letter !== "A") continue;
      if (seen.has(code)) continue;
      seen.add(code);
      const label = /\bETF\b/.test(name) ? name : `${name} ETF`;
      rows.push({
        query: code,
        ticker: code,
        name: label,
        exchange: "JSE",
        mic: "XJSE",
        currency: "ZAR",
        type: "ETF",
        isin: "",
        raw: [code, name, kind].join(" | "),
      });
    }
  }
  await sleep(300);
}

// The daily price list names every index ETF; the product page must cover it.
const prices = await get(PRICES);
const priced = (prices.match(/Satrix [^<]*? ETF\s*</g) || []).length;
const index = rows.filter((row) => row.raw.endsWith("| ETF")).length;
if (index < priced) throw new Error(`product page has ${index} index ETFs, daily prices list ${priced}`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("satrixnow-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({ "JSE ETF": rows.length, "daily price list": priced });
