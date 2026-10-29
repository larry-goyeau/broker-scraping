// Wealth Securities, Inc. (WealthSec, Manila, PSE member since 1986) sells
// online on one place, the Philippine Stock Exchange. Its FAQ: "Wealth
// Securities Online is the online stock trading of Wealth Securities, Inc.
// (WSI), a leading member-firm of the Philippine Stock Exchange", and its
// platforms are "the most advanced online trading platform in the
// Philippine stock market". It prints no list and names no board or
// security it leaves out (only odd lots, a separate board-lot remainder
// market, are "broker-assisted"), so the catalogue is every open PSE line,
// ETFs, REITs and dollar lines included. Mutual funds on the app are not
// this market.
//
// The site is a single-page app: the FAQ text sits in its JavaScript
// bundle, which is read (the bundle's name changes with each build, so it
// is taken from the FAQ page). The run stops when the online-trading and
// commission sentences are gone.
//
//   https://wealthsec.com/faqs/
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
// Fees ("What fees does WealthSec charge?"): "Broker's Commission: 0.250%
// of the gross amount of purchases" (and of the gross selling price), VAT
// 12% of the commission, PSE fee 0.005%, SCCP fee 0.010%, sales tax 0.100%
// on a sale.
//
//   node brokers/wealthsec/wealthsec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

const FAQ = "https://wealthsec.com/faqs/";
const html = await pageSays(FAQ, [/\/assets\/index-[\w-]+\.js/], { raw: true });
const bundle = new URL(html.match(/\/assets\/index-[\w-]+\.js/)[0], FAQ).href;
await pageSays(
  bundle,
  [
    /Wealth Securities Online is the online stock trading of Wealth Securities, Inc\. \(WSI\), a leading member-firm of the Philippine Stock Exchange/,
    /What fees does WealthSec charge\?/,
    /Broker's Commission: 0\.250% of the gross amount of purchases/,
  ],
  { raw: true }
);

const rows = await writePseCatalogue(import.meta.url, "wealthsec-parsed.json", { mic: "XPHS" });
if (rows.length < 250) throw new Error(`only ${rows.length} PSE rows`);
