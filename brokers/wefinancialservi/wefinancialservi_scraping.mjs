// What WE Financial Services sells in shares and ETFs, with no login: the
// whole Pakistan Stock Exchange ready market, its only place. Its online
// service WEonline.biz offers Vtrade, which "brings the PSX at your
// fingertips"; "Any person wishing to trade on the Karachi Stock Exchange
// can sign up" (FAQ 4). The FAQ names what it does not offer: "WEonline.biz
// is currently not offering trading in futures" (FAQ 14) and "not offering
// trading in physical shares" (FAQ 15). Futures are not listed shares, and
// physical certificates are a form of holding, not a line, so neither
// removes a line here. No page excludes a board, a segment, ETFs or a list
// of symbols, so the book is the exchange's whole regular market.
//
//   https://weonline.biz/WENEW/onlinetrading.php
//   https://weonline.biz/WENEW/faq.php
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
// Fees: the "Commision Structure" page says "WE are providing standard
// commission as guided in following document of PSX" and links the PSX
// notice PSX/N-1258 (9 October 2019): ready market "3p or 0.15% whichever
// is higher", "up to 2.5% of the transaction value", "Commission is
// exclusive of levies". The same page lists share transfer at Rs .01 per
// share in and out and right subscription at 5 paisa a share; the FAQ says
// "You can trade from as low* as 3 paisa" and there are "no fees applicable
// to maintain a WEonline.biz account".
//
//   https://weonline.biz/WENEW/commission.php
//   https://www.weonline.biz/downloads/PSXSLAB.pdf
//
//   node brokers/wefinancialservi/wefinancialservi_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("wefinancialservi-parsed.json", import.meta.url);
const SLAB = "https://www.weonline.biz/downloads/PSXSLAB.pdf";
const EVIDENCE = {
  "https://weonline.biz/WENEW/commission.php": [/providing standard commission as guided in following document of PSX/, /downloads\/PSXSLAB\.pdf/],
  "https://weonline.biz/WENEW/onlinetrading.php": [/brings the PSX at your fingertips/],
  "https://weonline.biz/WENEW/faq.php": [
    /Any person wishing to trade on the Karachi Stock Exchange can sign up/,
    /not offering trading in futures/,
    /as low\* as 3 paisa/,
  ],
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
const slab = await fetchBody(SLAB);
if (slab.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${SLAB} is no longer a PDF`);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`wefinancialservi: ${rows.length} rows. ${psxBookSummary(rows)}`);
