// What Well Link Securities (立橋證券, Hong Kong; wlsec.com) sells in shares
// and ETFs, with no login. Its securities page:
//   "透過我們的APP交易平臺，客戶可買賣所有香港交易所上市的股票，包括認股證、
//   牛熊證、交易所上市基金(ETF) 以及滬港通及深港通可買賣之A股，以及美股等。"
//   (clients can trade every HKEX-listed stock, warrants, CBBCs and ETFs
//   included, the A-shares tradable through Shanghai and Shenzhen Connect,
//   and US stocks.)
//   https://www.wlsec.com/stock
// Fees: https://www.wlsec.com/commissions (Hong Kong and A-shares 0.028%,
// min HK$28 / RMB28; US US$0.0099 a share). The sister bank Banco Well Link
// (../bancowelllink) is a separate catalogue.
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// less the temporary board-lot counters. Warrants and CBBCs are not shares
// or ETFs and stay out. HKD, USD and RMB (CNH) counters are their own codes
// and keep their currency ("一個賬戶，多個幣種").
//
// China A-shares: the whole Northbound buy-and-sell lists of HKEX
// (./connectBook.mjs), less the suspended lines, the page linking HKEX's
// "View All Eligible Securities" page for them. ChiNext and STAR shares
// stay with a remark, the page saying "創業板及科創版目前僅支援機構專業投資者
// 交易" (ChiNext and STAR are for institutional professional investors only).
//
// United States: Well Link publishes no list, so the whole US exchange
// book of the day (../wellstrade/usBook.mjs; one NBBO market, one row a
// title on its primary listing; warrants, rights, units, listed notes and
// halted lines are left out there) less what the page refuses:
//   "本公司不接受客戶交易或存入美國「公開交易合夥事業類」 (”PTP”) 股票、
//   「場外交易類」(“OTC”) 股票及在美國交易的「虛擬資產交易所買賣基金」
//   (“VA ETF”)。"
// - OTC: usBook holds no OTC Markets line.
// - PTP: the directories carry no tax flag, so a line is a partnership when
//   its name says so (L.P., LP, Limited Partnership, limited partner(ship)
//   interests, partnership units: EPD, ET, MPLX, BIP, AB, BNO, UNG...). A
//   commodity pool whose directory name does not say LP (USO) stays.
// - VA ETF: Well Link's own list ("List of US VA ETFs", 3 June 2026, which
//   says it is not exhaustive) is matched by name: a fund whose name names
//   a coin (Bitcoin, Ether, Solana, XRP, Dogecoin...) or crypto, unless the
//   name says it holds companies (mining, industry, adopters, equity...).
//   Every ticker of that list still in the book is caught this way, but
//   ARKY, renamed "ARK Active Autocallable Income ETF".
//   https://www.wlsec.com/_files/ugd/b0a966_80f446d5ab6b42eb8b7b8cd29ca08442.pdf
// No US venue is named, so every US exchange stays.
//
// The page's "多達 32,000 隻可交易標的" (up to 32,000 tradable products) counts
// every market and product together, not one place, so it is not a per-place
// count to cut to (owner rule of 2026-10-25); the catalogue stays under it.
// Broker-list restrictions checked: "No PTP or OTC stocks; no US-listed
// virtual-asset ETFs" (above, the page's words); "STAR / ChiNext for
// institutional professional investors only" (above); "no B-shares" (the
// Northbound lists hold none).
//
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt, otherlisted.txt
//
//   node brokers/welllink/welllink_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook, connectRemark } from "./connectBook.mjs";
import fs from "node:fs";

const FOLDER = "welllink";
const PAGE = "https://www.wlsec.com/stock";

export const PARTNERSHIP = /\bL\.?\s?P\.?(?=[\s,]|$)|\bLimited Partnership\b|\blimited partner(?:ship)? interests?\b|\bPartnership Units?\b/i;
const COIN = /\b(?:bitcoin|ether|ethereum|solana|xrp|dogecoin|doge|litecoin|avalanche|cardano|polkadot|chainlink|hbar|hedera|sui|stellar|bnb|crypto|cryptocurrency|btc|eth)\b/i;
const COMPANIES = /\b(?:mining|miners|industry|innovators|adopters|corporations|economy|ecosystem|equity premium|companies|infrastructure|thematic|tech|fintech|blockchain technology)\b/i;
export const vaEtf = (row) => row.type !== "STOCK" && COIN.test(row.name) && !COMPANIES.test(row.name);

await evidence(PAGE, [
  /客戶可買賣所有香港交易所上市的股票.{0,40}交易所上市基金\(ETF\)\s*以及滬港通及深港通可買賣之A股，以及美股/,
  /本公司不接受客戶交易或存入美國「公開交易合夥事業類」.{0,20}股票、「場外交易類」.{0,20}股票及在美國交易的「虛擬資產交易所買賣基金」/,
  /創業板及科創版目前僅支援機構專業投資者交易/,
]);

const hk = await hkexBook();
const connect = await connectBook();
const us = await usBook();

const left = { ptp: [], va: [] };
const usRows = us.filter((row) => {
  if (PARTNERSHIP.test(row.name)) { left.ptp.push(row.ticker); return false; }
  if (vaEtf(row)) { left.va.push(row.ticker); return false; }
  return true;
});
for (const ticker of ["EPD", "ET", "MPLX", "IBIT", "FBTC", "ETHA", "BITO"]) {
  if (usRows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} should be left out (PTP or VA ETF)`);
}

const connectRows = connect.rows.map(({ turnover, board, ...row }) => (board ? { ...row, remark: connectRemark(board) } : row));
const rows = [...hk.rows, ...connectRows, ...usRows];
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}, dropped ${hk.dropped.length}; ` +
    `Connect lists ${JSON.stringify(connect.listDates)}, Sina ${connect.quoteDay}, dropped ${connect.dropped.length}, ChiNext/STAR with remark ${connectRows.filter((row) => row.remark).length}; ` +
    `US directories ${JSON.stringify(us.report.directories)}, left out ${left.ptp.length} PTP (${left.ptp.join(" ")}), ${left.va.length} VA ETF (${left.va.join(" ")})`
);
