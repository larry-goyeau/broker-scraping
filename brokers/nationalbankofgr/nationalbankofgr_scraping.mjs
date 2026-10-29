// What the National Bank of Greece (Εθνική Τράπεζα) sells online on the
// Athens and Cyprus stock exchanges, with no login.
//
// "Συναλλαγές με Μετοχές Online: Μπορείτε να κάνετε τις συναλλαγές σας στα
// χρηματιστήρια Αθηνών και Κύπρου από τον υπολογιστή ή το κινητό σας";
// "Μπορείτε να διαβιβάζετε εντολές τις συναλλαγές σας σε μετοχές στα
// χρηματιστήρια Αθηνών και Κύπρου, online."
//   https://www.nbg.gr/el/idiwtes/kathimerines-sunallages/digital-banking/dunatotites-internet-mobile-banking/sunallages-me-metoxes-online
//   https://www.nbg.gr/el/idiwtes/apotamieusi-ependuseis/ependutika-programmata/ependuseis/metoxes-xa
// The bank publishes no list of what it sells.
//
// Places: Athens Stock Exchange and Cyprus Stock Exchange, as the pages and
// broker-list.json give them. Each is read whole, as no NBG page narrows
// it; the Athens ETF stays ("all shares" includes the exchange's ETFs):
// - Athens Stock Exchange: the exchange's whole book,
//   ../hellenicamerican/athexBook.mjs (Euronext Athens' own stock and ETF
//   lists: every share of the Main Market, its Surveillance segment and
//   Euronext Growth Athens (EN.A.), and the ETF; minus the lines whose
//   status is not "Active").
// - Cyprus Stock Exchange: the exchange's whole book,
//   ../globalcapitalsec/cyseBook.mjs (the CSE's own closing-price and
//   market-capitalisation pages: every share of the Main, Alternative and
//   Surveillance markets and of the Emerging Companies Market (ECM);
//   minus suspended ("AN") and never-traded lines; ISINs from TradingView's
//   CSECY symbol list; listed funds are dropped by stampRows).
// A title listed in both places (Bank of Cyprus, Eurobank) has one row in
// each.
//
// Fees: "Τιμολόγιο λοιπών εργασιών", "Συναλλαγές Χρηματοπιστωτικών Μέσων
// που διαπραγματεύονται στο Χ.Α. και στο Χ.Α.Κ", "Προμήθεια Λήψης –
// Διαβίβασης & Εκτέλεσης Εντολών": "1.2. Μέσω Internet / Mobile Banking
// (ανεξαρτήτως ποσού) 0,35% με ελάχιστο €8" (branch: 0,50%, minimum €10).
//   https://www.nbg.gr/-/jssmedia/Files/Timologio/web_portal_elliniko_timologio_loipwn_ergasiwn.pdf
//
//   node brokers/nationalbankofgr/nationalbankofgr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { athexBook } from "../hellenicamerican/athexBook.mjs";
import { cyseBook } from "../globalcapitalsec/cyseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("nationalbankofgr-parsed.json", import.meta.url);

// The sentences the catalogue rests on.
await pageSays("https://www.nbg.gr/el/idiwtes/kathimerines-sunallages/digital-banking/dunatotites-internet-mobile-banking/sunallages-me-metoxes-online", [/χρηματιστήρια Αθηνών και Κύπρου, online/]);

const athens = await athexBook();
const cyprus = await cyseBook({ ecm: true });
const kept = stampRows(withoutObligations([...athens.rows, ...cyprus.rows]));
for (const [isin, place] of [["GRS003003035", "Athens Stock Exchange"], ["IE00BD5B1Y92", "Cyprus Stock Exchange"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
if (kept.filter((r) => r.exchange === "Athens Stock Exchange").length < 120) throw new Error("Athens book too small");
if (kept.filter((r) => r.exchange === "Cyprus Stock Exchange").length < 60) throw new Error("Cyprus book too small");
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")})`);
console.error(`Athens left out: ${athens.dropped.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join("; ")}`);
console.error(`Cyprus left out: ${cyprus.dropped.join("; ")}`);
