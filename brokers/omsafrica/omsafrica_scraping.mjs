// What OMS Africa sells online in shares and exchange-traded funds, with no
// login. OMNI MARCHE SECURITE (OMS) Africa Limited is a Nairobi Securities
// Exchange member. Its Investor Guide says its "Active Trader platform
// connects you directly to the NSE" (omsafrica.kenyaonlinetrading.com) and
// that clients buy or sell "via email or our self-service platform"; a
// mobile app is "Coming Soon". Its Market Access & Execution page offers
// "real-time execution on the Nairobi Securities Exchange" and, vaguely,
// "access to emerging and frontier capital markets across Africa", with no
// exchange named, no tariff and no list, so only the NSE is kept. Bonds and
// Treasury bills are a separate service and are not exchange-traded lines
// of this book. No page excludes a segment, board or product type, so the
// ETFs stay in.
// Fees are in the Investor Guide's charges table: brokerage commission
// "1.76% (Orders/Lots <= KES 100,000)" and "1.36% (Orders/Lots > KES
// 100,000)", plus CMA, NSE and CDSC levies, fund levies and stamp duty.
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars.
//
//   https://www.omsafrica.co.ke/investor-guide
//   https://www.omsafrica.co.ke/our-services/market-access-and-execution
//   https://omsafrica.kenyaonlinetrading.com/ActiveTrader/
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/omsafrica/omsafrica_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

// The NSE page prints SKL as "ISIN: KE9900001216" (not "ISIN CODE:"), which
// the shared pattern misses; fill it here until nseke.mjs reads both forms.
const KNOWN_ISINS = { SKL: "KE9900001216" };

const board = await readNseBoard();
const rows = board.rows.map((row) => (!row.isin && KNOWN_ISINS[row.ticker] ? { ...row, isin: KNOWN_ISINS[row.ticker] } : row));
fs.writeFileSync(new URL("omsafrica-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(nseSummary(board));
