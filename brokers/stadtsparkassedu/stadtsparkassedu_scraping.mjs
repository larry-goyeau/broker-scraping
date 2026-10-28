// What Stadtsparkasse Düsseldorf sells in its S-Neo depot, with no login.
//
//   https://www.sskduesseldorf.de/de/home/privatkunden/wertpapier-und-boerse/s-neo.html
//
// S-Neo is the securities depot inside the "App Sparkasse". The page names
// no list of what it sells: "Große Auswahl an Wertpapieren: Investieren Sie in
// eine breite Auswahl" and "Wählen Sie ETFs, Fonds oder Aktien für Ihr
// Portfolio aus." It names no segment, country or product type it leaves out.
//
// Place: Tradegate, as broker-list.json gives it. The Sparkasse page itself
// does not name the exchange. The S-Neo price of 0.95
// EUR is the price "bei Handel über Tradegate Exchange" (the footnote of the
// S-Neo price quoted by biallo.de,
// https://www.biallo.de/depot/news/s-neo-sparkasse-im-vergleich/).
//
// So the catalogue is the whole Tradegate place: every share, ETF, ETC and
// ETN on Tradegate's two price lists, minus suspended and delisting lines,
// as tradegateBook() reads them (brokers/tradegatedirect/tradegateBook.mjs).
// Every Tradegate line trades in euro. Left out, as in every scraper:
// warrants, certificates, bonds, and open-ended funds ("Fonds" in S-Neo are
// bought from the fund company, not on Tradegate).
//
// Remarks, not removals:
//   - Clients: Sparkasse customers with a Sparkasse Girokonto as the
//     settlement account, adults only
//     (https://www.sparkasse.de/pk/produkte/sparen-und-anlegen/geld-anlegen/depot/s-neo.html).
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and trusts (and the
//     two US closed-end funds on Tradegate's ETP list) and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde does.
//     The 21Shares CH crypto ETPs are notes with a KID and stay open;
//     iShares Core CHF Corporate Bond ETF (CH) is registered for sale in
//     Germany (targobankde) and stays open.
//
// Fees (same page, "Preise und Konditionen"): "Kauf- und Verkaufsorder an der
// Börse: 0,95 Euro"; savings plan for ETFs and funds 0.25 EUR; depot free up
// to 24,999.99 EUR, then 0.10 % p.a. to 49,999.99 EUR and 0.20 % p.a. above.
//
//   node brokers/stadtsparkassedu/stadtsparkassedu_scraping.mjs
//   node brokers/stadtsparkassedu/stadtsparkassedu_scraping.mjs --fresh   (re-read Tradegate)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("stadtsparkassedu-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.list === "etp" && (country === "US" || country === "CA")) return true;
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = await tradegateBook({ fresh: FRESH, log: (m) => console.error(m) });
const rows = book.map((r) => {
  const row = {
    query: r.query, ticker: r.ticker, name: r.name, exchange: r.exchange, mic: r.mic,
    currency: r.currency, type: r.type, isin: r.isin, raw: r.raw,
  };
  if (noKid(r)) row.nonEuResident = true;
  return row;
});
const kept = stampRows(withoutObligations(rows));

if (kept.length < 9000) throw new Error(`only ${kept.length} lines`);
for (const isin of ["US0378331005", "IE00B4L5Y983", "DE0007164600"]) {
  if (!kept.some((r) => r.isin === isin)) throw new Error(`${isin} missing`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byType = {};
for (const r of kept) byType[r.type] = (byType[r.type] || 0) + 1;
console.error(
  `${kept.length} lines on Tradegate (${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
