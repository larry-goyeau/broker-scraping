// What Neo Menkul Değerler (the "ortak" app) sells online, with no login:
// every share and exchange-traded fund on Borsa Istanbul, and the US shares
// and ETFs, a place for which it publishes no list.
//
// Its home page offers, in the app, "Borsa İstanbul" ("Borsa İstanbul'un
// yıldızlarına yatırım yap") and "ABD Borsası" ("Dünyanın en büyük
// şirketlerini anında keşfet"), and its fee table prices both: "Pay
// Piyasası Komisyon Oranı" and "ABD Borsaları Komisyon Oranı". (The same
// page still carries an older line saying Borsa İstanbul and international
// shares are coming soon to ortak; the fee table and the product tiles are
// taken as current.)
//
// Borsa Istanbul. No page names a board, segment or fund left out, so the
// catalogue is the exchange's list (../halkyatrm/bistBook.mjs): KAP's
// listed companies and BYF funds with TradingView's names and ISINs,
// checked against Borsa Istanbul's end-of-day equity bulletin, which drops
// suspended lines and lines no longer traded. Warrants, rights,
// certificates and bonds stay out. In lira (BIST, XIST).
//
// United States. "ABD Borsaları" names no exchange and no count, so the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on the US exchanges, less
// the lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). One NBBO
// market: one row per title, on its primary listing, in dollars.
//
//   https://www.neomenkul.com.tr/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.neomenkul.com.tr/ucret-ve-komisyonlar (its PDF,
// "Azami Oranlar/Tutarlar": "Pay Piyasası Komisyon Oranı İşlem tutarı
// üzerinden ‰0,5 (On binde beş)"; "ABD Borsaları Komisyon Oranı 250 lota
// kadar Sabit 1,5 USD, 251 lot ve üzeri Lot başına 0.006 USD"; plus 5 %
// BSMV).
//
//   node brokers/neomenkul/neomenkul_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

await says("https://www.neomenkul.com.tr/", [/Borsa İstanbul'un yıldızlarına yatırım yap/, /ABD Borsası/]);
const { text: feePage } = await says("https://www.neomenkul.com.tr/ucret-ve-komisyonlar", [/pdfUrl = '[^']+\.pdf'/], { raw: true });
await pdfAnswers(feePage.match(/pdfUrl = '([^']+\.pdf)'/)[1]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const rows = stampRows(withoutObligations([...bist.rows, ...us]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("neomenkul-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`neomenkul: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report?.directories)}`
);
