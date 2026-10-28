// What UmweltBank AG (Nürnberg) sells on Börse Frankfurt in its online
// brokerage, with no login.
//
//   https://www.umweltbank.de/investieren/online-brokerage/
//   https://www.umweltbank.de/investieren/depot/
//
// The bank publishes no list of what it sells on the exchange; its own
// "UmweltBank Selektion" is a short list of house funds, ETFs and bonds with
// free custody, not a limit on what can be bought. The online-brokerage page
// says: "Mit Online-Brokerage können Sie nahezu alle börsengehandelten
// Wertpapiere kaufen und verkaufen – ausgenommen Kryptowährungen und
// EUREX-Termingeschäfte." Neither exception is a share or an ETP. The depot
// FAQ says the same for transfers in ("alle börsengehandelten Wertpapiere ...
// Ausgenommen sind Wertpapiere, die über die EUREX gehandelt werden sowie
// Kryptowährungen"). No page names a segment, a country or an ETF exclusion.
//
// Place. The FAQ "An welchen Handelsplätzen kann ich Wertpapierorders
// ausführen?" answers "Sie können an vielen deutschen Börsenplätzen wie zum
// Beispiel der Frankfurter Wertpapierbörse handeln", plus off-exchange
// trading. Frankfurt is the only venue it names, and broker-list.json lists
// Börse Frankfurt only, so the catalogue is Börse Frankfurt (XFRA), read
// through germanyBook() (brokers/1822direkt/germanyBook.mjs, Deutsche Börse's
// own t7-xfra-BF-allTradableInstruments file). Frankfurt trades in EUR only:
// one row per ISIN.
//
// So the catalogue is every share, ETF, ETN and ETC listed on Börse
// Frankfurt, minus inactive, delisting, not-yet-trading and suspended lines
// (germanyBook drops them). Left out, as in every scraper: warrants,
// certificates, bonds, Frankfurt's open-ended funds ("FUN") and debt lines
// (withoutObligations).
//
// Remarks, not removals:
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as edekabank and
//     1822direkt do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//   - The appropriateness test ("Angemessenheitsprüfung") only adds a warning
//     to the order; it removes nothing.
//
// Fees: https://www.umweltbank.de/investieren/depot/ ("Ordergebühren Kauf /
// Verkauf 7,90 € + 0,25 % vom Ordervolumen", for depots opened since
// 01.07.2026) and the Preis- und Leistungsverzeichnis
// https://www.umweltbank.de/download/f003 (Stand 24.09.2026, 8.1.1):
// "börslich gehandelt", Ausführungen im Inland "7,90 EUR zzgl. 0,25 % vom
// Kurswert", plus third-party costs; limit order not executed 2,50 EUR.
// Custody: 0,10 % p.a. funds/ETFs, 0,25 % p.a. shares, Selektion free.
//
//   node brokers/umweltbank/umweltbank_scraping.mjs
//   node brokers/umweltbank/umweltbank_scraping.mjs --fresh   (re-read the venue list)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("umweltbank-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Frankfurt"];

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

if (kept.length < 12000) throw new Error(`only ${kept.length} lines`);
for (const isin of ["DE0007164600", "US0378331005", "IE00B4L5Y983"]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === "Börse Frankfurt")) throw new Error(`${isin} missing on Börse Frankfurt`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[r.type] = (count[r.type] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify(germanyBook.stats));
