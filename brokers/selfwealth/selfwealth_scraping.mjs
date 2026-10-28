// What SelfWealth (SelfWealth Pty Ltd, AFSL 421789, part of Syfe; US side
// through Alpaca Securities) sells in shares and ETFs, with no login. It
// publishes no list of titles, but states how many it offers on each side:
//
//   Pricing: "Selfwealth investors pay $9.50 flat brokerage per trade.
//   Access over 1,800 ordinary shares and over 270 Australian ETFs." and,
//   for US shares and ETFs, "$0 USD brokerage until 31 October 2026, then
//   $9.50 USD flat per trade. Access over 5,000 stocks and over 3,000 US
//   ETFs."
//   AUS trading: "investors have access to over 1,800 shares and over 270
//   ETFs listed on the ASX" and (its card) "Australian shares and ETFs, on
//   the ASX and TMX." TMX Australia is Cboe Australia renamed: "TMX
//   Australia Exchange (formerly Cboe Australia)" (same page, FAQ).
//   Trade: "Selfwealth offers over 8,000 US stocks and ETFs on the NYSE and
//   the Nasdaq."
//
//   https://www.selfwealth.com.au/pricing
//   https://www.selfwealth.com.au/aus-trading
//   https://www.selfwealth.com.au/us-trading
//   https://www.selfwealth.com.au/trade
//
// The owner's rule for a stated count: the place's N most popular titles,
// N per kind when the broker splits shares and ETFs. Popularity is the
// average daily traded value (30-day average volume x last close).
//
// Australia. The whole ASX book (../sequoiadirect/asxBook.mjs: quoted
// shares and exchange-traded products, less suspended and delisted codes,
// options, warrants, hybrids, preference shares and partly-paid lines;
// about 1,830 shares and 480 ETFs), ranked by ./asxPopular.mjs
// (TradingView's Australian screener): the top 1,800 shares and the top 270
// ETFs, the numbers read from the pricing page at run time. Each kept
// title quoted on Cboe Australia (TMX) for on-market trading gets a second
// row there, same ISIN (../netwealth/australia.mjs). The funds listed on
// Cboe alone are not added: the counts are of titles "listed on the ASX".
//
// United States. The whole US exchange book (../wellstrade/usBook.mjs: no
// OTC, warrants, rights, units or notes; halted lines out), on the venues
// the pages name: "the NYSE and the Nasdaq". NYSE is read as the NYSE
// group's listing venues (NYSE, NYSE American, NYSE Arca): NYSE and Nasdaq
// alone list about 1,400 ETFs, fewer than the "over 3,000 US ETFs" stated,
// and most US ETFs list on NYSE Arca. Cboe BZX and the Texas exchanges are
// left out. Then the top 5,000 shares (STOCK) and the top 3,000 ETFs and
// ETNs, ranked by ../wellstrade/usPopular.mjs. One row per title.
// broker-list.json gives ASX, Cboe Australia, NYSE, Nasdaq, NYSE American,
// NYSE Arca and Hong Kong; no SelfWealth page offers Hong Kong today, so
// none is added.
//
//   node brokers/selfwealth/selfwealth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { australianRows, fetchWith, pageText } from "../netwealth/australia.mjs";
import { asxBook } from "../sequoiadirect/asxBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";
import { asxTopN } from "./asxPopular.mjs";

const SITE = "https://www.selfwealth.com.au";
const US_VENUES = new Set(["XNYS", "XNAS", "XASE", "ARCX"]);
const number = (text) => Number(String(text).replace(/,/g, ""));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function says(path, pattern) {
  const text = pageText(await fetchWith(`${SITE}/${path}`));
  const found = text.match(pattern);
  if (!found) throw new Error(`${SITE}/${path} no longer says ${pattern}`);
  await sleep(800);
  return found;
}

const pricing = await says("pricing", /\$9\.50 flat brokerage per trade\. Access over ([\d,]+) ordinary shares and over ([\d,]+) Australian ETFs/);
const usPricing = await says("pricing", /Access over ([\d,]+) stocks and over ([\d,]+) US ETFs/);
await says("aus-trading", /access to over [\d,]+ shares and over [\d,]+ ETFs listed on the ASX/);
await says("trade", /over [\d,]+ US stocks and ETFs on the NYSE and the Nasdaq/);
if (/Hong Kong|HKEX/i.test(pageText(await fetchWith(`${SITE}/trade`)))) console.error("SelfWealth's trade page now names Hong Kong: look for that place");

// The "on the ASX and TMX" card is rendered from one of the page's Framer modules.
const ausPage = await fetchWith(`${SITE}/aus-trading`);
const modules = [...new Set(ausPage.match(/https:\/\/framerusercontent\.com\/sites\/[^"']+\.mjs/g) || [])];
let tmx = false;
for (const url of modules) {
  if ((await fetchWith(url)).includes("Australian shares and ETFs, on the ASX and TMX.")) tmx = true;
  if (tmx) break;
}
if (!tmx) throw new Error(`${SITE}/aus-trading no longer says "Australian shares and ETFs, on the ASX and TMX."`);

const counts = { asxShares: number(pricing[1]), asxEtfs: number(pricing[2]), usShares: number(usPricing[1]), usEtfs: number(usPricing[2]) };

const { rows: asx, dropped } = await asxBook();
const asxShares = await asxTopN(asx, counts.asxShares, { types: ["STOCK"] });
const asxEtfs = await asxTopN(asx, counts.asxEtfs, { types: ["ETF"] });
if (asxShares.length < counts.asxShares || asxEtfs.length < counts.asxEtfs) {
  throw new Error(`the ASX book holds ${asxShares.length} shares and ${asxEtfs.length} ETFs, fewer than the stated ${counts.asxShares} and ${counts.asxEtfs}`);
}
const asxKept = new Set([...asxShares, ...asxEtfs].map((row) => row.ticker));
const both = await australianRows({ places: ["ASX", "Cboe Australia"] });
const cboe = both.rows.filter((row) => row.exchange === "Cboe Australia" && !row.raw.endsWith("Cboe listed list") && asxKept.has(row.ticker));

const us = (await usBook()).filter((row) => US_VENUES.has(row.mic));
const usShares = await topN(us, counts.usShares, { types: ["STOCK"] });
const usEtfs = await topN(us, counts.usEtfs, { types: ["ETF", "ETN"] });
if (usShares.length < counts.usShares || usEtfs.length < counts.usEtfs) throw new Error(`the US book is short of the stated counts`);

for (const [ticker, exchange] of [["BHP", "ASX"], ["BHP", "Cboe Australia"], ["VAS", "ASX"], ["AAPL", "XNAS"], ["SPY", "ARCX"]]) {
  if (![...asxShares, ...asxEtfs, ...cboe, ...usShares, ...usEtfs].some((row) => row.ticker === ticker && row.exchange === exchange)) {
    throw new Error(`${ticker} is missing on ${exchange}`);
  }
}

const kept = stampRows(withoutObligations([...asxShares, ...asxEtfs, ...cboe, ...usShares, ...usEtfs]));
fs.writeFileSync(new URL("selfwealth-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const table = {};
for (const row of kept) table[`${row.exchange} ${row.type}`] = (table[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`selfwealth: ${kept.length} rows, ${kept.filter((row) => row.isin).length} with ISIN; stated ${JSON.stringify(counts)}`);
console.table(table);
for (const [label, list] of [["ASX shares", asxShares], ["ASX ETFs", asxEtfs], ["US shares", usShares], ["US ETFs/ETNs", usEtfs]]) {
  const { among, cutoff, firstLeftOut, keptNoData } = list.report;
  console.error(`${label}: top ${list.length} of ${among}; last kept ${typeof cutoff === "string" ? cutoff : cutoff?.text}; first left out ${firstLeftOut}${keptNoData ? `; ${keptNoData} kept without data` : ""}`);
}
console.error("ASX left out before ranking", Object.fromEntries(dropped));
