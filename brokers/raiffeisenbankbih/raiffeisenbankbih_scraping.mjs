// What Raiffeisen BANK d.d. Bosna i Hercegovina sells online, with no
// login: every share on the Sarajevo Stock Exchange (SASE).
//
// Its E-Trading page: "E-Trading is a service through which Raiffeisen BANK
// dd Bosnia and Herzegovina enables you to directly issue trade orders on
// the Sarajevo Stock Exchange (SASE) through the Internet". Its brokerage
// page lists "Trade in securities on the Sarajevo Stock Exchange (SASE)",
// "Receipt of orders for securities listed on the Banja Luka Stock
// Exchange (BLSE)" and "Trade in securities on foreign markets"; only SASE
// is reached through E-Trading, so the Banja Luka Stock Exchange (on
// broker-list.json) and the foreign markets are left out: their orders are
// taken by the bank, not placed online. (Raiffeisen CAPITAL, the group's
// Banja Luka broker, is ../raiffeisenba.)
//
// No page names a segment, board or share class left out, so the catalogue
// is the exchange's book (../unibroker/saseBook.mjs): the Official market
// of companies, Free market subsegments 1, 2 and 3, ordinary and
// preference shares (the ZIF closed-end funds of the Official market of
// funds come back typed FUND and stampRows drops them), less the
// market for issuers in bankruptcy, suspended lines, issuers in bankruptcy
// or liquidation and lines that never traded. Bonds and treasury bills
// stay out. SASE lists no ETF. In convertible marks (BAM, XSSE).
//
//   https://www.raiffeisenbank.ba/en/personal/digital-services/E-Trading.html
//   https://www.raiffeisenbank.ba/en/personal/products/service-to-investors/brokerage-services.html
//   https://www.sase.ba/v1/Tr%C5%BEi%C5%A1te/Emitenti/Uvr%C5%A1teni-vrijednosni-papiri
//
// Fees: https://www.raiffeisenbank.ba/content/dam/rbi/retail/eu/ba/Tarifa%20naknada%20u%20poslovima%20s%20vrijednosnim%20papirima%20V2%203.pdf.coredownload.pdf
// (linked from the Bosnian brokerage page, "Tarifa naknada u poslovima s
// vrijednosnim papirima", V2.3, March 2026: "Transakcije vlasničkim
// vrijednosnim papirima-dionice": 10 KM up to 200 KM, 20 KM to 500 KM, 30
// KM to 2.500 KM, then 1,20 % down to 0,10 % above 10.000.000 KM, minimum
// 35 KM; exchange and registry fees on top).
//
//   node brokers/raiffeisenbankbih/raiffeisenbankbih_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { saseBook, saseLeftOut } from "../unibroker/saseBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

await says("https://www.raiffeisenbank.ba/en/personal/digital-services/E-Trading.html", [
  /directly issue trade orders on the Sarajevo Stock Exchange \(SASE\) through the Internet/,
]);
await says("https://www.raiffeisenbank.ba/en/personal/products/service-to-investors/brokerage-services.html", [
  /Receipt of orders for securities listed on the Banja Luka Stock Exchange \(BLSE\)/,
]);
await says("https://www.raiffeisenbank.ba/bs/stanovnistvo/proizvodi/usluge-investitorima/brokerske-usluge.html", [
  /Tarifa naknada u poslovima s vrijednosnim papirima/,
]);
await pdfAnswers("https://www.raiffeisenbank.ba/content/dam/rbi/retail/eu/ba/Tarifa%20naknada%20u%20poslovima%20s%20vrijednosnim%20papirima%20V2%203.pdf.coredownload.pdf");

const rows = await saseBook();
if (rows.length < 100) throw new Error(`only ${rows.length} Sarajevo lines came back`);
if (rows.some((row) => !row.isin || !/^BA/.test(row.isin))) throw new Error("a Sarajevo line without a Bosnian ISIN stayed in the book");
const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("raiffeisenbankbih-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

const left = await saseLeftOut();
console.error(`raiffeisenbankbih: ${stamped.length} Sarajevo lines written; left out: ${Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}`).join(", ")}`);
