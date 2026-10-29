// What PSD Bank Rhein-Ruhr eG sells as shares, ETFs, ETNs and ETCs on the
// German exchanges, with no login.
//
//   https://www.psd-rhein-ruhr.de/produkte/geldanlage/depot-brokerage/wertpapierdepot.html
//   https://www.psd-rhein-ruhr.de/produkte/geldanlage/depot-brokerage/brokerage.html
// "Das Depot und die Brokerage-Funktionen sind direkt ins PSD OnlineBanking
// und in die PSD BankingApp integriert"; "Handeln Sie einzelne Aktien und
// andere Wertpapiere an deutschen und internationalen Börsen." The bank
// publishes no list of what it sells. The foreign exchanges are not this
// broker's place in broker-list.json ("Germany" only) and are not read.
//
// Venues. A PSD Bank (Volksbanken Raiffeisenbanken group) passes its
// customers' exchange orders to DZ BANK, whose execution policy for private
// clients ("Ausführungsgrundsätze", Tabelle 2: Inländische
// Ausführungsplätze) lists Börse Quotrix, Börse Tradegate, Börse Xetra,
// Börse Frankfurt and Börse Stuttgart, and the regional floors when those
// cannot execute:
//   https://www.dzbank.de/content/dam/dzbank/dokumente/de/Footernavigation_DE/richtlinien-und-informationen/mifid-ii/Ausfuehrungsgrundsaetze_Privatkunden_DE.pdf
// The online brokerage manual of the Atruvia platform the Volksbanken share
// says these can be ordered online: "Aktien, Zertifikate und Optionsscheine
// (alle an einer inländischen Börse und an den wichtigsten ausländischen
// Börsenplätzen sowie zum Teil im Direkthandel zugelassene Wertpapiere)".
//   https://atruvia.scene7.com/is/content/atruvia/20240112_Brokerage_Bedienungsanleitungpdf
// The bank names no German venue of its own, so the German place is every
// German exchange the shared modules read: Börse Xetra (one row per trading
// currency) and Börse Frankfurt through germanyBook()
// (../1822direkt/germanyBook.mjs, Deutsche Börse's tradable-instrument
// files), and Tradegate through tradegateBook()
// (../tradegatedirect/tradegateBook.mjs, Tradegate's own price lists).
// Stuttgart, Quotrix/Düsseldorf, Hamburg, Hannover, München and gettex
// publish no instrument file and are not read; Börse Berlin's floor closed
// on 1 January 2026.
//
// What is sold. No page of the bank excludes ETFs, ETNs, ETCs, a segment or
// foreign shares listed in Germany, so the German place is whole: shares
// (CS lines, ADRs, REITs), ETFs, ETNs and ETCs, minus inactive, delisting,
// not-yet-trading and suspended lines (the modules say how). Left out, as in
// every scraper: warrants, certificates, bonds and debt lines
// (withoutObligations), Frankfurt's open-ended mutual funds ("FUN"), and
// DZ BANK's off-exchange "Direkthandel", which has no exchange book.
//
// Remarks, not removals: no KID, no buy for a retail client in the EEA
// (PRIIPs Regulation 1286/2014 art. 13). US- and Canada-domiciled ETPs and
// Swiss (CH) ETFs have none; they stay and carry `nonEuResident`, as
// targobankde, 1822direkt and volksbankanderni do. The Swiss ETF registered
// for sale in Germany (CH0226976816) stays open.
//
// Fees (wertpapierdepot page, depot models): "Online-Order Grundpreis
// 4,95 €", "Online-Order Variable Gebühr 0,25 %", "Online-Order
// Maximalpreis 69,95 €" ("Berater-Order Grundpreis 30,00 €").
//
//   node brokers/psdbankrheinruhr/psdbankrheinruhr_scraping.mjs
//   node brokers/psdbankrheinruhr/psdbankrheinruhr_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("psdbankrheinruhr-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const log = (m) => console.error(m);

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

// The sentences the catalogue rests on.
await pageSays("https://www.psd-rhein-ruhr.de/produkte/geldanlage/depot-brokerage/wertpapierdepot.html", [/an deutschen und internationalen B.rsen/, /Online-Order Grundpreis/]);

const german = await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log });
// skipBrokenInitials: Tradegate's "9" list pages answered HTTP 500 on 28 October 2026.
const tradegate = await tradegateBook({ fresh: FRESH, log, skipBrokenInitials: true });
const book = [...german, ...tradegate.map(({ list, ...r }) => r)];
const rows = book.map((r) => (noKid(r) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 28000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Börse Xetra"], ["US0378331005", "Börse Frankfurt"], ["IE00B4L5Y983", "Tradegate"], ["US0378331005", "Tradegate"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
