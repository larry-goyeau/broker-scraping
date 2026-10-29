// What Beltone Securities sells in shares and exchange-traded funds online,
// with no login. Beltone Securities Brokerage is a member of the Egyptian
// Exchange; Beltone Trade (beltonetrade.com) is its online platform ("A
// Beltone Securities Brokerage online platform") and its terms speak of the
// trades "the Financial Regulatory Authority (FRA) and the Egyptian Stock
// Exchange (EGX) cancel". It prints no list of what can be traded, so the
// place is the whole EGX listing: the price ticker of Al Rowad's TEA
// Computers e-trade site, every line the exchange's trading system quotes,
// read and filtered by ../rowad/egxboard.mjs. Shares and the EGX 30 index
// ETF are kept; listed mutual and real-estate fund certificates,
// subscription rights and sukuk are other products and are not written.
//
// Beltone's account forms also name a Global Depositary Receipts service
// and a foreign-securities service, but nothing says they are online and
// the broker list gives the Egyptian Exchange only, so London GDRs and
// foreign lines are not written.
//
// Fee (owner's rule "no fees, no scraper"), Beltone Trade FAQ:
//   "What is the company's brokerage commission? The brokerage commission
//    is 0.5%."  https://beltonetrade.com/Static/FAQ
//
//   https://beltonetrade.com/
//   https://beltonetrade.com/Static/FAQ
//   https://beltonetrade.com/Static/TermsAndConditions
//   https://beltonetrade.com/Static/Disclaimer
//
//   node brokers/beltone/beltone_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, pageText, tickerBoard } from "../rowad/egxboard.mjs";

const BOARD = "https://alrowadonline.com/NewLogin.aspx";
const EVIDENCE = [
  ["https://beltonetrade.com/Static/FAQ", /The brokerage commission is 0\.5%/],
  ["https://beltonetrade.com/Static/TermsAndConditions", /Egyptian Stock Exchange \(EGX\)/],
];

const text = (html) => clean(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
for (const [url, pattern] of EVIDENCE) {
  if (!pattern.test(text(await pageText(url)))) throw new Error(`${url} no longer says ${pattern}`);
}

const rows = finish(await tickerBoard(BOARD), "Beltone");
fs.writeFileSync(new URL("beltone-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
