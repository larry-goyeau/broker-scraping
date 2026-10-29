// What Global Capital Securities and Financial Services sells online on the
// Cyprus and Athens stock exchanges, with no login.
//
// "Global Capital Securities and Financial Services Limited is a fully
// licensed member of the Cyprus Stock Exchange and the Athens Stock
// Exchange. Provides full electronic order execution services in both
// exchanges through marketOrder platform." Global Capital publishes no
// list of what it sells.
//   https://www.globalcapital.com.cy/services
// Its other markets ("access to global markets through the Interactive
// Brokers", "Other Markets (Beta Securities)") are not this broker's places
// in broker-list.json and are not read.
//
// Places: Cyprus Stock Exchange and Athens Stock Exchange, as the page and
// broker-list.json give them, each read whole (no page narrows them):
// - Cyprus Stock Exchange: the exchange's whole book, ./cyseBook.mjs (the
//   CSE's own closing-price and market-capitalisation pages: every share of
//   the Main, Alternative and Surveillance markets and of the Emerging
//   Companies Market (ECM), which the fee table prices as "CSE (ECM)";
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
// Fees: "Table of Commissions and Charges (valid from 1 March 2026)",
// linked from the pricing-policy page: "Brokerage Commissions ... CSE (Main
// Market) 0,50 with minimum €5", "CSE (ECM) 1,00 with minimum €5", "ASE
// 0,50 with minimum €5" (% on value of each transaction), plus "Reception
// and transmission of client orders - All clients €2 per symbol /order".
//   https://www.globalcapital.com.cy/client-info/pricing-policy
//   https://drive.google.com/file/d/1nCWsb2cv7ivwtN9pYms42RC2Y-MsL_Zu/view
//
//   node brokers/globalcapitalsec/globalcapitalsec_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { athexBook } from "../hellenicamerican/athexBook.mjs";
import { cyseBook } from "./cyseBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("globalcapitalsec-parsed.json", import.meta.url);

// The sentences the catalogue rests on.
await pageSays("https://www.globalcapital.com.cy/services", [/full electronic order execution services in both exchanges/]);

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
