// What EQT (Old Mutual Wealth's self-directed platform, formerly My Wealth
// Trader) sells on its only place here, the JSE, with no login. Its page
// says EQT gives "direct access to local and global markets" across "local
// and offshore investments", and the brochure linked from it promises
// "over 60 000 instruments across global markets" and "a world of
// investment options – from structured notes and managed funds to exchange
// traded funds (ETFs), unit trusts and more". Local means the JSE: the page
// names no other South African exchange (no A2X, CTSE or ZARX), and
// broker-list.json gives one place, South Africa, with no restriction. EQT
// publishes no security list of its own (the platform,
// trader.oldmutualwealth.co.za, is behind a login), so the book is the
// whole JSE: every share (Main Board and AltX, inward listings included),
// every ETF and every ETN / actively managed certificate (the "structured
// notes" of the brochure), as read by ../eqt/jseBook.mjs, which also
// drops the suspended, delisted and never-traded lines (written there).
// Unit trusts and managed funds are not exchange-traded and are not this
// market. Everything trades in rand.
//
// Fees, on the same page, column "Local": brokerage 0.25% per trade,
// custody 0.05% p.a. (minimum R25 p.m.), forex 0.25% per trade; "no
// platform access fees and no minimum account balance requirements".
//
//   https://www.oldmutual.co.za/wealth/eqt/   (product and fees)
//   https://www.oldmutual.co.za/om-docs/blt79d5f271f2c82551/EQT_brochure.pdf
//
//   node brokers/eqt/eqt_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { jseBook } from "./jseBook.mjs";
import fs from "node:fs";

const { rows, dropped, unchecked } = await jseBook();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("eqt-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(counts);
console.error(`${kept.length} JSE lines written; ${dropped.length} dropped, ${unchecked.length} ETNs kept without trade data`);
