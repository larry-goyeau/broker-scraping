// What Pervanas Securities (Γ.Α. Περβανάς Χρηματιστηριακή) sells online on
// the Athens Stock Exchange, with no login.
//
// "Η Γ.Α. ΠΕΡΒΑΝΑΣ ΧΡΗΜΑΤΙΣΤΗΡΙΑΚΗ Α.Ε.Π.Ε.Υ. παρέχει την δυνατότητα στους
// πελάτες της να προβαίνουν σε ONLINE χρηματιστηριακές συναλλαγές, μέσω
// διαδικτύου. Η υπηρεσία αυτή επιτρέπει στον πελάτη να διαβιβάζει εντολές
// χρηματιστηριακών συναλλαγών (αγορά, πώληση μετοχών)".
//   https://pervanas.gr/online-trading/
// Pervanas publishes no list of what it sells.
//
// Places. broker-list.json gives the Athens Stock Exchange and the United
// States, the latter "By phone/advisor only". The firm's page on foreign
// markets ("Συναλλαγές σε Διεθνή Χρηματιστήρια") says clients can invest
// "μέσω ειδικού ηλεκτρονικού δικτύου ... στις αγορές της Ευρώπης, των ΗΠΑ"
// (the ATHEX XNET network the firm's desk uses) and asks them to call
// ("Παρακαλούμε πολύ, επικοινωνείτε στο τηλέφωνο 210 3727200"); the online
// service page names no foreign market. Only what can be bought online is
// kept, so the US is left out.
//   https://pervanas.gr/synallages-se-diethni-xrimatistiria/
// - Athens, read whole: ../hellenicamerican/athexBook.mjs (Euronext Athens'
//   own stock and ETF lists: every share of the Main Market, its
//   Surveillance segment and Euronext Growth Athens (EN.A.), and the ETF;
//   minus the lines whose status is not "Active"). "All shares" includes
//   the exchange's ETF.
//
// Fees: "Πληροφόρηση πελατών για ν.3606/2007": "Η προμήθεια της Εταιρίας
// μας ... μπορεί να είναι σταθερή ή κλιμακούμενη και δεν υπερβαίνει το 1,3%
// της αξίας των συναλλαγών" (the maximum is the rate used).
//   http://pervanas.gr/wp-content/uploads/2025/10/ΠΛΗΡΟΦΟΡΗΣΗ-ΠΕΛΑΤΩΝ-ΓΙΑ-Ν3606-2007.pdf
//
//   node brokers/pervanas/pervanas_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { athexBook } from "../hellenicamerican/athexBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("pervanas-parsed.json", import.meta.url);

// The sentences the catalogue rests on.
await pageSays("https://pervanas.gr/online-trading/", [/ONLINE χρηματιστηριακές συναλλαγές/, /πώληση μετοχών/]);

const athens = await athexBook();
const kept = stampRows(withoutObligations([...athens.rows]));
for (const [isin, place] of [["GRS003003035", "Athens Stock Exchange"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
if (kept.filter((r) => r.exchange === "Athens Stock Exchange").length < 120) throw new Error("Athens book too small");

fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")})`);
console.error(`Athens left out: ${athens.dropped.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join("; ")}`);

