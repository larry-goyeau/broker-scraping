// What xCube (X CUBE LLC, Abu Dhabi) sells, with no login: every share and
// ETF of the Dubai Financial Market and the Abu Dhabi Securities Exchange,
// its two places, all online (app and web). Its DFM page says "As a
// registered trading and clearing member of DFM, xCube gives investors
// digital access to companies and securities listed on the market"; its ADX
// page, "As an approved trading and clearing member of ADX, xCube provides
// investors with digital access to companies listed on the exchange"; its
// shares page offers "Trade ETFs: Access ETFs through xCube". No page names a list of its own or excludes a board, so
// the book is both exchanges' own listings, read by
// ../alwathbah/uaeBook.mjs (what is kept and left out is written there).
// Bonds, which both market pages also name, are not shares and stay out.
// Nasdaq Dubai is named nowhere on the site and is left out. Everything
// trades in dirhams.
//
// Fees: DFM page, "Broker Commission 0.125% + VAT", market 0.10% + VAT and
// AED 10.50 a trade, CMA 0.05%; ADX page, "Broker Commission 0.125% + VAT",
// "Other Commission 0.025% + VAT"; pricing page: "Broker commission has
// changed from 0.10% to 0.125% effective since 11/02/2026".
//
//   https://xcube.ae/markets/dfm/
//   https://xcube.ae/markets/adx/
//   https://xcube.ae/trade/shares/
//   https://xcube.ae/pricing/
//
//   node brokers/xcube/xcube_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { adxListings, dfmListings } from "../alwathbah/uaeBook.mjs";

const SITE = "https://xcube.ae";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EVIDENCE = [
  [`${SITE}/markets/dfm/`, [/registered trading and clearing member of DFM, xCube gives investors digital access to companies and securities listed on the market/, /Broker Commission 0\.125% \+ VAT/]],
  [`${SITE}/markets/adx/`, [/approved trading and clearing member of ADX, xCube provides investors with digital access to companies listed on the exchange/, /Broker Commission 0\.125% \+ VAT/]],
  [`${SITE}/trade/shares/`, [/Access ETFs through xCube/]],
  [`${SITE}/pricing/`, [/Broker commission has changed from 0\.10% to 0\.125%/]],
];
const FLOOR = { "DFM STOCK": 55, "ADX STOCK": 80, "ADX ETF": 10 };

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return textOf(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

for (const [url, patterns] of EVIDENCE) {
  const text = await getText(url);
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  if (/Nasdaq Dubai/i.test(text)) console.error(`${url} now names Nasdaq Dubai: consider adding it`);
}

const [dfm, adx] = await Promise.all([dfmListings(), adxListings()]);
const kept = stampRows(withoutObligations([...adx.rows, ...dfm.rows]));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, floor] of Object.entries(FLOOR)) if ((count[key] || 0) < floor) throw new Error(`only ${count[key] || 0} ${key} rows`);
fs.writeFileSync(new URL("xcube-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const skipped = (leftOut) => Object.entries(leftOut).map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `xcube: ${kept.length} rows; ` +
    Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ") +
    `. Left out: ADX ${skipped(adx.leftOut)}; DFM ${skipped(dfm.leftOut)}.`
);
