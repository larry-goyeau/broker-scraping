// What Sparkasse Rosenheim-Bad Aibling sells online as shares, ETFs, ETNs
// and ETCs on the German exchanges and Tradegate, with no login.
//
// Two online depots:
// - The Sparkassen depot, with orders in the Internet-Filiale and the app
//   ("Sie haben die Möglichkeit, an unterschiedlichen Börsenplätzen in
//   Anleihen, Fonds, ETFs, Aktien und Zertifikate zu investieren"), and its
//   cheaper "S-Direktbrokerage" model for orders by internet:
//     https://www.spk-ro-aib.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html
// - S-Neo, the depot inside the "App Sparkasse" ("Wählen Sie ETFs, Fonds
//   oder Aktien für Ihr Portfolio aus"), whose exchange is Tradegate (the
//   S-Neo price is the price "bei Handel über Tradegate Exchange", as
//   ../nassauischespark and ../berlinersparkass quote it):
//     https://www.spk-ro-aib.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html
// The Sparkasse publishes no list of what it sells.
//
// Places: Germany and Tradegate, as broker-list.json gives them. The
// Sparkasse names no German venue ("an deutschen Börsen", "an
// unterschiedlichen Börsenplätzen"), so the German place is every German
// exchange the shared modules read: Börse Xetra (one row per trading
// currency) and Börse Frankfurt through germanyBook()
// (../1822direkt/germanyBook.mjs, Deutsche Börse's tradable-instrument
// files), and Tradegate through tradegateBook()
// (../tradegatedirect/tradegateBook.mjs, Tradegate's own price lists),
// which is also the S-Neo place. Stuttgart, Quotrix/Düsseldorf, Hamburg,
// Hannover, München and gettex publish no instrument file and are not
// read. Foreign exchanges ("Mindestpreis pro Transaktion an ausländ.
// Börsen") are not this broker's places in broker-list.json.
//
// What is sold. No page of the Sparkasse excludes ETFs, ETNs, ETCs, a
// segment or foreign shares listed in Germany, so both places are whole:
// shares (CS lines, ADRs, REITs), ETFs, ETNs and ETCs, minus inactive,
// delisting, not-yet-trading and suspended lines (the modules say how).
// Left out, as in every scraper: warrants, certificates, bonds and debt
// lines (withoutObligations) and Frankfurt's open-ended mutual funds.
//
// Remarks, not removals: no KID, no buy for a retail client in the EEA
// (PRIIPs Regulation 1286/2014 art. 13). US- and Canada-domiciled ETPs and
// Swiss (CH) ETFs have none; they stay and carry `nonEuResident`, as
// targobankde and ../nassauischespark do. The Swiss ETF registered for sale
// in Germany (CH0226976816) stays open.
//
// Fees: Preis- und Leistungsverzeichnis, 4.3 "Transaktionsleistungen
// (Vertriebsweg Berater/Filiale, Telefon, Online)": "Aktien ... 1,00 % vom
// Kurswert", "Mindestpreis pro Transaktion an deutschen Börsen 25,00";
// 4.4 "S-Direktbrokerage": "Wertpapierhandel nach Ziffer 4.3 0,25 % vom
// Kurswert", "Mindestpreise: - Inlandsauftrag per Internet 12,50";
// 4.5 "S-Neo Depot", "Transaktionsleistungen (Vertriebsweg/
// Auftragserteilung Online) - An- und Verkauf von Wertpapieren (Aktien,
// Fonds, Renten) 0,95 je Transaktion".
//   https://www.spk-ro-aib.de/content/dam/myif/sk-rosenheim-bad-aibling/work/dokumente/pdf/preise-leistungen/preis-leistungsverzeichnis.pdf
//
//   node brokers/sparkasserosenhe/sparkasserosenhe_scraping.mjs
//   node brokers/sparkasserosenhe/sparkasserosenhe_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("sparkasserosenhe-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const log = (m) => console.error(m);

const CH_REGISTERED = new Set(["CH0226976816"]);
function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.list === "etp" && (country === "US" || country === "CA")) return true;
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

// The sentences the catalogue rests on.
await pageSays("https://www.spk-ro-aib.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html?n=true", [/S-Neo/, /0,95 Euro/]);
await pageSays("https://www.spk-ro-aib.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html?n=true", [/unterschiedlichen B/]);

const german = await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log });
// skipBrokenInitials: Tradegate's "9" list pages answered HTTP 500 on 28 October 2026.
const tradegate = await tradegateBook({ fresh: FRESH, log, skipBrokenInitials: true });
const book = [...german, ...tradegate];
const rows = book.map(({ list, ...r }) => (noKid({ ...r, list }) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 28000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Börse Xetra"], ["US0378331005", "Tradegate"], ["IE00B4L5Y983", "Tradegate"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`);
