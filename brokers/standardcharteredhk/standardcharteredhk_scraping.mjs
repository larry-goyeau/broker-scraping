// What Standard Chartered Bank (Hong Kong) sells in shares and ETFs through
// its online stock trading (SC Mobile, Online Banking, SC Equities), with
// no login. Its securities services page: "With just one stock account, you
// can buy and sell U.S. stocks, Hong Kong stocks, and A-shares", and for
// each market the eligible securities:
//   US: "Eligible securities to be included Equities securities and ETFs
//   listed in NASDAQ, New York Stock Exchange (“NYSE”), NYSE AMEX, NYSE ARCA
//   and BATS."
//   Hong Kong: "Eligible stocks for trading Stocks and ETFs listed on SEHK"
//   ("Variety of currencies Trade in HKD, CNY and USD").
//   China A-shares: "The full list of eligible SSE and SZSE securities is
//   published on the HKEx website", with "Northbound Trading of ETFs (SSE)"
//   and "(SZSE)" hours.
//   https://www.sc.com/hk/investment/securities-services/
// Fees (Service Charges, Securities services): HK "Online Banking & SC
// Equities : 0.20% (HK$50 minimum brokerage for each transaction)"; Stock
// Connect "Online Banking: 0.20% (RMB45 minimum ...)"; US "Digital channel:
// 0.20% (USD 18 minimum brokerage for each transaction)".
//   https://av.sc.com/hk/content/docs/hk-service-charges-en.pdf
// No page lists the titles or states how many there are.
//
// Hong Kong: the whole exchange (../primehk/hkexBook.mjs): HKEX's List of
// Securities (Equity, REITs, Exchange Traded Products), less the lines its
// latest daily quotations show suspended, never traded or not quoted, and
// the temporary counters; HKD, USD and RMB (CNH) counters each keep their
// own code and currency. Warrants and CBBCs are not shares or ETFs.
// China A-shares: HKEX's Northbound buy-and-sell lists, the list the page
// points to (../welllink/connectBook.mjs), less the suspended lines. ChiNext
// and STAR shares stay with a remark: Northbound they are for institutional
// professional investors only (HKEX's rule, the broker-list restriction;
// the SC page names no board).
// United States: no list, so the US exchange book of the day
// (../wellstrade/usBook.mjs: one NBBO market, one row a title on its
// primary listing; warrants, rights, units, listed notes and halted lines
// out; no OTC line), cut to the five venues the page names (owner rule:
// named venues only): Nasdaq (XNAS), NYSE (XNYS), NYSE American (XASE),
// NYSE Arca (ARCX), Cboe BZX (BATS). Lines listed on the Texas Stock
// Exchange, NYSE Texas or IEX go. "Equities securities and ETFs": ETNs
// (notes) go; preferred shares and closed-end funds are equity securities
// and stay.
//
//   node brokers/standardcharteredhk/standardcharteredhk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../capitolcredituni/unifimoneyBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook, connectRemark } from "../welllink/connectBook.mjs";
import fs from "node:fs";

const FOLDER = "standardcharteredhk";
const US_VENUES = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS"]);

await evidence("https://www.sc.com/hk/investment/securities-services/", [
  /Equities securities and ETFs listed in NASDAQ, New York Stock Exchange \(.NYSE.\), NYSE AMEX, NYSE ARCA and BATS/,
  /Eligible stocks for trading Stocks and ETFs listed on SEHK/,
  /The full list of eligible SSE and SZSE securities is published on the HKEx website/,
]);

const hk = await hkexBook();
const connect = await connectBook();
const us = await usBook();
const usRows = us.filter((row) => US_VENUES.has(row.mic) && row.type !== "ETN");
const left = { venue: us.filter((row) => !US_VENUES.has(row.mic)).map((row) => `${row.ticker} (${row.mic})`), etn: us.filter((row) => US_VENUES.has(row.mic) && row.type === "ETN").length };

const connectRows = connect.rows.map(({ turnover, board, ...row }) => (board ? { ...row, remark: connectRemark(board) } : row));
const kept = stampRows(withoutObligations([...hk.rows, ...connectRows, ...usRows]));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
console.error(
  `${FOLDER}: ${kept.length} rows ${JSON.stringify(tally(kept, (row) => `${row.mic} ${row.type}`))}; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `HKEX list ${hk.listDate}, quotations ${hk.quoteDate}, dropped ${hk.dropped.length}; ` +
    `Connect lists ${JSON.stringify(connect.listDates)}, Sina ${connect.quoteDay}, dropped ${connect.dropped.length}; ` +
    `US left out ${left.venue.length} lines on venues the page does not name (${left.venue.join(" ")}), ${left.etn} ETNs`
);
