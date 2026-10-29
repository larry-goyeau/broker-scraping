// What GalaxyOne Brokerage (GalaxyOne Holdings LLC; broker FIN2, clearing
// and custody DriveWealth LLC) sells in shares and exchange-traded funds,
// with no login. Its brokerage page: "Buy and sell U.S. equities - stocks
// and ETFs - with no fees" and "Trade Commission-Free Buy and sell U.S.
// stocks, ETFs, and OTC securities with zero commissions and no account
// minimums". No list of titles and no exchange or OTC tier is named.
//
//   https://www.galaxy.app/product/brokerage
//
// So:
// - United States: the whole US exchange book of the day
//   (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
//   preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
//   American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
//   lines with an open trade halt; warrants, rights, units, when-issued
//   lines and listed notes are left out there, bonds by withoutObligations.
// - OTC Markets: no tier is named, so (owner rule, 2026-10-25) the four
//   tiers with a public quote, OTCQX, OTCQB, OTCID and Pink Limited
//   (../moomoous/otcBook.mjs; Grey and Expert Market out).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars; an OTC title is one row on "OTC Markets".
//
// Fees: "Commission-free trading refers to $0 commissions for self-directed
// individual cash brokerage accounts on U.S.-listed equities and ETFs.
// Other fees and ..." (page notes); "zero commissions" on stocks, ETFs and
// OTC securities (features).
//   https://www.galaxy.app/product/brokerage
//
//   node brokers/galaxyone/galaxyone_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.galaxy.app/product/brokerage", [
  /Buy and sell U\.S\. stocks, ETFs, and OTC securities with zero commissions/i,
  /\$0 commissions for self-directed individual cash brokerage accounts on U\.S\.-listed equities and ETFs/i,
  /DriveWealth/,
]);

const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...us, ...otc.rows]));
if (rows.length < 20000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("galaxyone-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}; ${otc.summary}`);
