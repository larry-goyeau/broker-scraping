// What Berliner Volksbank sells on the German exchanges, with no login.
//
//   https://www.berliner-volksbank.de/privatkunden/banking-apps/brokerage.html
//   https://www.berliner-volksbank.de/privatkunden/anlegen-sparen/depot.html
//
// The online brokerage is the DZ BANK brokerage of the Volksbanken
// Raiffeisenbanken, inside OnlineBanking and the VR Banking App ("Handeln
// Sie Wertpapiere oder verwalten Sie Sparpläne, wo immer Sie möchten";
// "So haben Sie die Welt der Aktien, ETFs und Co. immer dabei"). The bank
// publishes no list of what it sells; the brokerage page says "Weltweit
// Wertpapiere handeln" with "Kurse von nationalen und internationalen
// Börsen in Echtzeit". No page names a segment, a country or a product type
// it leaves out; broker-list.json names no restriction either.
//
// Places. No page names the German exchanges one by one, so the places are
// the default German venues, Börse Xetra and Börse Frankfurt, as
// germanyBook() reads them (brokers/1822direkt/germanyBook.mjs). Tradegate,
// gettex and the regional floors are not named by the bank and stay out.
// Orders on foreign exchanges ("Zuschlag für Orders an ausländischen
// Börsenplätzen 30,00 €") are another place.
//
// So the catalogue is the whole German place on those two venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and
// suspended lines. Left out, as in every scraper: warrants, certificates,
// bonds, Frankfurt's open-ended funds ("FUN") and debt lines
// (withoutObligations).
//
// Remarks, not removals:
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde and
//     1822direkt do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//
// Fees: https://atruvia.scene7.com/is/content/atruvia/preisverzeichnis-wertpapierdienstleistungenpdf
// (Preis- und Leistungsverzeichnis für Wertpapierdienstleistungen, Stand
// 19.05.2026, 1.1): Depot Aktiv "Online-Order ... 4,90 € zzgl. 0,250 % vom
// Kurswert, insgesamt mind. 9,90 €" (39,00 € cap only in the closed Paket
// Profi), plus third-party costs; same figures on the Depot Aktiv page.
//
//   node brokers/berlinervolksban/berlinervolksban_scraping.mjs
//   node brokers/berlinervolksban/berlinervolksban_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("berlinervolksban-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Xetra", "Frankfurt"];

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = await germanyBook({ venues: VENUES, fresh: FRESH, log: (m) => console.error(m) });
const rows = book.map((r) => (noKid(r) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 20000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Börse Xetra"], ["US0378331005", "Börse Frankfurt"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify(germanyBook.stats));
