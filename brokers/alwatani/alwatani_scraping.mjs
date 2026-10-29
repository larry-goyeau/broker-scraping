// What Al Watani Trade, the online trading service of the National Bank of
// Bahrain (NBB), sells in shares, with no login: every share listed on
// Bahrain Bourse, its one place. The product page says it "empowers
// investors to trade stocks and other financial instruments directly on the
// Bahrain Bourse", and the FAQ names Bahraini dinars as the one trading
// currency and lets clients transfer in shares "only in Bahrain". No page
// names a list of its own or excludes a board, so the book is the bourse's
// whole listing, read by ./bahrainBook.mjs (what is kept and left out is
// written there): the main market, the two cross-listed foreign shares and
// the Bahrain Investment Market. The bourse lists no ETF. A few shares
// trade in dollars on the bourse (ABC, ARIG, GFH, INOVEST, ITHMR, KFH); the
// row keeps the bourse's currency.
//
// Fees: the Al Watani Trade FAQ (an image PDF linked from the bank's
// documents), "What are the commissions for trading equities? Minimum
// commission is BHD 5 with a variable 0.20%." The run checks that the PDF is
// still served, since its text cannot be read without OCR.
//
//   https://nbbonline.com/personal/al-watani-trade/
//   https://nbbonline.com/wp-content/uploads/2024/11/Al-Watani-Trade-FAQs.pdf
//
//   node brokers/alwatani/alwatani_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bahrainBook } from "./bahrainBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PAGE = "https://nbbonline.com/personal/al-watani-trade/";
const FAQ = "https://nbbonline.com/wp-content/uploads/2024/11/Al-Watani-Trade-FAQs.pdf";
const EVIDENCE = [/trade stocks and other financial instruments directly on the Bahrain Bourse/, /Al Watani Trade/];

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

const page = textOf(await (await get(PAGE)).text());
for (const pattern of EVIDENCE) if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
const faq = Buffer.from(await (await get(FAQ)).arrayBuffer());
if (faq.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${FAQ} is no longer a PDF`);

const { rows, leftOut } = await bahrainBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 32) throw new Error(`only ${kept.length} Bahrain Bourse rows`);
fs.writeFileSync(new URL("alwatani-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.currency] = (count[row.currency] || 0) + 1;
console.error(
  `alwatani: ${kept.length} rows (Bahrain Bourse STOCK; ${Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ")}). ` +
    `Left out: ${leftOut.join(", ") || "none"}.`
);
