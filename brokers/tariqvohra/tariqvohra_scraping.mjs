// What Tariq Vohra Securities sells in shares and ETFs, with no login: the
// whole Pakistan Stock Exchange ready market, its only place. The firm is a
// "PSX TREC Holder" and its online trading terms say it "will act as the
// Broker for the purpose of buying and selling securities at the Stock
// Exchange", the Pakistan Stock Exchange being "the primary platform where
// these transactions take place". Its FAQ restricts order types, not lines:
// "Short Sell orders for regular market are not allowed" and the account
// "is 100% cash based and no margin facility is available". No page
// excludes a board, a segment, ETFs or a list of symbols, so the book is
// the exchange's whole regular market.
//
//   https://tvspl.com/
//   https://tvspl.com/internet-trading/
//   https://tvspl.com/faq-2/
//
// The list is the exchange's own regular deliverable market (REG.xml), read
// by brokers/nextcapital/psxBook.mjs:
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares (preference shares, modarabas and REITs too) and the ETFs,
// in rupees on XKAR. Left out there: rights, closed-end funds, debt lines,
// and companies the exchange prints as delisted or suspended or that have
// not traded for six months (psxStatus.mjs). GEM Board lines stay with the
// accredited-investor remark; lines on the non-compliant counter stay with
// their remark.
//
// Fees: the "Schedule of Charges", linked from the home page ("For Shedule
// of Charges and Commission"): commission per share by price, "0 TO 2"
// 0.03, "2.0001 TO 9.99" 0.05, "9.9901 TO 66.00" 0.10, "66.0001 TO
// 999,999.99" .15%; Sindh Sales Tax 13% on commission; CDC transaction fee
// 0.0004%, NCCPL .00322%, SECP .00065% and PSX .00350% of the trade value;
// CDC custody .005625% a year; CDC sub-account Rs 400 and UIN Rs 200 a year.
// The FAQ: "Minimum .03 paisa per share".
//
//   https://tvspl.com/pdf/scheduleofcharges.pdf
//
//   node brokers/tariqvohra/tariqvohra_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("tariqvohra-parsed.json", import.meta.url);
const SCHEDULE = "https://tvspl.com/pdf/scheduleofcharges.pdf";
const EVIDENCE = {
  "https://tvspl.com/": [/PSX TREC Holder/, /pdf\/scheduleofcharges\.pdf/],
  "https://tvspl.com/internet-trading/": [/buying and selling securities at the Stock Exchange/],
  "https://tvspl.com/faq-2/": [/Minimum \.03 paisa per share/, /Short Sell orders for regular market are not allowed/],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBody(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.cause?.message || error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = plain((await fetchBody(url)).toString("utf8"));
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(800);
}
const schedule = await fetchBody(SCHEDULE);
if (schedule.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${SCHEDULE} is no longer a PDF`);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`tariqvohra: ${rows.length} rows. ${psxBookSummary(rows)}`);
