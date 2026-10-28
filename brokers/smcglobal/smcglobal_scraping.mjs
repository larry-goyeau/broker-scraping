// What SMC Global (SMC Global Securities Ltd, India) sells in shares and
// ETFs, with no login. SMC publishes no scrip master: its equity and ETF
// sitemaps give name slugs only, with no ticker or ISIN.
//
// NSE and BSE. The Nirvana plan prices equity delivery and intraday
// ("Delivery brokerage of 0.20%", "Intraday brokerage of 0.02%" after the
// first 30 days) with no excluded segment, group or kind of listed share,
// so the book is the whole NSE and BSE cash book of the day, shares and
// ETFs, minus suspended, delisted and not-yet-listed lines, rights
// entitlements and fund units that are not ETFs (../bajaj/indiaBook.mjs).
// One row per exchange for a title on both, in INR.
//
// Abroad. SMC's international broking page: "SMC Global Securities Ltd., as
// an introducing broker to Saxo Bank, Denmark, provides you instant access
// to global financial markets" and "you can trade in Stocks, ETFs and Bonds
// on more than 36 of the world's major stock exchanges directly, putting
// over 18,400 global Stocks at your fingertips. Whether you are interested
// in Stocks from the US, Europe or Asia ...". The offer is Saxo Bank's
// own: the catalogue read from a Saxo Banque France account (Saxo Bank
// A/S's French branch, ../saxofr) holds 18,805 shares, the count SMC gives,
// so its rows are copied whole, the US included (owner, 2026-10-26), in
// place of the whole US exchange book. Its ETFs, ETNs and ETCs come with
// it. The rows flagged nonEuResident (US ETFs with no KID, sell-only for
// an EU retail account) stay: SMC's clients are not EU residents. Saxo may
// close other lines to Indian residents; no public page says which, so
// none is removed. broker-list.json gives SMC the United States only.
// SMC publishes no tariff of its own for these trades.
//
//   https://www.smctradeonline.com/demat-nirvana-plan
//   https://smcindiaonline.com/international-broking/
//   ../saxofr/saxofr-parsed.json   (refreshed by ../saxofr/saxofr_scraping.mjs)
//
//   node brokers/smcglobal/smcglobal_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.smctradeonline.com/demat-nirvana-plan", [/Delivery brokerage of 0\.20%/i]);
await pageSays("https://smcindiaonline.com/international-broking/", [
  /as an introducing broker to Saxo Bank, Denmark/i,
  /trade in Stocks, ETFs and Bonds on more than 36 of the world's major stock exchanges/i,
  /Stocks from the US, Europe or Asia/i,
  /over 18,400 global Stocks/i,
]);

const india = wholeIndia(await indiaLists());
const saxoFile = new URL("../saxofr/saxofr-parsed.json", import.meta.url);
const saxo = JSON.parse(fs.readFileSync(saxoFile, "utf8")).map((row) => ({ ...row }));
const saxoShares = saxo.filter((row) => row.type === "STOCK").length;
if (saxoShares < 18400) throw new Error(`Saxo catalogue has ${saxoShares} shares, under SMC's 18,400`);
const rows = stampRows(withoutObligations([...india, ...saxo]));
if (rows.length < 35000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("smcglobal-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`Saxo catalogue of ${fs.statSync(saxoFile).mtime.toISOString().slice(0, 10)}: ${saxo.length} rows, ${saxoShares} shares`);
