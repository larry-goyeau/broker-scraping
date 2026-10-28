// What Mox Bank (Hong Kong's Standard Chartered-backed digital bank) sells
// in shares and ETFs through Mox Invest, with no login. Its invest page:
// "Explore global opportunities with HK stocks, US stocks and ETFs –
// including fractional shares, crypto ETFs, leveraged ETFs and inverse
// ETFs." Its Mox Invest FAQ names the scope of each market:
//   "Currently, Mox supports trading of ordinary shares and exchange traded
//   funds (ETFs) listed on the HK markets, including crypto spot ETFs,
//   crypto futures ETFs and synthetic ETFs."
//   "Currently, Mox does not support trading of derivative warrants, inline
//   warrants and callable bull/bear contracts (CBBCs) listed on the HK
//   market."
//   "Currently, Mox supports trading of ordinary shares and certain exchange
//   traded funds (ETFs) listed on the US markets, including crypto futures
//   ETFs and synthetic ETFs."
//   "Currently, Mox does not support trading of derivatives and OTC traded
//   securities in the US markets."
//   "Currently Mox only offers HK crypto ETFs denominated in HKD and US
//   crypto ETFs denominated in USD."
//   https://mox.com/features/mox-invest/
//   https://mox.com/faqs/mox-invest/
// The Mox Invest schedule (terms) names the US exchanges "including but not
// limited to, NASDAQ, New York Stock Exchange (NYSE), NYSE American (AMEX),
// NYSE ARCA and BATS Global Exchange", so no US venue is cut (owner rule:
// named venues only when the broker implies no others).
//   https://mox.com/static/260331_Mox_Invest_Schedule.pdf
// Fees (Mox Invest Fees and Charges, 16 March 2026): HK 0.18% to 0.10%
// (min HKD35) by Invest tier, US USD0.015 to 0.009 a share (min USD10).
//   https://mox.com/static/260316_Mox_Invest_Fees_and_Charges.pdf
// No page states how many titles Mox offers, and no page lists them.
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs: HKEX's List of
// Securities, less the lines suspended, never traded or not quoted, and the
// temporary counters) cut to what the FAQ names, ordinary shares and ETFs:
// - REITs are neither (trust units), so they are left out;
// - the leveraged and inverse products stay, the invest page selling
//   "leveraged ETFs and inverse ETFs";
// - RMB (CNH) counters are left out: a Mox Invest account holds HKD and USD
//   ("switch between HKD and USD with ease"), and the FAQ above keeps the HK
//   crypto ETFs to their HKD counters, so their USD counters go too. The
//   other USD counters stay.
// United States: Mox publishes no list, so the whole US exchange book of
// the day (../wellstrade/usBook.mjs: one NBBO market, one row a title on its
// primary listing; warrants, rights, units, listed notes and halted lines
// are left out there; no OTC line is in it), cut to ordinary shares and
// ETFs: preferred shares, closed-end funds (usBook's options) and ETNs
// (notes) are left out. Leveraged, inverse and crypto ETFs stay.
//
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt, otherlisted.txt
//
//   node brokers/mox/mox_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import fs from "node:fs";

const FOLDER = "mox";
const CRYPTO = /BITCOIN|BTC|ETHER|\bETH\b|\bSOL\b|SOLANA|XRP|CRYPTO/i;

await evidence("https://mox.com/faqs/mox-invest/", [
  /supports trading of ordinary shares and exchange traded funds \(ETFs\) listed on the HK markets/,
  /supports trading of ordinary shares and certain exchange traded funds \(ETFs\) listed on the US markets/,
  /does not support trading of derivatives and OTC traded securities in the US markets/,
  /only offers HK crypto ETFs denominated in HKD/,
]);
await evidence("https://mox.com/features/mox-invest/", [/leveraged ETFs and inverse ETFs/, /switch between HKD and USD/]);

const hk = await hkexBook();
const left = { reits: 0, cnh: 0, cryptoUsd: [] };
const hkRows = hk.rows.filter((row) => {
  if (/\| Real Estate Investment Trusts \|/.test(row.raw)) { left.reits += 1; return false; }
  if (row.currency === "CNH") { left.cnh += 1; return false; }
  if (row.currency !== "HKD" && row.type === "ETF" && CRYPTO.test(row.raw.split(" | ")[1])) { left.cryptoUsd.push(row.ticker); return false; }
  return true;
});
const us = await usBook({ preferreds: false, closedEnd: false });
const usRows = us.filter((row) => row.type !== "ETN");

const kept = stampRows(withoutObligations([...hkRows, ...usRows]));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type} ${row.currency}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}; left out ${left.reits} REITs, ${left.cnh} RMB counters, USD crypto ETF counters ${left.cryptoUsd.join(" ")}; ` +
    `US left out ${us.report.leftOut.preferreds.length} preferreds, ${us.report.leftOut.closedEnd.length} closed-end funds, ${us.length - usRows.length} ETNs`
);
