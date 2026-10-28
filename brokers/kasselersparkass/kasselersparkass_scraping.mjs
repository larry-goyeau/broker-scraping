// What Kasseler Sparkasse sells in its Sparkassen-Depot on the German place,
// with no login.
//
//   https://www.kasseler-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html
//
// The depot page names no list of titles: "Wählen Sie die Anleihen, Fonds,
// Aktien und ETFs aus, in die Sie investieren möchten", and "Sie haben die
// Möglichkeit, an unterschiedlichen Börsenplätzen in Anleihen, Fonds, ETFs,
// Aktien und Zertifikate zu investieren." It names no segment, board,
// country or product type it leaves out, so the catalogue is the whole
// German place.
//
// Places. The Sparkasse names no German venue on its pages (the price list
// only splits "Inland" and "ausländische Börsen"). So the place is the two
// main venues of the Frankfurter Wertpapierbörse, Xetra and Börse
// Frankfurt, as germanyBook() reads them from Deutsche Börse's own daily
// lists of tradable instruments (brokers/1822direkt/germanyBook.mjs). One
// row per title and venue, plus one per trading currency on Xetra (the
// line's own currency). Regional floors, Tradegate, gettex and LS Exchange
// are not added: the bank's pages do not name them.
//
// Left out:
//   - Lines that are not Active, past their last trading day, not yet
//     traded, or under a running FWB suspension (germanyBook).
//   - Warrants, certificates, bonds and Frankfurt's open-ended funds (FUN),
//     as in every scraper; debt lines by withoutObligations().
//
// Remarks, not removals:
//   - Clients: a Kasseler Sparkasse settlement account ("Das
//     Verrechnungskonto wird ebenfalls bei Ihrer Sparkasse geführt").
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none; they stay and carry `nonEuResident`, as targobankde and
//     berlinersparkass do.
//
// Fees. Depot page, "Konditionen" ("Provision je Wertpapierorder (Inland)"):
// Sparkassen-Depot Klassik, "Provision bei Online-Order" 0,50 %, min. 26,50
// Euro "zzgl. Sparkassenspesen (2,00 Euro) sowie fremde Gebühren, Spesen und
// Courtage"; Sparkassen-Depot Flat: orders included in the yearly depot fee
// (1,25 %, min. 39,60 Euro). Full table in "Kundeninformation zum
// Wertpapiergeschäft", page 8 (ETF 0,25 %, max. 60 EUR, plus 10 EUR):
//   https://www.kasseler-sparkasse.de/content/dam/myif/kasseler-spk/work/dokumente/pdf/allgemein/Kundeninformation_Wertpapiergeschaeft.pdf
//
//   node brokers/kasselersparkass/kasselersparkass_scraping.mjs
//   node brokers/kasselersparkass/kasselersparkass_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("kasselersparkass-parsed.json", import.meta.url);
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
const rows = book.map((r) => {
  const row = {
    query: r.query, ticker: r.ticker, name: r.name, exchange: r.exchange, mic: r.mic,
    currency: r.currency, type: r.type, isin: r.isin, raw: r.raw,
  };
  if (noKid(r)) row.nonEuResident = true;
  return row;
});
const kept = stampRows(withoutObligations(rows));

if (kept.length < 15000) throw new Error(`only ${kept.length} lines`);
for (const [isin, mic] of [["DE0007164600", "XETR"], ["IE00B4L5Y983", "XETR"], ["US0378331005", "XFRA"]]) {
  if (!kept.some((r) => r.isin === isin && r.mic === mic)) throw new Error(`${isin} on ${mic} missing`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byVenue = {};
for (const r of kept) {
  const v = (byVenue[r.exchange] ??= {});
  v[r.type] = (v[r.type] || 0) + 1;
}
console.error(
  `${kept.length} lines: ${Object.entries(byVenue).map(([x, t]) => `${x} (${Object.entries(t).map(([k, n]) => `${n} ${k}`).join(", ")})`).join("; ")}; ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
