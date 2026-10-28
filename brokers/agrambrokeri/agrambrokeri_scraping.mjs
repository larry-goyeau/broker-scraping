// What Agram Brokeri d.d. (Zagreb, Croatia) sells online, with no login:
// the shares and ETFs listed on the Zagreb Stock Exchange.
//
// Agram is a ZSE member and trades only the home market. Its securities
// trading page says the service "obuhvaća kupnju i prodaju vrijednosnih
// papira koji kotiraju na Zagrebačkoj burzi d.d.", and its account page
// gives "mogućnost trgovanja vrijednosnim papirima na tržištu Republike
// Hrvatske". The online platform (Agram Trader) offers "Real-time praćenje
// cijena na ZSE".
//
//   https://www.agram-brokeri.hr/trgovanje-vrijednosnicama/1790
//   https://www.agram-brokeri.hr/internet-trgovanje-1794/1794
//
// The general terms (art. 9) accept a buy order only when the securities
// "kotiraju na burzi ili uređenom javnom tržištu vrijednosnih papira". The
// Progress Market is ZSE's MTF, not a regulated market, and Agram never
// names it, so it gets no row (zseListings() without { progress: true }).
//
//   https://www.agram-brokeri.hr/UserDocsImages/Arhiva/UserDocsImages/Dokumenti%20za%20euro/Op%C4%87i%20uvjeti%20za%20obavljanje%20brokerskih%20poslova01.03.2025_.pdf
//
// Agram names no segment, board or ETF exclusion, so the catalogue is the
// whole regulated market: listed ordinary and preference shares (Prime,
// Official and Regular segments) are STOCK and listed ETFs are ETF. Out, as
// in other scrapers: bonds and bills (the tariff prices them apart),
// certificates, rights (tariff "Kupnja i prodaja prava"), delisted,
// suspended, never-traded and in-liquidation lines. ./zseBook.mjs reads the
// exchange's own register, price list and suspension decisions.
//
// Currency: ZSE trades in euro, and the tariff is in euro.
//
// Fees ("Cjenik usluga", in force from 27.11.2024): "DOMAĆE TRŽIŠTE -
// DIONICE", internet trading, Model 1 from 0.30% to 0.40% with a 3.33 EUR
// minimum, or Model 2 at 4.27 EUR + 0.27%.
//
//   https://www.agram-brokeri.hr/UserDocsImages/Arhiva/UserDocsImages/Dokumenti%20za%20euro/Cjenik%20usluga%2027.11.2024.pdf
//
//   node brokers/agrambrokeri/agrambrokeri_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { zseListings, ZSE } from "./zseBook.mjs";
import fs from "node:fs";

const { rows, leftOut, listed, priceListDay } = await zseListings();

if (rows.length < 50 || !rows.some((row) => row.ticker === "HT") || !rows.some((row) => row.type === "ETF")) {
  throw new Error(`the ZSE book looks wrong: ${rows.length} rows, HT or every ETF missing`);
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("agrambrokeri-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const unresolved = kept.some((row) => !resolveVenue(row).venue) ? `${ZSE.exchange}/${ZSE.mic}/${ZSE.currency}` : "none";
console.error(
  `${kept.length} ZSE listings in EUR (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}) ` +
    `of ${listed} listed shares and ETFs, price list of ${priceListDay}. Left out: ${leftOut.length ? leftOut.join("; ") : "none"}. ` +
    `Unresolved: ${unresolved}.`
);
