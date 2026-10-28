// What Fortune Securities sells in shares and ETFs, with no login: the whole
// Pakistan Stock Exchange ready market, its only place for equities. The
// broker is "one of the leading members of the Pakistan Stock Exchange";
// its online division Fortune Connect "provides robust online trading
// access for investments in Pakistan Stock Exchange (PSX)". Its other
// business, commodities, is PMEX futures ("spot and future contracts offered
// by PMEX"), not a PSX listing. No page excludes a board, a segment, ETFs or
// a list of symbols, so the book is the exchange's whole regular market.
//
//   https://fortunesecurities.com/
//   https://fortunesecurities.com/page-equities
//   https://fortunesecurities.com/fortune-connect
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
// Fees: "Commission Schedule (Standard Range/Scale of Brokerage Commission
// with the approval of SECP as per PSX/N-1258)", linked as "Commission
// Structure" from the equities page: "Regular Market (Delivery and Square
// Trades) One Side 0.01 & Above 0.15% 0.03 Paisas", commission "exclusive of
// levies", Sindh Sales Tax 13% on commission; CDC sub-account Rs. 400 p.a.,
// UIN Rs. 200 p.a., CKO Rs. 75 p.a.; clearing, regulatory, NCCPL and CDC
// charges "Nil (Borne by Broker)".
//
//   https://fortunesecurities.com/webImages/doc/Tariff-Fortune-Securities-Ltd.pdf
//
//   node brokers/fortune/fortune_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("fortune-parsed.json", import.meta.url);
const TARIFF = "https://fortunesecurities.com/webImages/doc/Tariff-Fortune-Securities-Ltd.pdf";
const EVIDENCE = {
  "https://fortunesecurities.com/": [/leading members of the Pakistan Stock Exchange/, /investments in Pakistan Stock Exchange \(PSX\)/],
  "https://fortunesecurities.com/page-equities": [/Commission Structure/, /Tariff-Fortune-Securities-Ltd\.pdf/],
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
const tariff = await fetchBody(TARIFF);
if (tariff.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${TARIFF} is no longer a PDF`);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`fortune: ${rows.length} rows. ${psxBookSummary(rows)}`);
