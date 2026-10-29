// What Architect (Architect Securities LLC, a subsidiary of Architect
// Financial Technologies Inc.; executing broker and custodian RQD Clearing)
// sells in shares and exchange-traded funds, with no login. Its Form CRS:
// "Architect customers can use the AFT platform to place orders to buy and
// sell US-listed stocks and exchange-traded funds ("ETFs"), OTC
// securities, corporate and government bonds, mutual funds and options".
// No list of titles and no OTC tier is named.
//
//   https://files.brokercheck.finra.org/crs_328167.pdf
//
// So:
// - United States: the whole US exchange book of the day
//   (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
//   preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
//   American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
//   lines with an open trade halt; warrants, rights, units, when-issued
//   lines and listed notes are left out there; bonds through
//   withoutObligations, mutual funds are not exchange-traded.
// - OTC Markets: no tier is named, so (owner rule, 2026-10-25) the four
//   tiers with a public quote, OTCQX, OTCQB, OTCID and Pink Limited
//   (../moomoous/otcBook.mjs; Grey and Expert Market out).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars; an OTC title is one row on "OTC Markets".
//
// Fees: "Architect does not charge commissions for executing equity trades
// for Customers, but for option transactions does charge .50 cents per
// option contract"; SEC, FINRA TAF and CAT fees are passed on (Form CRS).
//   https://files.brokercheck.finra.org/crs_328167.pdf
//
//   node brokers/architect/architect_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://files.brokercheck.finra.org/crs_328167.pdf", [
  /buy and sell US-listed stocks and exchange-traded funds \("ETFs"\), OTC securities/i,
  /does not charge commissions for executing equity trades/i,
], { pdf: true });

const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...us, ...otc.rows]));
if (rows.length < 20000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("architect-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}; ${otc.summary}`);
