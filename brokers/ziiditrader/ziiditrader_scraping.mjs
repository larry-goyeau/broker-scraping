// What Ziidi Trader sells, with no login. Ziidi Trader is Safaricom's
// share-trading product inside the M-PESA app, launched in February 2026.
// Its terms say it "allows M-PESA Customers to digitally buy and sell shares
// listed on the Nairobi Securities Exchange", and "Trading" means "the buying
// and selling of Listed Securities using Ziidi Trader". Orders are executed
// by the licensed stockbroker behind the product, at launch Kestrel Capital
// (EA) Limited, through an omnibus nominee account; cash moves in and out of
// M-PESA. The terms name no other exchange and no excluded segment, board or
// product type, so the ETFs stay in.
// Fees are in section 10 of the same terms, "Fees, Charges and Expenses":
// "a brokerage commission at the rate of 1.5% of the trade value", plus the
// CMA, NSE and CDSC levies, investor compensation and guarantee fund levies
// and stamp duty.
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars
// (the terms do not exclude them, though M-PESA funding is in shillings).
//
//   https://www.safaricom.co.ke/media-center-landing/terms-and-conditions/terms-and-conditions-for-the-ziidi-trader-product
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/ziiditrader/ziiditrader_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

// The NSE page prints SKL as "ISIN: KE9900001216" (not "ISIN CODE:"), which
// the shared pattern misses; fill it here until nseke.mjs reads both forms.
const KNOWN_ISINS = { SKL: "KE9900001216" };

const board = await readNseBoard();
const rows = board.rows.map((row) => (!row.isin && KNOWN_ISINS[row.ticker] ? { ...row, isin: KNOWN_ISINS[row.ticker] } : row));
fs.writeFileSync(new URL("ziiditrader-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(nseSummary(board));
