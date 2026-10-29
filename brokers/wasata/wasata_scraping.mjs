// What Wasata Financial Securities (Doha) sells in shares and ETFs, with no
// login: every Qatar Stock Exchange share and ETF open to trade, its one
// place. The site offers "E-trade" (etrade.wasata.qa) and an app; the
// individual account-opening form describes the "service of trading via
// internet" by which "the orders are sent directly to Qatar Stock Exchange
// via company's electronic trading system", and names no other market. No
// page names a list of its own or excludes a board, so the book is the
// exchange's own market watch, read by ../globalsecurities/qseBook.mjs
// (what is kept and left out is written there). Everything trades in
// riyals.
//
// Fees: no page prints a rate. The individual account-opening form (the
// broker's own PDF) binds the client "to pay all the applicable commission
// set by the Wasata Financial Securities Co. for the sale and purchase
// transactions in accordance with Qatar Exchange Rulebook and QFMA". QSE
// commission is the exchange's fixed rate, the same at every broker: 0.275%
// of the traded value with no minimum since 16 March 2025 (see
// ../qsc/qsc_cost.mjs, which reads its broker's form the same way). The run
// checks that the form is still served (its text is compressed).
//
//   https://www.wasata.qa/
//   https://www.wasata.qa/wp-content/uploads/2025/12/Wasata-Account-Opening-form-Individuals-2025.pdf
//
//   node brokers/wasata/wasata_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { qseBook } from "../globalsecurities/qseBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HOME = "https://www.wasata.qa/";
const FORM = "https://www.wasata.qa/wp-content/uploads/2025/12/Wasata-Account-Opening-form-Individuals-2025.pdf";

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

const home = await (await get(HOME)).text();
if (!/etrade\.wasata\.qa/.test(home) || !/E-trade/.test(home)) throw new Error(`${HOME} no longer offers E-trade`);
const form = Buffer.from(await (await get(FORM)).arrayBuffer());
if (form.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${FORM} is no longer a PDF`);

const { rows, leftOut } = await qseBook();
const kept = stampRows(withoutObligations(rows));
const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
if ((count.STOCK || 0) < 45 || (count.ETF || 0) < 2) throw new Error(`short QSE book ${JSON.stringify(count)}`);
fs.writeFileSync(new URL("wasata-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `wasata: ${kept.length} rows (Qatar Stock Exchange ${Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ")}). ` +
    `Left out: ${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
