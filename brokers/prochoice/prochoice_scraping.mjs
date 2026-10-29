// What Prochoice Securities (Prochoice Chrimatistiriaki) sells online on
// the Cyprus and Athens stock exchanges, with no login.
//
// "ProChoice stockbrokers offers a wide range of domestic and international
// investment products, providing the investors with the access and ability
// to trade in all the categories of financial products in the Cyprus Stock
// Exchange (CSE) and the Athens Stock Exchange (ASE)."
//   https://www.pro-choice.com.cy/index.php/online-trading
// "ProChoice provides to the investors the "Telemobilo" electronic platform
// for the execution of financial transactions."
//   https://www.pro-choice.com.cy/index.php/online-trading/online-trading-local-markets
// Prochoice publishes no list of what it sells.
//
// Places: Cyprus Stock Exchange and Athens Stock Exchange, as the pages and
// broker-list.json give them, each read whole ("all the categories of
// financial products"):
// - Cyprus Stock Exchange: the exchange's whole book,
//   ../globalcapitalsec/cyseBook.mjs (the CSE's own closing-price and
//   market-capitalisation pages: every share of the Main, Alternative and
//   Surveillance markets and of the Emerging Companies Market (ECM);
//   minus suspended ("AN") and never-traded lines; ISINs from TradingView's
//   CSECY symbol list; listed funds are dropped by stampRows).
// - Athens Stock Exchange: the exchange's whole book,
//   ../hellenicamerican/athexBook.mjs (Euronext Athens' own stock and ETF
//   lists: every share of the Main Market, its Surveillance segment and
//   Euronext Growth Athens (EN.A.), and the ETF; minus the lines whose
//   status is not "Active").
// A title listed in both places (Bank of Cyprus, Eurobank) has one row in
// each.
//
// Fees: "FEES, COMMISSION AND OTHER EXPENSES", "Prochoice online and
// Reception & Transmission of orders in relation to one or more financial
// instruments 0.5 % - 1.50%" (a range at the firm's discretion; the maximum
// is the rate used), "a minimum commission of €2.00 is applied per stock
// transaction in the CSE /ASE".
//   https://www.pro-choice.com.cy/images/pdf/charges_and_fees_2025.pdf
//
//   node brokers/prochoice/prochoice_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { athexBook } from "../hellenicamerican/athexBook.mjs";
import { cyseBook } from "../globalcapitalsec/cyseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("prochoice-parsed.json", import.meta.url);

// The sentences the catalogue rests on.
await pageSays("https://www.pro-choice.com.cy/index.php/online-trading", [/Cyprus Stock Exchange \(CSE\) and the Athens Stock Exchange \(ASE\)/]);

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
