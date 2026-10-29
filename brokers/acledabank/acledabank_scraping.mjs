// ACLEDA Bank (Cambodia) sells Cambodia Securities Exchange shares online
// in its own app: "Now investors can buy and sell share (CSX Trade)
// directly on ACLEDA mobile conveniently" (the app's how-to page). The
// trading account is held at ACLEDA Securities Plc., the bank's wholly
// owned broker, settled through a riel savings account at ACLEDA Bank. The
// one place is the CSX, and no list or exception is given, so the
// catalogue is every CSX share that trades, read from the exchange by
// ./csxBook.mjs (Main Board and Growth Board; a share with no trade in 30
// days left out). CSX bonds are not this market; the CSX lists no ETF.
//
//   https://www.acledabank.com.kh/qr/toanchet-manual/trade-buy?h=0&l=eng
//   https://www.acledasecurities.com.kh/as/eng/sr_equities
//
// Fees (ACLEDA Securities' Q&A): "there is a rate of 0.47% (buy & sell) on
// the successful transaction."
//   https://www.acledasecurities.com.kh/as/eng/cu_qna
//
//   node brokers/acledabank/acledabank_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";
import { csxBook } from "./csxBook.mjs";

await pageSays("https://www.acledabank.com.kh/qr/toanchet-manual/trade-buy?h=0&l=eng", [
  /Now investors can buy and sell share \(CSX Trade\) directly on ACLEDA mobile/,
]);
await pageSays("https://www.acledasecurities.com.kh/as/eng/cu_qna", [
  /there is a rate of 0\.47% \(buy &amp; sell\) on the successful transaction/,
], { raw: true });

const { rows } = await csxBook();
if (rows.length < 10) throw new Error(`only ${rows.length} CSX shares`);
for (const ticker of ["ABC", "PWSA", "PPAP"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("acledabank-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
console.error(`${kept.length} CSX shares written`);
