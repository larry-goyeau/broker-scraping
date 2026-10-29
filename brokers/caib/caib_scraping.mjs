// What Capital A Investment Bank (CAIB, Nairobi) sells in shares and
// exchange-traded funds, with no login. CAIB is a Nairobi Securities
// Exchange member. Its equities page: "Place Orders: Call, email, or use
// our online platform to place buy/sell orders", and its app (Capital A
// Investment Bank, App Store) is the mobile channel. The page names no list
// and leaves out no segment or ETFs, so the book is the NSE board, as read
// by ../abccapital/nseke.mjs: shares, preference shares, REITs and ETFs,
// without rights, suspended or stale codes and the restricted LAPR; ALP and
// TRFC trade in US dollars. broker-list.json gives the same single place.
//
// Fees, same page, "Fees & Charges": "Brokerage Commission: As per NSE
// guidelines", "Transaction Levy: 0.12% (CMA/NSE regulatory fees)",
// "All fees are disclosed upfront-no hidden charges". The brokerage rate
// itself is the NSE's published schedule, not printed by CAIB.
//
//   https://caib.co.ke/services/equities/ (offer and fees)
//   https://apps.apple.com/ke/app/capital-a-investment-bank/id6774140400
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/caib/caib_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

await pageSays("https://caib.co.ke/services/equities/", [
  /use our online platform to place buy\/sell orders/,
  /Brokerage Commission: As per NSE guidelines/,
  /Transaction Levy: 0\.12%/,
]);

// The NSE page prints SKL as "ISIN: KE9900001216" (not "ISIN CODE:"),
// which the shared pattern misses (as in ../sbg/sbg_scraping.mjs).
const KNOWN_ISINS = { SKL: "KE9900001216" };

const board = await readNseBoard();
const rows = board.rows.map((row) => (!row.isin && KNOWN_ISINS[row.ticker] ? { ...row, isin: KNOWN_ISINS[row.ticker] } : row));
fs.writeFileSync(new URL("caib-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(nseSummary(board));
