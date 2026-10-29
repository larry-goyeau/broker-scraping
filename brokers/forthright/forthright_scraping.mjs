// What Forthright Securities and Investments sells online, with no login:
// every share and ETF on the Nigerian Exchange. Its Security Dealing page
// says "We provide Direct Market Access to The Nigerian Stock Exchange for
// our institutional and retail clients through our FIX enabled online
// trading portal ForthTrader", and the ForthTrader page: "ForthTrader
// enables clients to execute their own orders on The NSE in real time". No
// page excludes a board, a segment or ETFs, and none names a list of its
// own, so the book is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there).
//
// NASD OTC is left out, as the broker-list row says ("By phone/advisor
// only"): the firm deals in "securities listed on both The Nigerian Stock
// Exchange and NASD OTC Exchange", but its online channel, ForthTrader,
// reaches the NSE only; other orders are "Care Orders" worked by its
// traders. Bonds are not written. Everything trades in naira.
//
// Fees: the home page's "Investment Calculator" prefills "Transaction
// Charges (%)" with 1.7925, the all-in charge (brokerage, VAT and the
// regulatory fees) it applies to the consideration of a buy or a sale
// (my-js.js: ((charges / 100) + 1) * price * quantity). The run checks
// the field and its value.
//
//   https://www.forthrightsec.com/
//   https://www.forthrightsec.com/page.php?tab=page&pId=6&mpTitle=Services&pTitle=Security%20Dealing
//   https://www.forthrightsec.com/page.php?tab=page&pId=13&mpTitle=Products&pTitle=ForthTrader
//
//   node brokers/forthright/forthright_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://www.forthrightsec.com/page.php?tab=page&pId=6&mpTitle=Services&pTitle=Security%20Dealing": [
    /We provide Direct Market Access to The Nigerian Stock Exchange for our institutional and retail clients through our FIX enabled online trading portal ForthTrader/,
    /Care Orders/,
  ],
  "https://www.forthrightsec.com/page.php?tab=page&pId=13&mpTitle=Products&pTitle=ForthTrader": [
    /ForthTrader enables clients to execute their own orders on The NSE in real time/,
  ],
  "https://www.forthrightsec.com/": [/Investment Calculator/, /Transaction Charges \(%\)/],
};
const RAW = {
  "https://www.forthrightsec.com/": [
    /<label>Transaction Charges \(%\)<\/label> <input name="commission" type="text" class="form-control" id="commission" value="1\.7925" \/>/,
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = plain(await fetchText(url));
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(500);
}

// Pages whose evidence sits in the HTML or script source, not the visible text.
for (const [url, patterns] of Object.entries(RAW)) {
  const source = (await fetchText(url)).replace(/\s+/g, " ");
  for (const pattern of patterns) {
    if (!pattern.test(source)) throw new Error(`${url} no longer has ${pattern}`);
  }
  await sleep(500);
}

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("forthright-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `forthright: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
