// What SBG Securities sells online in shares and exchange-traded funds,
// with no login. SBG Securities, the Standard Bank group stockbroker in
// Kenya, is a Nairobi Securities Exchange member. Its FAQ says iTrader gives
// investors "direct access to investing in the Nairobi Securities Exchange"
// (web: csfs.co.ke/activelite, mobile app, and Mshares on USSD *209#), where
// clients place purchase and sale orders online. SBG is also licensed in
// Uganda and Rwanda, but this FAQ names no online access to those exchanges
// and gives no tariff for them, so only the NSE is kept. Bonds are out:
// "Bond transactions cannot be done online because you need to sign an
// order." No page excludes a share segment, board or ETFs, so ETFs stay in.
// Fees are in the same FAQ ("39. What are the charges for trading in
// shares?"): "For a consideration over Kshs 100,000 - 1.85%", "below Kshs
// 100,000 - 2.12%", "These charges include brokerage commission and
// statutory charges"; "There are no additional charges for trading online."
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars.
//
//   https://www.sbgsecurities.co.ke/sbgsecurities/securities/products-and-services/sbgsecurites-FAQs
//   https://www.csfs.co.ke/activelite/login.aspx
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/sbg/sbg_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

// The NSE page prints SKL as "ISIN: KE9900001216" (not "ISIN CODE:"), which
// the shared pattern misses; fill it here until nseke.mjs reads both forms.
const KNOWN_ISINS = { SKL: "KE9900001216" };

const board = await readNseBoard();
const rows = board.rows.map((row) => (!row.isin && KNOWN_ISINS[row.ticker] ? { ...row, isin: KNOWN_ISINS[row.ticker] } : row));
fs.writeFileSync(new URL("sbg-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(nseSummary(board));
