// What Unibroker (Unibroker d.o.o. Sarajevo) sells on the Sarajevo Stock
// Exchange, with no login. Its only place is SASE: its client guide offers
// "posredovanja u kupovini i prodaji dionica i ostalih vrijednosnih papira
// na Sarajevskoj berzi" (brokering the purchase and sale of shares and
// other securities on the Sarajevo exchange), its services page "izvršavanje
// tih naloga na berzi" (executing the orders on the exchange), and its
// e-Trading application "trgovanja vrijednosnim papirima na berzi putem
// interneta". Its SASE page describes how both the auction lines (the free
// market's secondary segment and the bankruptcy market) and the continuous
// lines (Official market and primary free market) trade, without leaving
// any board aside. No page names a segment, board, share class or the
// closed-end funds as out, so the catalogue is the whole Sarajevo share
// book: Official market of companies and of funds (the ZIF closed-end
// funds, typed FUND), Free market subsegments 1, 2 and 3, ordinary and
// preference shares.
//
//   https://www.unibroker.ba/uputstvo.html
//   https://www.unibroker.ba/usluge.html
//   https://www.unibroker.ba/trgovanje-sase.html
//   https://www.unibroker.ba/e-trading.html
//   fees: https://www.unibroker.ba/doc/TarifenaknadaUnibroker04072024.docx
//         (from https://www.unibroker.ba/cjenovnik.html: shares 1.75 % up
//          to KM 5,000, down to 0.20 % above KM 10 million, a one-off KM 10
//          for the first order; exchange, registry and custody costs extra)
//
// Left out, as the shared book does: bonds and treasury bills (on the
// tariff but not in this catalogue), every line of the market for issuers
// in bankruptcy proceedings, suspended lines, issuers in bankruptcy or
// liquidation, and lines that never traded. A delisted line is no longer
// in the exchange's list. SASE lists no ETF, ETN or ETC. Every line trades
// in convertible marks (BAM). The book and the ISINs come from the
// exchange through ./saseBook.mjs (https://www.sase.ba, listed securities
// and issuer profiles).
//
//   node brokers/unibroker/unibroker_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { saseBook, saseLeftOut } from "./saseBook.mjs";

const OUTPUT = new URL("unibroker-parsed.json", import.meta.url);

const rows = await saseBook();
if (rows.length < 100) throw new Error(`only ${rows.length} Sarajevo lines came back`);
if (rows.some((row) => !row.isin || !/^BA/.test(row.isin))) throw new Error("a Sarajevo line without a Bosnian ISIN stayed in the book");

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const left = await saseLeftOut();
const summary = Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}`).join(", ");
console.error(`${stamped.length} Sarajevo lines written; left out: ${summary}`);
