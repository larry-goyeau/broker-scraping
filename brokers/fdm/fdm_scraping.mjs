// What FDM Capital Securities sells in shares and ETFs, with no login: the
// whole Pakistan Stock Exchange ready market, its only place for equities.
// FDM is a "Corporate Member of the Pakistan Stock Exchange" and its
// services page says it "facilitates trading on all counters of PSX"
// (Regular, Future, Continuous Funding, Odd Lot, IPO and Cash Settled
// Future markets); its online trading "facilitates online trading in all
// counters of the Pakistan Stock Exchange". Its National Commodity Exchange
// membership is not a share listing. No page excludes a board, a segment,
// ETFs or a list of symbols, so the book is the exchange's whole regular
// market (the other boards hold the same companies or no equity).
//
//   https://fdm.com.pk/our_services/online_trading
//   https://fdm.com.pk/faq
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
// Fees: the home page's "Commission Slab", "Client Charges Detail": share
// price "0.0000 - 20.0000" Rs 0.0300 a share, "20.0001 - 99999.9999"
// 0.1500%. The FAQ's older answer says "minimum 5 paisa per share on shares
// valued up to Rs. 25"; the home page slab is the current one.
//
//   https://fdm.com.pk/
//
//   node brokers/fdm/fdm_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("fdm-parsed.json", import.meta.url);
const EVIDENCE = {
  "https://fdm.com.pk/": [/Commission Slab/, /0\.0000 - 20\.0000 0\.0300/, /20\.0001 - 99999\.9999 0\.1500%/],
  "https://fdm.com.pk/our_services/online_trading": [
    /facilitates trading on all counters of PSX/,
    /online trading in all counters of the Pakistan Stock Exchange/,
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = plain(await fetchText(url));
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(800);
}

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`fdm: ${rows.length} rows. ${psxBookSummary(rows)}`);
