// What tradegate.direct (Tradegate AG, Berlin) sells: shares and ETPs on its
// one place, Tradegate BSX, with no login.
//
//   https://tradegate.direct/aktien
//     "7.000+ Aktien direkt an der Börse handeln", "Direkt an der Tradegate
//     BSX"; "Große Auswahl aus sämtlichen Aktien, die für Privatanleger
//     relevant sind – national wie international".
//   https://tradegate.direct/etps
//     "4.000+ ETPs von 80+ Partner-Emittenten", ETFs, ETCs and ETNs.
//   FAQ (https://tradegate.direct/?showFAQ=true, JSON from
//   https://api.tradegate.direct/recupera/adesso_api/v0/FaqGroup/<id>/Faq)
//     "Ihre Order bei tradegate.direct wird ausschließlich an der Tradegate
//     BSX platziert."
//   Vertragsbedingungen, Stand Oktober 2026
//   (https://api.tradegate.direct/recupera/adesso_api/v0/PublicDocuments/gtc/Download)
//     2.4 Handelsuniversum: the instruments shown in the app "die an einem
//     Ausführungsplatz handelbar sind"; Ausführungsgrundsätze 4: shares,
//     ETPs and structured products all go to "Tradegate BSX".
//
// So the catalogue is the whole Tradegate place: every share, ETF, ETC and
// ETN on Tradegate's two price lists, minus suspended and delisting lines,
// as tradegateBook() reads them (brokers/tradegatedirect/tradegateBook.mjs).
// The broker names no segment, country or product type it leaves out. Every
// Tradegate line trades in euro. Left out, as in every scraper: Mini Futures
// and other derivatives, bonds and open-ended funds (other Tradegate lists).
//
// Remarks, not removals:
//   - Minimum order on a buy: "Mindestordervolumen: 500 Euro auf jede
//     Kauf-Transaktion" (shares, /aktien) and "ETPs schon ab 100 Euro"
//     (/etps); the FAQ repeats 500 EUR for shares and 100 EUR for ETPs.
//   - Clients: "in Deutschland unbeschränkt steuerpflichtig", no US persons
//     (FAQ "Wer darf bei tradegate.direct ein Depot eröffnen?").
//   - No KID, no buy for a retail client in the EEA: the Vertragsbedingungen
//     (I.5) hand over the PRIIPs "Basisinformationsblatt ... vor Annahme der
//     Kauforder". US- and Canada-domiciled ETPs and trusts (and the two US
//     closed-end funds on the ETP list) and Swiss (CH) ETFs have none. They
//     stay and carry `nonEuResident`, as targobankde does. The 21Shares CH
//     crypto ETPs are notes with a KID and stay open; iShares Core CHF
//     Corporate Bond ETF (CH) is registered for sale in Germany (targobankde)
//     and stays open.
//
// Fees: 0 EUR per trade ("0 Euro pro Trade. Dauerhaft keine Ordergebühren
// und keine Börsengebühren", https://tradegate.direct/aktien; Preis- und
// Leistungsverzeichnis, Stand März 2026:
// https://api.tradegate.direct/recupera/adesso_api/v0/PublicDocuments/pricingPerformance/Download).
//
//   node brokers/tradegatedirect/tradegatedirect_scraping.mjs
//   node brokers/tradegatedirect/tradegatedirect_scraping.mjs --fresh   (re-read Tradegate)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { tradegateBook } from "./tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("tradegatedirect-parsed.json", import.meta.url);
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
