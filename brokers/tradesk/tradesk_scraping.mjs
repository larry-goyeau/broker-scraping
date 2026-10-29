// What Tradesk (Tradesk Securities, Inc.) sells in shares and
// exchange-traded funds, with no login. Its Form CRS: "an on-line trading
// platform for them to enter their unsolicited orders to buy or sell stocks
// and ETFs and/or to open and close equity options contracts" and "We offer
// NYSE- and NASDAQ-listed stocks, ETFs, options and American depositary
// receipts ("ADRs")". No list of titles is published.
//
//   https://www.tradesk.co/pdf/tradesk-form-crs-July-2026.pdf
//
// A closed list of two exchanges (owner rule, 2026-10-25): the catalogue is
// the US exchange book of the day (../wellstrade/usBook.mjs) cut to the
// titles listed on them, "NYSE" read as the NYSE-named markets (NYSE, NYSE
// American, NYSE Arca, where most ETFs list, and NYSE Texas) and Nasdaq
// (NYSE_NASDAQ in ../tfcapital/usTop.mjs); Cboe BZX and Texas Stock
// Exchange listings are left out. Shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds and ETFs are kept; ETNs are left out (notes,
// not one of the four kinds named); warrants, rights, units, when-issued
// lines and listed notes are left out in usBook, bonds by
// withoutObligations. No OTC lines. The US is one NBBO market: one row per
// title on its primary listing, in dollars.
//
// Fees: "For transactions in stocks, options and ETFs on Tradesk's on-line
// trading platform, there are no commissions. Options transaction on the
// platform incur a contract fee. Additionally, there pass through
// regulatory fees." (Form CRS)
//   https://www.tradesk.co/pdf/tradesk-form-crs-July-2026.pdf
//
//   node brokers/tradesk/tradesk_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.tradesk.co/pdf/tradesk-form-crs-July-2026.pdf", [
  /We offer NYSE- and NASDAQ-listed stocks, ETFs, options and American depositary receipts/i,
  /on Tradesk's on-line trading platform, there are no commissions/i,
], { pdf: true });

const book = await usBook();
const left = {};
const kept = [];
for (const row of book) {
  if (!NYSE_NASDAQ.has(row.mic)) left[`listed on ${row.mic}`] = (left[`listed on ${row.mic}`] || 0) + 1;
  else if (row.type === "ETN") left.ETN = (left.ETN || 0) + 1;
  else kept.push(row);
}
const rows = stampRows(withoutObligations(kept));
if (rows.length < 9000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("tradesk-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}; left out ${JSON.stringify(left)}`);
